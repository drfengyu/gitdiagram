import OpenAI from "openai";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";

import type { GenerationTokenUsage } from "~/features/diagram/cost";
import type { GatewayModelResolution } from "~/server/generate/gateway-config";
import {
  rethrowAsUpstreamProviderError,
  UpstreamProviderError,
  UpstreamStreamIdleTimeoutError,
} from "~/server/generate/errors";
import {
  GATEWAY_MAX_OUTPUT_TOKENS,
  UPSTREAM_STREAM_IDLE_MS,
} from "~/server/generate/generation-policy";
import {
  getApiStyle,
  getGenerationServiceTier,
  getProviderLabel,
  supportsTextVerbosity,
  type AIProvider,
} from "~/server/generate/model-config";
import { normalizeGenerationUsage } from "~/server/generate/pricing";

export type ReasoningEffort = "low" | "medium" | "high";
type TextVerbosity = "low" | "medium" | "high";

const AI_REQUEST_TIMEOUT_MS = 150_000;
const AI_MAX_RETRIES = 0;

function getEnvApiKey(provider: AIProvider): string | undefined {
  if (provider === "openrouter") {
    return process.env.OPENROUTER_API_KEY?.trim();
  }

  return process.env.OPENAI_API_KEY?.trim();
}

function getOpenRouterHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const siteUrl = process.env.OPENROUTER_SITE_URL?.trim();
  const appName = process.env.OPENROUTER_APP_NAME?.trim() || "GitDiagram";

  if (siteUrl) {
    headers["HTTP-Referer"] = siteUrl;
  }

  if (appName) {
    headers["X-OpenRouter-Title"] = appName;
  }

  return headers;
}

function createClient(
  provider: AIProvider,
  apiKey: string,
  gateway?: GatewayModelResolution | null,
): OpenAI {
  if (gateway) {
    // Model-selection gateways only ever speak Chat Completions, so the client
    // is built here rather than consulting the operator's AI_API_STYLE.
    return new OpenAI({
      apiKey,
      baseURL: gateway.baseUrl,
      maxRetries: AI_MAX_RETRIES,
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
  }

  if (provider === "openrouter") {
    return new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: getOpenRouterHeaders(),
      maxRetries: AI_MAX_RETRIES,
      timeout: AI_REQUEST_TIMEOUT_MS,
    });
  }

  return new OpenAI({
    apiKey,
    maxRetries: AI_MAX_RETRIES,
    timeout: AI_REQUEST_TIMEOUT_MS,
  });
}

function buildRequestOptions(params: {
  provider: AIProvider;
  signal?: AbortSignal;
  clientRequestId?: string;
  /**
   * Stream idle watchdog signal. Composed with the caller's so that a stalled
   * connection can be cancelled without touching the caller's own signal, which
   * must keep reporting only cancellations and the route deadline.
   */
  idleSignal?: AbortSignal;
}) {
  const headers =
    params.provider === "openai" && params.clientRequestId
      ? { "X-Client-Request-Id": params.clientRequestId }
      : undefined;
  const signal = params.idleSignal
    ? params.signal
      ? AbortSignal.any([params.signal, params.idleSignal])
      : params.idleSignal
    : params.signal;

  if (!signal && !headers) {
    return undefined;
  }

  return {
    ...(signal ? { signal } : {}),
    ...(headers ? { headers } : {}),
  };
}

function resolveApiKey(provider: AIProvider, overrideApiKey?: string): string {
  const apiKey = overrideApiKey?.trim() || getEnvApiKey(provider);
  if (!apiKey) {
    const envVarName =
      provider === "openrouter" ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY";
    throw new Error(
      `Missing ${getProviderLabel(provider)} API key. Set ${envVarName} or provide api_key in request.`,
    );
  }
  return apiKey;
}

function buildMessages(systemPrompt: string, userPrompt: string) {
  return [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];
}

export function estimateTokens(text: string): number {
  // Conservative local estimate used when we deliberately avoid billable count calls.
  return text.length === 0 ? 0 : Math.ceil(text.length / 3) + 32;
}

