/**
 * Stable identifiers for generation failures. They travel over the wire
 * (`error_code`) and are the only thing the UI is allowed to branch on.
 *
 * The display text for a failure is never a matching key: callers must not
 * compare `Error.message` to decide what happened. That keeps the copy free to
 * change without silently breaking classification.
 */
const GENERATION_ERROR_CODES = [
  // GitHub access
  "REPOSITORY_NOT_FOUND",
  "REPOSITORY_EMPTY",
  "GITHUB_AUTH_REQUIRED",
  "GITHUB_TOKEN_INVALID",
  "GITHUB_ACCESS_DENIED",
  "GITHUB_TIMEOUT",
  "GITHUB_RATE_LIMITED",
  "GITHUB_TREE_UNAVAILABLE",
  "GITHUB_UNAVAILABLE",
  // Input size
  "TOKEN_LIMIT_EXCEEDED",
  "PAYLOAD_TOO_LARGE",
  // Quota and admission control
  "RATE_LIMITED",
  "DAILY_FREE_TOKEN_LIMIT_REACHED",
  "COMPLIMENTARY_GATE_PROVIDER_MISMATCH",
  "COMPLIMENTARY_GATE_MODEL_MISMATCH",
  "DEFAULT_OPENAI_KEY_QUOTA_EXHAUSTED",
  "API_KEY_REQUIRED",
  // Provider and model
  "MODEL_PRICING_UNAVAILABLE",
  "STREAM_FAILED",
  /**
   * The caller's own key produced the upstream error. Distinct from
   * `STREAM_FAILED` so the UI can point at the caller's provider settings
   * instead of offering GitDiagram's default-key quota flow.
   */
  "CALLER_KEY_ERROR",
  // Session lifecycle
  "SESSION_CONFLICT",
  "GENERATION_CANCELLED",
  "GENERATION_TIMEOUT",
  "CANCELLATION_UNAVAILABLE",
  "GRAPH_VALIDATION_FAILED",
  "VALIDATION_ERROR",
  "CROSS_ORIGIN_FORBIDDEN",
] as const;

export type GenerationErrorCode = (typeof GENERATION_ERROR_CODES)[number];

export function isGenerationErrorCode(
  value: unknown,
): value is GenerationErrorCode {
  return (
    typeof value === "string" &&
    (GENERATION_ERROR_CODES as readonly string[]).includes(value)
  );
}
