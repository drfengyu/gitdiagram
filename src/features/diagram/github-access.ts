import {
  isGenerationErrorCode,
  type GenerationErrorCode,
} from "~/features/diagram/error-codes";

const ACCESS_TITLES: Partial<Record<GenerationErrorCode, string>> = {
  REPOSITORY_NOT_FOUND: "是私有仓库吗？",
  GITHUB_AUTH_REQUIRED: "这个仓库需要 GitHub 访问权限",
  GITHUB_TOKEN_INVALID: "请更新你的 GitHub 令牌",
  GITHUB_ACCESS_DENIED: "你的令牌缺少仓库读取权限",
  GITHUB_TREE_UNAVAILABLE: "无法读取这个仓库的文件",
};

export function githubAccessTitle(errorCode?: string) {
  return errorCode && isGenerationErrorCode(errorCode)
    ? ACCESS_TITLES[errorCode]
    : undefined;
}

/**
 * True when GitDiagram's *default* key is the thing that ran out — quota,
 * rate limit, or a gate that only the server's own key trips. Those are the
 * cases where adding a caller key helps.
 *
 * Deliberately excludes `CALLER_KEY_ERROR`, where the caller already supplied
 * a key and the provider complained about it: offering the same dialog again
 * there is a dead end. Matching on the code instead of the message text keeps
 * the two cases apart no matter how the copy is worded.
 */
export function isApiKeyCtaErrorCode(
  errorCode: GenerationErrorCode | undefined,
): boolean {
  switch (errorCode) {
    case "RATE_LIMITED":
    case "DEFAULT_OPENAI_KEY_QUOTA_EXHAUSTED":
    case "DAILY_FREE_TOKEN_LIMIT_REACHED":
    case "COMPLIMENTARY_GATE_PROVIDER_MISMATCH":
    case "COMPLIMENTARY_GATE_MODEL_MISMATCH":
    case "API_KEY_REQUIRED":
    case "GATEWAY_MODEL_KEY_REQUIRED":
      return true;
    default:
      return false;
  }
}