interface StreamCompletionParams {
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  apiKey?: string;
  gateway?: GatewayModelResolution | null;
  reasoningEffort?: ReasoningEffort;
  textVerbosity?: TextVerbosity;
  outputSchema?: ZodType;
  signal?: AbortSignal;
  clientRequestId?: string;
}

interface StructuredCompletionParams<T> {
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  schemaName: string;
  apiKey?: string;
  gateway?: GatewayModelResolution | null;
  reasoningEffort?: ReasoningEffort;
  textVerbosity?: TextVerbosity;
  signal?: AbortSignal;
  clientRequestId?: string;
}

interface StreamCompletionResult {
  stream: AsyncGenerator<string, void, void>;
  usagePromise: Promise<GenerationTokenUsage | null>;
}

/**
 * Internal signal that the graph stage finished without a usable payload. It is
 * a distinct type because callers must recognise it after the message has been
 * reworded; display text is never a matching key.
 */
class NoParsedStructuredOutputPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoParsedStructuredOutputPayloadError";
  }
}

const NO_PARSED_STRUCTURED_PAYLOAD_ERROR =
  "Structured output parsing returned no parsed payload.";

// OpenRouter fronts many models, and only some honor the strict json_schema
// response format the graph stage requires. Only a request rejected over the
// schema itself (a 4xx that names the response format) or a response that
// ignored it entirely indicates a capability problem; rate limits, auth
// failures, and transient network faults must keep their own meaning so
// abort/timeout propagation and status-based handling stay intact.
const STRUCTURED_OUTPUT_REJECTION_STATUSES = new Set([400, 404, 422]);
const STRUCTURED_OUTPUT_REJECTION_PATTERN =
  /structured outputs?|response_format|json_schema|text\.format/i;

function isStructuredOutputRejection(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error instanceof NoParsedStructuredOutputPayloadError) {
    return true;
  }

  // Duck-typed rather than `instanceof OpenAI.APIError` so classification does
  // not depend on which SDK error subclass (or mock) produced the failure.
  const status = (error as { status?: unknown }).status;
  return (
    typeof status === "number" &&
    STRUCTURED_OUTPUT_REJECTION_STATUSES.has(status) &&
    STRUCTURED_OUTPUT_REJECTION_PATTERN.test(error.message)
  );
}

function getResponseFailureMessage(response: {
  error?: { message?: string | null } | null;
  incomplete_details?: { reason?: string | null } | null;
}): string {
  if (response.error?.message) {
    return response.error.message;
  }

  if (response.incomplete_details?.reason) {
    return `OpenAI response incomplete: ${response.incomplete_details.reason}.`;
  }

  return "OpenAI response did not complete successfully.";
}

async function retrieveUsageFromResponseId(
  client: OpenAI,
  provider: AIProvider,
  responseId: string | undefined,
  signal?: AbortSignal,
  clientRequestId?: string,
): Promise<GenerationTokenUsage | null> {
  if (!responseId) {
    return null;
  }

  const response = await client.responses.retrieve(
    responseId,
    undefined,
    buildRequestOptions({ provider, signal, clientRequestId }),
  );
  return normalizeGenerationUsage(response.usage, response.service_tier);
}

interface ChatCompletionUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
  completion_tokens_details?: { reasoning_tokens?: number | null } | null;
}

/** Chat usage is the same ledger as Responses usage under different field names. */
function toGenerationUsage(
  usage: ChatCompletionUsage | null | undefined,
): GenerationTokenUsage | null {
  if (!usage) {
    return null;
  }

  return normalizeGenerationUsage({
    input_tokens: usage.prompt_tokens ?? undefined,
    output_tokens: usage.completion_tokens ?? undefined,
    total_tokens: usage.total_tokens ?? undefined,
    ...(usage.prompt_tokens_details
      ? {
          input_tokens_details: {
            cached_tokens:
              usage.prompt_tokens_details.cached_tokens ?? undefined,
          },
        }
      : {}),
    ...(usage.completion_tokens_details
      ? {
          output_tokens_details: {
            reasoning_tokens:
              usage.completion_tokens_details.reasoning_tokens ?? undefined,
          },
        }
      : {}),
  });
}

