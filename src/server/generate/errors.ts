import { classifyGitHubError, hasGitHubErrorCode } from "./github-errors";
import type { GenerationErrorCode } from "~/features/diagram/error-codes";
import {
  MODEL_PRICING_UNAVAILABLE_ERROR,
  ModelPricingUnavailableError,
} from "./pricing";

/**
 * Marks a failure whose message came from (or describes a call to) the model
 * provider. Provider text can name the organization or the key behind a rate
 * limit, and generation errors are echoed to the client *and* persisted into
 * the public session audit. `normalizeGenerationError` uses this marker to
 * decide what is safe to show: a caller who supplied their own key sees the
 * real message, everyone else gets a generic one while the raw text stays in
 * the server log.
 *
 * It lives here rather than beside the provider client so that classifying an
 * error never depends on loading the OpenAI SDK.
 */
export class UpstreamProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UpstreamProviderError";
  }
}

/**
 * Display text for a stalled upstream stream. Built from the idle bound alone:
 * this message is shown to the client *and* persisted into the shared session
 * audit, so it must never contain anything read off the connection.
 */
function upstreamStreamIdleMessage(idleMs: number): string {
  return `AI 服务商 ${Math.round(idleMs / 1000)} 秒没有返回任何内容，连接已断开，请重试。`;
}

/**
 * The upstream connection stayed open but stopped delivering events. Raised by
 * the streaming transport's idle watchdog so a stalled model fails after a bound
 * it can state up front, instead of holding the request until the route's own
 * deadline expires.
 *
 * A distinct type for the same reason as `UpstreamProviderError`: classification
 * keys off it, never off its text. Its message is app-authored, so it is *not*
 * provider text and must survive unchanged for a caller-supplied key.
 */
export class UpstreamStreamIdleTimeoutError extends Error {
  constructor(readonly idleMs: number) {
    super(upstreamStreamIdleMessage(idleMs));
    this.name = "UpstreamStreamIdleTimeoutError";
  }
}

export function rethrowAsUpstreamProviderError(error: unknown): never {
  // Cancellation and the route deadline are the app's own control flow, so they
  // must reach the route unchanged rather than be reported as provider faults.
  // So does the idle watchdog: it is already an app-authored, code-classified
  // failure, and laundering it here would tag its text as provider text.
  if (
    error instanceof UpstreamProviderError ||
    error instanceof UpstreamStreamIdleTimeoutError ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  ) {
    throw error;
  }

  throw new UpstreamProviderError(
    error instanceof Error ? error.message : "模型服务商请求失败。",
    { cause: error },
  );
}

const DEFAULT_OPENAI_KEY_QUOTA_EXHAUSTED_ERROR =
  "GitDiagram 默认的 OpenAI 密钥上游配额已用完，暂时不可用。这是一个免费开源项目，由一名在校学生独立维护，请稍后重试，或使用你自己的 OpenAI API Key。";
const REDACTED_UPSTREAM_ERROR = "AI 服务商在生成这张图表时返回了错误，请重试。";

/**
 * Prefixed onto raw provider text shown to a caller who supplied their own API
 * key. Provider bodies can echo a masked key prefix/suffix or an organization
 * id, so while the caller may see their own account's error live over SSE, the
 * same message is also persisted into a shared failure record that later
 * visitors read.
 *
 * New writes carry an explicit `upstreamProviderText` flag on the audit instead
 * of relying on this prefix; the prefix check below remains as the reader for
 * records written before the flag existed, so its literal must not change.
 */
export const BYOK_UPSTREAM_ERROR_PREFIX = "Your AI provider key hit an error: ";

/** Display prefix for new BYOK failures; redaction uses the audit flag. */
export const BYOK_UPSTREAM_ERROR_DISPLAY_PREFIX =
  "你的 AI 服务商密钥出现错误：";

/**
 * Strips raw provider text down to a generic message before an audit is written
 * to shared storage. App-authored messages pass through untouched.
 */
export function redactUpstreamProviderTextForSharedRecord(
  message: string | undefined,
  upstreamProviderText?: boolean,
): string | undefined {
  if (upstreamProviderText) {
    return REDACTED_UPSTREAM_ERROR;
  }
  // Legacy records carry no flag and are identified by the prefix alone, so
  // that literal has to stay stable regardless of display copy.
  if (message?.startsWith(BYOK_UPSTREAM_ERROR_PREFIX)) {
    return REDACTED_UPSTREAM_ERROR;
  }
  return message;
}

