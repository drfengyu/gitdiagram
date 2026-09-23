import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getStoredDiagramState,
  permanentRedirect,
  notFound,
  checkGitHubUserExists,
} = vi.hoisted(() => ({
  getStoredDiagramState: vi.fn(),
  permanentRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  checkGitHubUserExists: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (read: () => Promise<unknown>) => read,
}));
vi.mock("next/navigation", () => ({ permanentRedirect, notFound }));
vi.mock("~/server/storage/artifact-store", () => ({ getStoredDiagramState }));
vi.mock("~/server/generate/github", () => ({ checkGitHubUserExists }));
vi.mock("./repo-page-client", () => ({ default: () => null }));

import Repo, { generateMetadata } from "./page";

describe("repository cache URLs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the same lowercase image URL for both social platforms", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: "Acme", repo: "Demo" }),
    });

    expect(metadata.alternates?.canonical).toBe("/acme/demo");
    expect(metadata.openGraph?.images).toEqual(metadata.twitter?.images);
    expect(metadata.openGraph?.images).toEqual([
      expect.objectContaining({
        url: "https://gitdiagram.com/acme/demo/opengraph-image",
        width: 1200,
        height: 630,
      }),
    ]);
  });

  it("redirects mixed-case pages before reading a diagram", async () => {
    await expect(
      Repo({ params: Promise.resolve({ username: "Acme", repo: "Demo" }) }),
    ).rejects.toThrow("redirect:/acme/demo");
    expect(getStoredDiagramState).not.toHaveBeenCalled();
  });

  it("keeps the initial diagram available without an additional client fetch", async () => {
    const state = {
      diagram: "flowchart TD; A-->B",
      explanation: "Overview",
      graph: { groups: [], nodes: [], edges: [] },
      latestSessionAudit: null,
      lastSuccessfulAt: "2026-09-19T00:00:00Z",
    };
    getStoredDiagramState.mockResolvedValue(state);
    const page = await Repo({
      params: Promise.resolve({ username: "acme", repo: "demo" }),
    });

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(page.props.initialState).toBe(state);
    expect(page.props.initialStateIsAuthoritative).toBe(true);
    expect(checkGitHubUserExists).not.toHaveBeenCalled();
  });

  it("renders the not-found page when the GitHub owner does not exist", async () => {
    getStoredDiagramState.mockResolvedValue(null);
    checkGitHubUserExists.mockResolvedValue("missing");

    await expect(
      Repo({
        params: Promise.resolve({ username: "nobody-here-9x", repo: "demo" }),
      }),
    ).rejects.toThrow("not-found");
  });

  it("fails open for an uncheckable owner so private repos keep their flow", async () => {
    getStoredDiagramState.mockResolvedValue(null);
    checkGitHubUserExists.mockResolvedValue("unknown");

    const page = await Repo({
      params: Promise.resolve({ username: "acme", repo: "secret" }),
    });

    expect(page.props.initialState).toBeNull();
  });

  it("rejects malformed segments without asking GitHub", async () => {
    await expect(
      Repo({
        params: Promise.resolve({ username: "bad user!", repo: "demo" }),
      }),
    ).rejects.toThrow("not-found");
    expect(checkGitHubUserExists).not.toHaveBeenCalled();
  });

  it("drops the indexing promise from metadata it cannot honour", async () => {
    getStoredDiagramState.mockResolvedValue(null);
    checkGitHubUserExists.mockResolvedValue("missing");

    const metadata = await generateMetadata({
      params: Promise.resolve({ username: "nobody-here-9x", repo: "demo" }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
