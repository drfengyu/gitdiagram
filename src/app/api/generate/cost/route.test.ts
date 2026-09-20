// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitHubRequestError } from "~/server/generate/github-errors";

const mocks = vi.hoisted(() => ({
  estimateCost: vi.fn(),
  getGithubData: vi.fn(),
  resolveRequestCredentials: vi.fn(),
  consumeInfrastructureRateLimit: vi.fn(),
}));

vi.mock("~/server/generate/rate-limit", () => ({
  consumeGenerationInfrastructureRateLimit:
    mocks.consumeInfrastructureRateLimit,
  getGenerationInfrastructureRateLimitMessage: vi.fn(
    () => "Too many repository requests.",
  ),
}));

vi.mock("~/server/generate/cost-estimate", () => ({
  estimateGenerationCost: mocks.estimateCost,
}));
vi.mock("~/server/generate/complimentary-gate", () => ({
  getComplimentaryModelMismatchMessage: vi.fn(() => "Model mismatch."),
  getComplimentaryProviderMismatchMessage: vi.fn(() => "Provider mismatch."),
  isComplimentaryGateEnabled: vi.fn(() => false),
  modelMatchesComplimentaryFamily: vi.fn(() => true),
}));
vi.mock("~/server/generate/github", () => ({
  getGithubData: mocks.getGithubData,
  REPOSITORY_TOO_LARGE_ERROR:
    "仓库过大(超过 195k tokens)，无法分析，请换小一些的仓库。",
}));
vi.mock("~/server/generate/model-config", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getModel: vi.fn(() => "gpt-5.6-terra"),
  getProvider: vi.fn(() => "openai"),
  shouldUseExactInputTokenCount: vi.fn(() => true),
}));
vi.mock("~/server/http/request-credentials", () => ({
  resolveRequestCredentials: mocks.resolveRequestCredentials,
}));

import { POST } from "~/app/api/generate/cost/route";

function request() {
  return new Request("https://gitdiagram.com/api/generate/cost", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://gitdiagram.com",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify({ username: "openai", repo: "openai-node" }),
  });
}

describe("POST /api/generate/cost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consumeInfrastructureRateLimit.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      consumed: true,
    });
    mocks.resolveRequestCredentials.mockImplementation(
      async (
        _request: Request,
        {
          apiKey,
          githubPat,
        }: {
          apiKey?: string;
          githubPat?: string;
        },
      ) => ({ apiKey, githubPat }),
    );
    mocks.getGithubData.mockResolvedValue({
      defaultBranch: "main",
      fileTree: "src/index.ts",
      pathTypes: new Map([["src/index.ts", "blob"]]),
      readme: "# OpenAI Node",
      isPrivate: false,
      stargazerCount: 10,
    });
  });

  it("uses cookie credentials when the compatibility body fields are absent", async () => {
    mocks.resolveRequestCredentials.mockResolvedValueOnce({
      apiKey: "cookie-openai-key",
      githubPat: "cookie-github-pat",
    });
    mocks.estimateCost.mockResolvedValue({
      costSummary: { display: "$0.0100 USD" },
      pricingModel: "gpt-5.6-terra",
      estimatedInputTokens: 100,
      estimatedOutputTokens: 200,
      pricing: {
        inputPerMillionUsd: 1,
        outputPerMillionUsd: 2,
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.resolveRequestCredentials).toHaveBeenCalledWith(
      expect.any(Request),
      { apiKey: undefined, githubPat: undefined },
    );
    expect(mocks.getGithubData).toHaveBeenCalledWith(
      "openai",
      "openai-node",
      "cookie-github-pat",
      expect.any(AbortSignal),
    );
    expect(mocks.estimateCost).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "cookie-openai-key" }),
    );
  });

  it("rejects a cross-origin caller before touching GitHub", async () => {
    // Estimation runs the same GitHub ingestion as a real generation, so an
    // open endpoint drains the server's shared API budget.
    const crossOrigin = new Request(
      "https://gitdiagram.com/api/generate/cost",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
          "Sec-Fetch-Site": "cross-site",
        },
        body: JSON.stringify({ username: "openai", repo: "openai-node" }),
      },
    );

    const response = await POST(crossOrigin);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "CROSS_ORIGIN_FORBIDDEN",
    });
    expect(mocks.getGithubData).not.toHaveBeenCalled();
  });

  it("throttles callers on the server's own key", async () => {
    mocks.consumeInfrastructureRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 900,
      consumed: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "RATE_LIMITED",
    });
    expect(mocks.getGithubData).not.toHaveBeenCalled();
  });

  it("still infrastructure-limits a caller paying with their own key", async () => {
    mocks.resolveRequestCredentials.mockResolvedValueOnce({
      apiKey: "caller-owned-key",
    });
    mocks.estimateCost.mockResolvedValue({
      costSummary: { display: "$0.0100 USD" },
      pricingModel: "gpt-5.6-terra",
      estimatedInputTokens: 100,
      estimatedOutputTokens: 200,
      pricing: { inputPerMillionUsd: 1, outputPerMillionUsd: 2 },
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.consumeInfrastructureRateLimit).toHaveBeenCalledOnce();
  });

  it("does not echo raw upstream failure text to the caller", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getGithubData.mockRejectedValue(
      new Error('GitHub request failed (403): {"message":"rate limit"}'),
    );

    const response = await POST(request());

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("估算生成成本失败，请稍后重试。");
    expect(body.error).not.toContain("rate limit");
  });

  it("still surfaces the actionable repository errors verbatim", async () => {
    // Mirrors the real 404 path in `fetchJsonResult`, which tags the request
    // error with a code rather than relying on its sentence.
    mocks.getGithubData.mockRejectedValue(
      new GitHubRequestError(
        "Repository not found.",
        404,
        false,
        "repository_not_found",
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("GitHub 访问"),
      error_code: "REPOSITORY_NOT_FOUND",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps the route deadline abort to a 504 response", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    mocks.estimateCost.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );

    const responsePromise = POST(request());
    deadline.abort(new DOMException("Cost deadline exceeded", "TimeoutError"));
    const response = await responsePromise;

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "成本估算超时，请稍后重试。",
      error_code: "GENERATION_TIMEOUT",
    });
  });
});