/**
 * Some gateways repeat a cumulative `usage` block on every chunk and zero the
 * counters they have not advanced, so reading only the last chunk would bill the
 * call as having no input tokens. Keep the high-water mark per counter.
 */
function mergeChatUsage(
  previous: ChatCompletionUsage | null,
  next: ChatCompletionUsage,
): ChatCompletionUsage {
  if (!previous) {
    return next;
  }

  const promptTokens = highestCount(previous.prompt_tokens, next.prompt_tokens);
  const completionTokens = highestCount(
    previous.completion_tokens,
    next.completion_tokens,
  );

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    ...(typeof promptTokens === "number" && typeof completionTokens === "number"
      ? { total_tokens: promptTokens + completionTokens }
      : {
          total_tokens: highestCount(previous.total_tokens, next.total_tokens),
        }),
    ...(previous.prompt_tokens_details || next.prompt_tokens_details
      ? {
          prompt_tokens_details: {
            cached_tokens: highestCount(
              previous.prompt_tokens_details?.cached_tokens,
              next.prompt_tokens_details?.cached_tokens,
            ),
          },
        }
      : {}),
    ...(previous.completion_tokens_details || next.completion_tokens_details
      ? {
          completion_tokens_details: {
            reasoning_tokens: highestCount(
              previous.completion_tokens_details?.reasoning_tokens,
              next.completion_tokens_details?.reasoning_tokens,
            ),
          },
        }
      : {}),
  };
}

function highestCount(
  previous?: number | null,
  next?: number | null,
): number | null | undefined {
  if (typeof previous === "number" && typeof next === "number") {
    return Math.max(previous, next);
  }
  return previous ?? next;
}

/**
 * Operators of self-hosted gateways need request fields this client cannot know
 * about — `chat_template_kwargs` silencing a reasoning model is the common one —
 * so they are stated verbatim instead of guessed here.
 */