const QUOTA_EXHAUSTED_PROVIDER_CODE = "insufficient_quota";

/**
 * OpenAI-compatible failures carry a machine code (`type`/`code` on the SDK's
 * APIError, which arrives as the `cause` behind `UpstreamProviderError`) that
 * outlives any given wording, so it is the match key. Text stays as a fallback
 * only for paths that lose the structure entirely — mid-stream error events
 * surface as plain Errors — because a gateway that rephrases the canonical
 * sentence must not silently cost visitors the bring-your-own-key guidance.
 */
function isOpenAiQuotaExhaustedError(params: {
  message: string;
  error?: unknown;
}): boolean {
  const wrapped =
    params.error instanceof UpstreamProviderError
      ? params.error.cause
      : params.error;

  for (const candidate of quotaErrorCandidates(wrapped)) {
    if (
      candidate.code === QUOTA_EXHAUSTED_PROVIDER_CODE ||
      candidate.type === QUOTA_EXHAUSTED_PROVIDER_CODE
    ) {
      return true;
    }
  }

  const normalized = params.message.trim().toLowerCase();
  return (
    normalized.includes("insufficient_quota") ||
    (normalized.includes("exceeded your current quota") &&
      normalized.includes("billing"))
  );
}

/** `error`, its SDK-unwrapped cause, and the nested body an APIError carries. */
function* quotaErrorCandidates(
  error: unknown,
): Generator<{ code?: unknown; type?: unknown }> {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    yield current as { code?: unknown; type?: unknown };
    const nested = current as {
      cause?: unknown;
      error?: { code?: unknown; type?: unknown };
    };
    const next =
      nested.error && typeof nested.error === "object"
        ? nested.error
        : nested.cause;
    current = next;
  }
}

export function normalizeGenerationError(params: {
  provider: string;
  apiKey?: string;
  githubPat?: string;
  message: string;
  error?: unknown;
}): {
  message: string;
  errorCode: GenerationErrorCode;
  upstreamProviderText?: boolean;
} {
  const githubError = classifyGitHubError(
    params.error,
    Boolean(params.githubPat?.trim()),
  );
  if (githubError)
    return { message: githubError.message, errorCode: githubError.errorCode };
  if (params.error instanceof ModelPricingUnavailableError) {
    return {
      message: MODEL_PRICING_UNAVAILABLE_ERROR,
      errorCode: "MODEL_PRICING_UNAVAILABLE",
    };
  }

  if (hasGitHubErrorCode(params.error, "repository_too_large")) {
    return {
      message: params.message,
      errorCode: "TOKEN_LIMIT_EXCEEDED",
    };
  }

  if (
    params.provider === "openai" &&
    !params.apiKey &&
    isOpenAiQuotaExhaustedError(params)
  ) {
    return {
      message: DEFAULT_OPENAI_KEY_QUOTA_EXHAUSTED_ERROR,
      errorCode: "DEFAULT_OPENAI_KEY_QUOTA_EXHAUSTED",
    };
  }

  // A stalled stream is the app's own bounded failure, not provider text, so it
  // keeps the same message for a managed key and a caller-supplied one, and the
  // shared audit records it without the provider-text flag. `GENERATION_TIMEOUT`
  // is already on the wire, so no client needs a new code to show it.
  if (params.error instanceof UpstreamStreamIdleTimeoutError) {
    return {
      message: upstreamStreamIdleMessage(params.error.idleMs),
      errorCode: "GENERATION_TIMEOUT",
    };
  }

  // Provider text describes whichever key made the call. On the server's own
  // key that can name the organization or its rate-limit state, and this
  // message is both streamed to the client and persisted into the public
  // session audit, where later visitors read it. A caller using their own key
  // is shown their own account's error, which they need to act on — but the
  // audit is tagged `upstreamProviderText` so the persistence boundary keeps
  // the raw provider text out of the shared failure record.
  if (params.error instanceof UpstreamProviderError) {
    if (!params.apiKey?.trim()) {
      return {
        message: REDACTED_UPSTREAM_ERROR,
        errorCode: "STREAM_FAILED",
      };
    }
    return {
      message: `${BYOK_UPSTREAM_ERROR_DISPLAY_PREFIX}${params.message}`,
      errorCode: "CALLER_KEY_ERROR",
      upstreamProviderText: true,
    };
  }

  return {
    message: params.message,
    errorCode: "STREAM_FAILED",
  };
}
