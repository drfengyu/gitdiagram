import { describe, expect, it } from "vitest";
import {
  classifyGitHubError,
  GitHubApiError,
  GitHubRequestError,
  type GitHubErrorCode,
} from "./github-errors";
import type { GenerationErrorCode } from "~/features/diagram/error-codes";

const CODED_FAILURES: Array<[GitHubErrorCode, string, GenerationErrorCode]> = [
  ["repository_not_found", "Repository not found.", "REPOSITORY_NOT_FOUND"],
  [
    "repository_empty",
    "Could not fetch repository file tree. Repository might be empty or inaccessible.",
    "REPOSITORY_EMPTY",
  ],
  [
    "tree_unavailable",
    "Could not fetch repository file tree.",
    "GITHUB_TREE_UNAVAILABLE",
  ],
  [
    "request_timeout",
    "GitHub request timed out. Please retry.",
    "GITHUB_TIMEOUT",
  ],
  [
    "token_required",
    "A GitHub token is required to analyze a private repository.",
    "GITHUB_AUTH_REQUIRED",
  ],
];

describe("GitHub generation errors", () => {
  it.each(CODED_FAILURES)(
    "classifies %s without generic stream failures",
    (code, message, expected) => {
      expect(
        classifyGitHubError(new GitHubApiError(code, message), false)
          ?.errorCode,
      ).toBe(expected);
    },
  );
  it("ignores display text when no code identifies the failure", () => {
    // Matching on sentences is what made translation a correctness risk; only
    // the stable code decides classification.
    expect(
      classifyGitHubError(new Error("Repository not found."), false),
    ).toBeNull();
  });
  it("gives personal credentials an actionable error without exposing server credential state", () => {
    const error = new GitHubRequestError(
      "GitHub request failed (401). Please retry.",
      401,
    );
    expect(classifyGitHubError(error, true)?.errorCode).toBe(
      "GITHUB_TOKEN_INVALID",
    );
    expect(classifyGitHubError(error, false)).toMatchObject({
      errorCode: "GITHUB_UNAVAILABLE",
      status: 503,
    });
    expect(classifyGitHubError(error, false)?.message).not.toContain("token");
  });
  it("distinguishes rate limiting from forbidden permissions", () => {
    expect(
      classifyGitHubError(new GitHubRequestError("Forbidden", 403, true), true)
        ?.errorCode,
    ).toBe("GITHUB_RATE_LIMITED");
    expect(
      classifyGitHubError(new GitHubRequestError("Forbidden", 403), true)
        ?.errorCode,
    ).toBe("GITHUB_ACCESS_DENIED");
  });
  it("does not relabel unrelated model or storage failures", () => {
    expect(classifyGitHubError(new Error("storage failed"), false)).toBeNull();
  });
});