function chatExtraParams(): Record<string, unknown> {
  const raw = process.env.AI_CHAT_EXTRA_PARAMS?.trim();
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI_CHAT_EXTRA_PARAMS must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

const CHAT_TRUNCATED_ERROR =
  "Chat completion stopped before the model finished (finish_reason=length).";

type StreamRead<T> =
  | { type: "event"; result: IteratorResult<T, void> }
  | { type: "failure"; error: unknown }
  | { type: "idle" };

const IDLE_READ: StreamRead<never> = { type: "idle" };

/**
 * Ends a stream that stops delivering events while its connection stays open.
 *
 * Nothing else bounds this case. The provider client's request timeout is
 * cleared the moment response headers arrive, so a gateway that accepts the
 * request and then falls silent leaves the read pending until the route's own
 * generation deadline — minutes of a request the user is told is progressing.
 * Every event re-arms the timer, so a slow but live model is never cut off; only
 * total silence fails, and it fails as `UpstreamStreamIdleTimeoutError`.
 *
 * Aborting `watchdog` is what actually breaks the stall: an async generator
 * queues `return()` behind a `next()` that never settles, so closing the source
 * cannot be relied on to unblock a stalled read. The watchdog signal is composed
 * into the request, which releases the connection. It is never the caller's own
 * signal — `signal` is only consulted to *avoid* blaming the provider for a
 * cancellation or deadline the caller caused, since the provider client ends an
 * aborted stream silently rather than throwing.
 */
async function* withStreamIdleTimeout<T>(
  source: AsyncIterable<T>,
  params: {
    idleMs: number;
    signal?: AbortSignal;
    watchdog: AbortController;
  },
): AsyncGenerator<T, void, void> {
  const iterator = source[Symbol.asyncIterator]();
  let pendingRead: Promise<StreamRead<T>> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const readNext = () => {
    // Memoized so a timeout never makes a second concurrent `next()` call on a
    // single-consumption stream; the abandoned read stays handled either way.
    pendingRead ??= (async (): Promise<StreamRead<T>> => {
      try {
        return { type: "event", result: await iterator.next() };
      } catch (error) {
        return { type: "failure", error };
      }
    })();
    return pendingRead;
  };

  try {
    while (true) {
      let markIdle: () => void = () => undefined;
      const idle = new Promise<StreamRead<T>>((resolve) => {
        markIdle = () => resolve(IDLE_READ);
      });
      timer = setTimeout(markIdle, params.idleMs);
      const read = await Promise.race([readNext(), idle]);
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      if (read.type === "idle") {
        if (params.signal?.aborted) {
          return;
        }
        params.watchdog.abort(
          new DOMException("Model stream produced no events.", "AbortError"),
        );
        throw new UpstreamStreamIdleTimeoutError(params.idleMs);
      }
      pendingRead = null;

      if (read.type === "failure") {
        throw read.error;
      }
      if (read.result.done) {
        return;
      }
      yield read.result.value;
    }
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    params.watchdog.abort(
      new DOMException("Model stream reading stopped.", "AbortError"),
    );
    // Releasing the connection is the abort above; this only lets the provider
    // client dispose of its reader. A source wedged in cleanup must not delay
    // the failure the watchdog already decided on, so it is not awaited.
    try {
      const closing = iterator.return?.();
      if (closing) closing.catch(() => undefined);
    } catch {
      // Nothing to recover from once the stream is being abandoned anyway.
    }
  }
}

async function streamChatCompletion(
  params: StreamCompletionParams,
): Promise<StreamCompletionResult> {
  const { provider, signal, clientRequestId } = params;
  const client = createClient(
    provider,
    resolveApiKey(provider, params.apiKey),
    params.gateway,
  );
  const request: OpenAI.ChatCompletionCreateParamsStreaming = {
    model: params.model,
    messages: buildMessages(params.systemPrompt, params.userPrompt),
    stream: true,
    // Without this the gateway omits the final usage chunk and the stage is
    // accounted as zero tokens.
    stream_options: { include_usage: true },
    ...(params.outputSchema
      ? {
          response_format: zodResponseFormat(
            params.outputSchema,
            "repository_architecture",
          ),
        }
      : {}),
  };

  // Owned by the idle watchdog below and composed into the request; a fresh one
  // per attempt, so retrying a stalled stage never reuses an aborted signal.
  const watchdog = new AbortController();
  const stream = await client.chat.completions
    .create(
      {
        ...request,
        ...chatExtraParams(),
        ...(params.gateway ? { max_tokens: GATEWAY_MAX_OUTPUT_TOKENS } : {}),
      },
      buildRequestOptions({
        provider,
        signal,
        clientRequestId,
        idleSignal: watchdog.signal,
      }),
    )
    .catch(rethrowAsUpstreamProviderError);

  let usageSettled = false;
  let resolveUsage!: (usage: GenerationTokenUsage | null) => void;
  const usagePromise = new Promise<GenerationTokenUsage | null>((resolve) => {
    resolveUsage = resolve;
  });

  async function* outputStream(): AsyncGenerator<string, void, void> {
    let accumulatedUsage: ChatCompletionUsage | null = null;
    let finished = false;

    try {
      for await (const chunk of withStreamIdleTimeout(stream, {
        idleMs: UPSTREAM_STREAM_IDLE_MS,
        signal,
        watchdog,
      })) {
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) {
          if (choice.finish_reason === "length") {
            throw new Error(CHAT_TRUNCATED_ERROR);
          }
          finished = true;
        }
        if (chunk.usage) {
          accumulatedUsage = mergeChatUsage(accumulatedUsage, chunk.usage);
        }
        if (choice?.delta?.content) {
          yield choice.delta.content;
        }
      }

      if (!finished) {
        throw new Error("Chat stream ended before a finish reason.");
      }

      usageSettled = true;
      resolveUsage(toGenerationUsage(accumulatedUsage));
    } catch (error) {
      resolveUsage(null);
      usageSettled = true;
      rethrowAsUpstreamProviderError(error);
    } finally {
      // Covers the generator being returned early (a consumer that stops
      // iterating), which resolves neither branch above.
      if (!usageSettled) {
        resolveUsage(null);
      }
    }
  }

  return {
    stream: outputStream(),
    usagePromise,
  };
}

