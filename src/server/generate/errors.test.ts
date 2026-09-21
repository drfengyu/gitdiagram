import { describe, expect, it } from "vitest";

import { isGenerationErrorCode } from "~/features/diagram/error-codes";
import {
  BYOK_UPSTREAM_ERROR_DISPLAY_PREFIX,
  BYOK_UPSTREAM_ERROR_PREFIX,
  normalizeGenerationError,
  redactUpstreamProviderTextForSharedRecord,
  rethrowAsUpstreamProviderError,
  UpstreamProviderError,
  UpstreamStreamIdleTimeoutError,
} from "./errors";
import { GitHubApiError } from "./github-errors";
import { REPOSITORY_TOO_LARGE_ERROR } from "./github";

const RATE_LIMIT_MESSAGE =
  "Rate limit reached for gpt-5.6-terra in organization org-abc123def on tokens per min (TPM): Limit 30000.";

function thrownBy(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw.");
}

describe("normalizeGenerationError", () => {
  it("passes the repository size error through with its own code", () => {
    expect(
      normalizeGenerationError({
        provider: "openai",
        message: REPOSITORY_TOO_LARGE_ERROR,
        error: new GitHubApiError(
          "repository_too_large",
          REPOSITORY_TOO_LARGE_ERROR,
        ),
      }),
    ).toEqual({
      message: REPOSITORY_TOO_LARGE_ERROR,
      errorCode: "TOKEN_LIMIT_EXCEEDED",
    });
  });

  it("replaces a default-key quota exhaustion with the bring-your-own-key message", () => {
    const normalized = normalizeGenerationError({
      provider: "openai",
      message: "429 You exceeded your current quota, please check your billing",
    });

    expect(normalized.errorCode).toBe("DEFAULT_OPENAI_KEY_QUOTA_EXHAUSTED");
    expect(normalized.message).toContain("暂时不可用");
  });

  it("keeps quota exhaustion verbatim when the caller supplied the key", () => {
    const message = "insufficient_quota: your account is out of credits";
    const normalized = normalizeGenerationError({
      provider: "openai",
      apiKey: "sk-caller-key",
      message,
    });

    expect(normalized).toEqual({ message, errorCode: "STREAM_FAILED" });
  });

  it("redacts provider text billed to the server's own key", () => {
    const normalized = normalizeGenerationError({
      provider: "openai",
      message: RATE_LIMIT_MESSAGE,
      error: new UpstreamProviderError(RATE_LIMIT_MESSAGE),
    });

    expect(normalized.errorCode).toBe("STREAM_FAILED");
    expect(normalized.message).not.toContain("org-abc123def");
    expect(normalized.message).toBe(
      "AI 服务商在生成这张图表时返回了错误，请重试。",
    );
  });

  it("shows provider text to a caller using their own key, tagged for the persistence boundary", () => {
    const normalized = normalizeGenerationError({
      provider: "openai",
      apiKey: "sk-caller-key",
      message: RATE_LIMIT_MESSAGE,
      error: new UpstreamProviderError(RATE_LIMIT_MESSAGE),
    });

    expect(normalized.message).toBe(
      `${BYOK_UPSTREAM_ERROR_DISPLAY_PREFIX}${RATE_LIMIT_MESSAGE}`,
    );
    expect(normalized.message).toContain(RATE_LIMIT_MESSAGE);
  });

  it("treats a whitespace-only key as no key at all", () => {
    const normalized = normalizeGenerationError({
      provider: "openai",
      apiKey: "   ",
      message: RATE_LIMIT_MESSAGE,
      error: new UpstreamProviderError(RATE_LIMIT_MESSAGE),
    });

    expect(normalized.message).not.toContain("org-abc123def");
  });

  it("keeps app-authored errors verbatim on the server's own key", () => {
    // Only provider-originated failures are marked, so the app's own messages
    // stay actionable instead of collapsing into the generic text.
    const message = "Repository not found.";
    const normalized = normalizeGenerationError({
      provider: "openai",
      message,
      error: new GitHubApiError("repository_not_found", message),
    });

    expect(normalized.errorCode).toBe("REPOSITORY_NOT_FOUND");
    expect(normalized.message).toContain("GitHub 访问");
  });

  it("classifies a stalled stream as a bounded timeout, never as provider text", () => {
    // The watchdog's message is app-authored, so a caller using their own key
    // and the shared session audit have to show the identical text.
    const error = new UpstreamStreamIdleTimeoutError(45_000);

    expect(
      normalizeGenerationError({
        provider: "openai",
        message: error.message,
        error,
      }),
    ).toEqual({ message: error.message, errorCode: "GENERATION_TIMEOUT" });

    const byok = normalizeGenerationError({
      provider: "openai",
      apiKey: "sk-caller-key",
      message: error.message,
      error,
    });
    expect(byok).toEqual({
      message: error.message,
      errorCode: "GENERATION_TIMEOUT",
    });
    expect(
      redactUpstreamProviderTextForSharedRecord(
        byok.message,
        byok.upstreamProviderText,
      ),
    ).toBe(error.message);
  });

  it("states the idle bound in app-authored text and keeps its own type", () => {
    const error = new UpstreamStreamIdleTimeoutError(45_000);

    expect(error.message).toContain("45");
    expect(error.message).not.toContain("org-abc123def");
    // Wrapping it would retag the text as provider text and change its code.
    expect(thrownBy(() => rethrowAsUpstreamProviderError(error))).toBe(error);
  });

  it("reports the stall with a code the client already understands", () => {
    const { errorCode } = normalizeGenerationError({
      provider: "openai",
      message: new UpstreamStreamIdleTimeoutError(45_000).message,
      error: new UpstreamStreamIdleTimeoutError(45_000),
    });

    expect(isGenerationErrorCode(errorCode)).toBe(true);
  });
});

describe("redactUpstreamProviderTextForSharedRecord", () => {
  it("keeps raw BYOK provider text out of the shared record", () => {
    // A BYOK caller sees their own provider error live over SSE, but the same
    // message flows into the shared failure record read by later visitors.
    const { message, upstreamProviderText } = normalizeGenerationError({
      provider: "openai",
      apiKey: "sk-caller-key",
      message: RATE_LIMIT_MESSAGE,
      error: new UpstreamProviderError(RATE_LIMIT_MESSAGE),
    });

    expect(upstreamProviderText).toBe(true);
    const persisted = redactUpstreamProviderTextForSharedRecord(
      message,
      upstreamProviderText,
    );

    expect(persisted).not.toContain("org-abc123def");
    expect(persisted).toBe("AI 服务商在生成这张图表时返回了错误，请重试。");
  });

  it("still redacts a legacy record identified only by its prefix", () => {
    // Records written before the flag existed are recognised by the frozen
    // English prefix, so that literal has to keep working.
    expect(
      redactUpstreamProviderTextForSharedRecord(
        `${BYOK_UPSTREAM_ERROR_PREFIX}${RATE_LIMIT_MESSAGE}`,
      ),
    ).not.toContain("org-abc123def");
  });

  it("passes app-authored messages and undefined through untouched", () => {
    expect(
      redactUpstreamProviderTextForSharedRecord("Graph validation failed."),
    ).toBe("Graph validation failed.");
    expect(
      redactUpstreamProviderTextForSharedRecord(undefined),
    ).toBeUndefined();
  });
});
