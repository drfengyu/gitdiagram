import type { GenerationErrorCode } from "~/features/diagram/error-codes";

/** Distinguishes which GitHub read produced a failure, independent of its text. */
export type GitHubErrorCode =
  | "repository_not_found"
  | "user_not_found"
  | "repository_empty"
  | "repository_too_large"
  | "token_required"
  | "request_timeout"
  | "tree_unavailable"
  | "not_modified_conflict"
  | "readme_not_found";

/**
 * True when a GitHub read failed with this stable code. Both error shapes
 * carry one, so callers never have to know which helper raised.
 */
export function hasGitHubErrorCode(
  error: unknown,
  code: GitHubErrorCode,
): boolean {
  return (
    (error instanceof GitHubApiError || error instanceof GitHubRequestError) &&
    error.code === code
  );
}

/**
 * A GitHub read that failed for a reason the caller can act on. `code` is the
 * stable identifier every classifier and route branches on; `message` is only
 * display text and must never be compared to decide what happened.
 */
export class GitHubApiError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GitHubApiError";
  }
}

/** Safe metadata from GitHub; never carries response bodies or credentials. */
export class GitHubRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly rateLimited = false,
    readonly code?: GitHubErrorCode,
  ) {
    super(message);
    this.name = "GitHubRequestError";
  }
}

export function classifyGitHubError(
  error: unknown,
  hasCallerToken: boolean,
): { message: string; errorCode: GenerationErrorCode; status: number } | null {
  if (!(error instanceof Error)) return null;

  // Status-derived conditions are checked before any code so that throttling,
  // an invalid token, and a denied token keep winning over the generic 404/409
  // codes the read helpers attach.
  if (error instanceof GitHubRequestError) {
    if (error.rateLimited || error.status === 429)
      return {
        message: "GitHub 暂时限制了请求频率，请等待一分钟后再试。",
        errorCode: "GITHUB_RATE_LIMITED",
        status: 429,
      };
    if (hasCallerToken && error.status === 401)
      return {
        message:
          "你保存的令牌无效或已过期。请通过「添加 GitHub 访问」重新添加令牌，或清除之后不带令牌重试。",
        errorCode: "GITHUB_TOKEN_INVALID",
        status: 401,
      };
    if (hasCallerToken && error.status === 403)
      return {
        message:
          "请选中这个仓库，并为令牌授予 Contents: Read-only 权限。组织仓库可能还需要管理员审批。",
        errorCode: "GITHUB_ACCESS_DENIED",
        status: 403,
      };
  }

  const code =
    error instanceof GitHubApiError
      ? error.code
      : error instanceof GitHubRequestError
        ? error.code
        : undefined;

  switch (code) {
    case "repository_not_found":
      return {
        message:
          "如果这个仓库是私有的，请添加 GitHub 访问后继续；否则请核对链接中的仓库所有者和仓库名。",
        errorCode: "REPOSITORY_NOT_FOUND",
        status: 404,
      };
    case "repository_empty":
      return {
        message:
          "这个仓库还没有可读取的文件。请先把代码推送到 GitHub，然后重试。",
        errorCode: "REPOSITORY_EMPTY",
        status: 422,
      };
    case "token_required":
      return {
        message: "私有仓库需要 GitHub 令牌。请添加 GitHub 访问以生成图表。",
        errorCode: "GITHUB_AUTH_REQUIRED",
        status: 403,
      };
    case "request_timeout":
      return {
        message: "GitHub 响应超时，请重试。",
        errorCode: "GITHUB_TIMEOUT",
        status: 504,
      };
    case "tree_unavailable":
      return {
        message:
          "GitHub 无法提供这个仓库的文件。请确认它有默认分支，且你的 GitHub 令牌具有访问权限，然后重试。",
        errorCode: "GITHUB_TREE_UNAVAILABLE",
        status: 422,
      };
    default:
      break;
  }

  if (error instanceof GitHubRequestError)
    return {
      message: "GitHub 暂时不可用，请稍后重试。",
      errorCode: "GITHUB_UNAVAILABLE",
      status: 503,
    };
  return null;
}