async function generateStructuredChatOutput<T>(
  params: StructuredCompletionParams<T>,
): Promise<{ output: T; rawText: string; usage: GenerationTokenUsage | null }> {
  const { provider, signal, clientRequestId } = params;
  const client = createClient(
    provider,
    resolveApiKey(provider, params.apiKey),
    params.gateway,
  );
  const request: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: params.model,
    messages: buildMessages(params.systemPrompt, params.userPrompt),
    response_format: zodResponseFormat(params.schema, params.schemaName),
  };

  try {
    const response = await client.chat.completions.create(
      {
        ...request,
        ...chatExtraParams(),
        ...(params.gateway ? { max_tokens: GATEWAY_MAX_OUTPUT_TOKENS } : {}),
      },
      buildRequestOptions({ provider, signal, clientRequestId }),
    );

    const choice = response.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new Error(CHAT_TRUNCATED_ERROR);
    }

    // A reasoning model that spends the whole budget thinking answers with a
    // null content, which is the same "no payload" outcome as an unparsed
    // Responses reply and must retry as such.
    const content = choice?.message?.content;
    if (!content) {
      throw new NoParsedStructuredOutputPayloadError(
        NO_PARSED_STRUCTURED_PAYLOAD_ERROR,
      );
    }

    let output: T;
    try {
      output = params.schema.parse(JSON.parse(content));
    } catch {
      throw new NoParsedStructuredOutputPayloadError(
        NO_PARSED_STRUCTURED_PAYLOAD_ERROR,
      );
    }

    return {
      output,
      rawText: content,
      usage: toGenerationUsage(response.usage),
    };
  } catch (error) {
    rethrowAsUpstreamProviderError(error);
  }
}

export async function streamCompletion({
  provider,
  model,
  systemPrompt,
  userPrompt,
  apiKey,
  gateway,
  reasoningEffort,
  textVerbosity,
  outputSchema,
  signal,
  clientRequestId,
}: StreamCompletionParams): Promise<StreamCompletionResult> {
  if (gateway || (provider === "openai" && getApiStyle(provider) === "chat")) {
    return streamChatCompletion({
      provider,
      model,
      systemPrompt,
      userPrompt,
      apiKey,
      gateway,
      outputSchema,
      signal,
      clientRequestId,
    });
  }

  const client = createClient(provider, resolveApiKey(provider, apiKey));
  // Owned by the idle watchdog below and composed into the request; a fresh one
  // per attempt, so retrying a stalled stage never reuses an aborted signal.
  const watchdog = new AbortController();
  const stream = await client.responses
    .create(
      {
        model,
        ...(provider === "openai"
          ? {
              service_tier: getGenerationServiceTier({
                provider,
                model,
                apiKey,
              }),
            }
          : {}),
        stream: true,
        input: buildMessages(systemPrompt, userPrompt),
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        ...(outputSchema ||
        (textVerbosity && supportsTextVerbosity(provider, model))
          ? {
              text: {
                ...(outputSchema
                  ? {
                      format: zodTextFormat(
                        outputSchema,
                        "repository_architecture",
                      ),
                    }
                  : {}),
                ...(textVerbosity && supportsTextVerbosity(provider, model)
                  ? { verbosity: textVerbosity }
                  : {}),
              },
            }
          : {}),
      },
      buildRequestOptions({
        provider,
        signal,
        clientRequestId,
        idleSignal: watchdog.signal,
      }),
    )
    .catch(rethrowAsUpstreamProviderError);

  let usageSettled = false;
  let resolveUsage!: (usage: GenerationTokenUsage | null) => void;
  const usagePromise = new Promise<GenerationTokenUsage | null>((resolve) => {
    resolveUsage = resolve;
  });

  async function* outputStream(): AsyncGenerator<string, void, void> {
    let responseId: string | undefined;
    let finalUsage: GenerationTokenUsage | null = null;
    let completed = false;

    try {
      for await (const event of withStreamIdleTimeout(stream, {
        idleMs: UPSTREAM_STREAM_IDLE_MS,
        signal,
        watchdog,
      })) {
        const response = "response" in event ? event.response : undefined;
        if (response?.id) {
          responseId = response.id;
        }

        if (event.type === "response.output_text.delta") {
          if (event.delta) {
            yield event.delta;
          }
          continue;
        }

        if (event.type === "response.completed") {
          completed = true;
          finalUsage = normalizeGenerationUsage(
            event.response.usage,
            event.response.service_tier,
          );
          continue;
        }

        if (event.type === "response.failed") {
          throw new Error(getResponseFailureMessage(event.response));
        }

        if (event.type === "response.incomplete") {
          throw new Error(getResponseFailureMessage(event.response));
        }

        if (event.type === "error") {
          const message = event.message ?? "OpenAI stream failed.";
          throw new Error(message);
        }
      }

      if (!completed) {
        throw new Error("OpenAI stream ended before response.completed.");
      }

      if (!finalUsage) {
        try {
          finalUsage = await retrieveUsageFromResponseId(
            client,
            provider,
            responseId,
            signal,
            clientRequestId ? `${clientRequestId}:usage` : undefined,
          );
        } catch {
          finalUsage = null;
        }
      }

      usageSettled = true;
      resolveUsage(finalUsage);
    } catch (error) {
      resolveUsage(null);
      usageSettled = true;
      rethrowAsUpstreamProviderError(error);
    } finally {
      // Covers the generator being returned early (a consumer that stops
      // iterating), which resolves neither branch above.
      if (!usageSettled) {
        resolveUsage(null);
      }
    }
  }

  return {
    stream: outputStream(),
    usagePromise,
  };
}

interface CountInputTokensParams {
  provider: AIProvider;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  apiKey?: string;
  reasoningEffort?: ReasoningEffort;
  signal?: AbortSignal;
  clientRequestId?: string;
}

export async function countInputTokens({
  provider,
  model,
  systemPrompt,
  userPrompt,
  apiKey,
  reasoningEffort,
  signal,
  clientRequestId,
}: CountInputTokensParams): Promise<number> {
  const client = createClient(provider, resolveApiKey(provider, apiKey));

  const response = await client.responses.inputTokens
    .count(
      {
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      },
      buildRequestOptions({ provider, signal, clientRequestId }),
    )
    .catch(rethrowAsUpstreamProviderError);

  return response.input_tokens;
}

export async function generateStructuredOutput<T>(
  params: StructuredCompletionParams<T>,
): Promise<{
  output: T;
  rawText: string;
  usage: GenerationTokenUsage | null;
}> {
  const {
    provider,
    model,
    systemPrompt,
    userPrompt,
    schema,
    schemaName,
    apiKey,
    reasoningEffort,
    textVerbosity,
    signal,
    clientRequestId,
  } = params;

  if (
    params.gateway ||
    (provider === "openai" && getApiStyle(provider) === "chat")
  ) {
    return generateStructuredChatOutput(params);
  }

  const client = createClient(provider, resolveApiKey(provider, apiKey));

  try {
    const response = await client.responses.parse(
      {
        model,
        ...(provider === "openai"
          ? {
              service_tier: getGenerationServiceTier({
                provider,
                model,
                apiKey,
              }),
            }
          : {}),
        input: buildMessages(systemPrompt, userPrompt),
        text: {
          format: zodTextFormat(schema, schemaName),
          ...(textVerbosity && supportsTextVerbosity(provider, model)
            ? { verbosity: textVerbosity }
            : {}),
        },
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      },
      buildRequestOptions({ provider, signal, clientRequestId }),
    );

    if (!response.output_parsed) {
      throw new NoParsedStructuredOutputPayloadError(
        NO_PARSED_STRUCTURED_PAYLOAD_ERROR,
      );
    }

    const rawText =
      response.output_text?.trim() ||
      JSON.stringify(response.output_parsed, null, 2);

    return {
      output: response.output_parsed,
      rawText,
      usage: normalizeGenerationUsage(response.usage, response.service_tier),
    };
  } catch (error) {
    if (provider === "openrouter" && isStructuredOutputRejection(error)) {
      const message =
        error instanceof Error ? error.message : "结构化输出请求失败。";
      throw new UpstreamProviderError(
        `OpenRouter model does not support the required structured graph output: ${message}`,
        { cause: error },
      );
    }
    // Everything else keeps its own identity: aborts and the route deadline
    // propagate unchanged (see rethrowAsUpstreamProviderError), and other API
    // failures surface as plain upstream provider errors.
    rethrowAsUpstreamProviderError(error);
  }
}
