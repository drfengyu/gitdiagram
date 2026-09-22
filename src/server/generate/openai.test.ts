import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const openAiMocks = vi.hoisted(() => ({
  clientOptions: vi.fn(),
  responsesCreate: vi.fn(),
  responsesParse: vi.fn(),
  responsesRetrieve: vi.fn(),
  chatCompletionsCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(options: unknown) {
      openAiMocks.clientOptions(options);
    }

    responses = {
      create: openAiMocks.responsesCreate,
      parse: openAiMocks.responsesParse,
      retrieve: openAiMocks.responsesRetrieve,
    };

    chat = {
      completions: {
        create: openAiMocks.chatCompletionsCreate,
      },
    };
  },
}));

import {
  UpstreamProviderError,
  UpstreamStreamIdleTimeoutError,
} from "~/server/generate/errors";
import {
  GATEWAY_MAX_OUTPUT_TOKENS,
  UPSTREAM_STREAM_IDLE_MS,
} from "~/server/generate/generation-policy";
import {
  generateStructuredOutput,
  streamCompletion,
} from "~/server/generate/openai";

async function* asAsyncEvents(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
}

/**
 * A provider stream that emits `events` and then falls silent with the
 * connection left open, which is what a stalled gateway looks like from here: a
 * `next()` that never settles. Like the real client, an aborted request ends the
 * iteration silently instead of throwing.
 */
function asEventsThenSilence(events: unknown[], signal?: AbortSignal) {
  return (async function* () {
    for (const event of events) {
      yield event;
    }
    await new Promise<void>((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      signal?.addEventListener("abort", () => resolve(), { once: true });
    });
  })();
}

async function consume(stream: AsyncGenerator<string, void, void>) {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function completedEvents(text = "done") {
  return asAsyncEvents([
    { type: "response.output_text.delta", delta: text },
    {
      type: "response.completed",
      response: {
        id: "resp_test",
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      },
    },
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/**
 * A streaming request always carries a signal, because that is how the idle
 * watchdog cancels a connection that stops producing events.
 */
const streamRequestOptions = expect.objectContaining({
  signal: expect.any(AbortSignal),
});

describe("OpenAI Responses text verbosity", () => {
  it("requests Fast for both managed stages and retains the tier actually served", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-managed-test");
    openAiMocks.responsesCreate.mockResolvedValue(completedEvents());
    const stream = await streamCompletion({
      provider: "openai",
      model: "gpt-5.6-sol",
      systemPrompt: "system",
      userPrompt: "user",
    });
    await consume(stream.stream);
    expect(openAiMocks.responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ service_tier: "priority" }),
      streamRequestOptions,
    );
    openAiMocks.responsesParse.mockResolvedValue({
      output_parsed: { ok: true },
      output_text: '{"ok":true}',
      service_tier: "default",
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });
    const graph = await generateStructuredOutput({
      provider: "openai",
      model: "gpt-5.6-luna",
      systemPrompt: "system",
      userPrompt: "user",
      schema: z.object({ ok: z.boolean() }),
      schemaName: "test",
    });
    expect(openAiMocks.responsesParse).toHaveBeenCalledWith(
      expect.objectContaining({ service_tier: "priority" }),
      undefined,
    );
    expect(graph.usage?.serviceTier).toBe("default");
  });
  it("bounds costly requests and attaches a production correlation id", async () => {
    openAiMocks.responsesCreate.mockResolvedValue(completedEvents());
    const caller = new AbortController();

    const result = await streamCompletion({
      provider: "openai",
      model: "gpt-5.6-terra",
      systemPrompt: "system",
      userPrompt: "user",
      apiKey: "sk-test",
      signal: caller.signal,
      clientRequestId: "session:explanation",
    });

    const requestOptions = openAiMocks.responsesCreate.mock.calls[0]?.[1] as {
      signal: AbortSignal;
      headers: Record<string, string>;
    };
    expect(requestOptions.headers).toEqual({
      "X-Client-Request-Id": "session:explanation",
    });
    // The request signal is the caller's composed with the stream idle watchdog,
    // so a cancellation still reaches the provider client while a stalled
    // connection stays cancellable without aborting the caller's own signal.
    expect(requestOptions.signal).not.toBe(caller.signal);
    expect(requestOptions.signal.aborted).toBe(false);
    caller.abort();
    expect(requestOptions.signal.aborted).toBe(true);

    await consume(result.stream);
    expect(openAiMocks.responsesCreate.mock.calls[0]?.[0]).not.toHaveProperty(
      "max_output_tokens",
    );
    expect(openAiMocks.clientOptions).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, timeout: 150_000 }),
    );
  });

  it("sends text.verbosity for an exact dated GPT-5.6 streaming model", async () => {
    openAiMocks.responsesCreate.mockResolvedValue(completedEvents());

    const result = await streamCompletion({
      provider: "openai",
      model: "gpt-5.6-terra-2026-07-09",
      systemPrompt: "system",
      userPrompt: "user",
      apiKey: "sk-test",
      textVerbosity: "low",
    });

    await expect(consume(result.stream)).resolves.toEqual(["done"]);
    await expect(result.usagePromise).resolves.toMatchObject({
      totalTokens: 15,
    });
    expect(openAiMocks.responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ text: { verbosity: "low" } }),
      streamRequestOptions,
    );
  });

  it("omits text.verbosity for unsupported models and providers", async () => {
    openAiMocks.responsesCreate
      .mockResolvedValueOnce(completedEvents())
      .mockResolvedValueOnce(completedEvents());

    const oldModelResult = await streamCompletion({
      provider: "openai",
      model: "gpt-5.4",
      systemPrompt: "system",
      userPrompt: "user",
      apiKey: "sk-test",
      textVerbosity: "low",
    });
    await consume(oldModelResult.stream);

    const proxyResult = await streamCompletion({
      provider: "openrouter",
      model: "gpt-5.6-terra",
      systemPrompt: "system",
      userPrompt: "user",
      apiKey: "sk-test",
      textVerbosity: "low",
    });
    await consume(proxyResult.stream);

    expect(openAiMocks.responsesCreate.mock.calls[1]?.[0]).not.toHaveProperty(
      "service_tier",
    );
    for (const [body] of openAiMocks.responsesCreate.mock.calls) {
      expect(body).not.toHaveProperty("text");
    }
  });

  it("merges verbosity with the structured-output text format", async () => {
    const schema = z.object({ value: z.string() });
    openAiMocks.responsesParse.mockResolvedValue({
      output_parsed: { value: "ok" },
      output_text: '{"value":"ok"}',
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });

    await generateStructuredOutput({
      provider: "openai",
      model: "gpt-5.6-luna",
      systemPrompt: "system",
      userPrompt: "user",
      schema,
      schemaName: "payload",
      apiKey: "sk-test",
      textVerbosity: "low",
    });

    const [body] = openAiMocks.responsesParse.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(body.service_tier).toBe("default");
    expect(body).not.toHaveProperty("max_output_tokens");
    expect(body.text).toEqual(
      expect.objectContaining({
        format: expect.objectContaining({ type: "json_schema" }),
        verbosity: "low",
      }),
    );
  });
});

describe("OpenAI Responses incomplete streams", () => {
  it("fails even when an incomplete response already emitted visible output", async () => {
    openAiMocks.responsesCreate.mockResolvedValue(
      asAsyncEvents([
        { type: "response.output_text.delta", delta: "partial" },
        {
          type: "response.incomplete",
          response: {
            id: "resp_incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
        },
      ]),
    );

    const result = await streamCompletion({
      provider: "openai",
      model: "gpt-5.6-terra",
      systemPrompt: "system",
      userPrompt: "user",
      apiKey: "sk-test",
      textVerbosity: "low",
    });

    await expect(consume(result.stream)).rejects.toThrow(
      "OpenAI response incomplete: max_output_tokens.",
    );
    await expect(result.usagePromise).resolves.toBeNull();
  });

  it("rejects a stream that ends without a terminal response event", async () => {
    openAiMocks.responsesCreate.mockResolvedValue(
      asAsyncEvents([{ type: "response.output_text.delta", delta: "partial" }]),
    );

    const result = await streamCompletion({
      provider: "openai",
      model: "gpt-5.6-terra",
      systemPrompt: "system",
      userPrompt: "user",
      apiKey: "sk-test",
    });

    await expect(consume(result.stream)).rejects.toThrow(
      "OpenAI stream ended before response.completed.",
    );
    await expect(result.usagePromise).resolves.toBeNull();
  });
});

describe("generateStructuredOutput error classification", () => {
  const schema = z.object({ value: z.string() });

  function requestStructuredOutput() {
    return generateStructuredOutput({
      provider: "openrouter",
      model: "some/openrouter-model",
      systemPrompt: "system",
      userPrompt: "user",
      schema,
      schemaName: "payload",
      apiKey: "sk-or-test",
    });
  }

  it("propagates an abort unchanged instead of calling it a capability failure", async () => {
    const abortError = new DOMException(
      "The operation was aborted.",
      "AbortError",
    );
    openAiMocks.responsesParse.mockRejectedValue(abortError);

    await expect(requestStructuredOutput()).rejects.toBe(abortError);
  });

  it("propagates a timeout unchanged instead of calling it a capability failure", async () => {
    const timeoutError = new DOMException(
      "The operation timed out.",
      "TimeoutError",
    );
    openAiMocks.responsesParse.mockRejectedValue(timeoutError);

    await expect(requestStructuredOutput()).rejects.toBe(timeoutError);
  });

  it("keeps a rate limit as a plain upstream error, not a capability failure", async () => {
    openAiMocks.responsesParse.mockRejectedValue(
      Object.assign(new Error("429 Rate limit exceeded, retry shortly."), {
        status: 429,
      }),
    );

    const error: unknown = await requestStructuredOutput().then(
      () => {
        throw new Error("expected rejection");
      },
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(UpstreamProviderError);
    expect((error as Error).message).toBe(
      "429 Rate limit exceeded, retry shortly.",
    );
  });

  it("labels a schema rejection as a structured output capability failure", async () => {
    openAiMocks.responsesParse.mockRejectedValue(
      Object.assign(
        new Error("404 No endpoints found that support response_format."),
        { status: 404 },
      ),
    );

    const request = requestStructuredOutput();
    await expect(request).rejects.toBeInstanceOf(UpstreamProviderError);
    await expect(request).rejects.toThrow(
      "OpenRouter model does not support the required structured graph output: 404 No endpoints found that support response_format.",
    );
  });

  it("labels a response that ignored the schema as a capability failure", async () => {
    openAiMocks.responsesParse.mockResolvedValue({
      output_parsed: null,
      output_text: "not json",
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });

    const request = requestStructuredOutput();
    await expect(request).rejects.toBeInstanceOf(UpstreamProviderError);
    await expect(request).rejects.toThrow(
      "OpenRouter model does not support the required structured graph output: Structured output parsing returned no parsed payload.",
    );
  });
});

const GATEWAY_CHUNKS = [
  { choices: [{ index: 0, delta: { content: '{"ok":tr' } }] },
  {
    choices: [{ index: 0, delta: { content: "ue}" }, finish_reason: "stop" }],
  },
  {
    choices: [],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      prompt_tokens_details: { cached_tokens: 4 },
      completion_tokens_details: { reasoning_tokens: 2 },
    },
  },
];

describe("Chat Completions gateway transport", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-gateway-test");
    vi.stubEnv("AI_API_STYLE", "chat");
    vi.stubEnv(
      "AI_CHAT_EXTRA_PARAMS",
      '{"chat_template_kwargs":{"enable_thinking":false}}',
    );
  });

  function sentChatRequest() {
    const [body] = openAiMocks.chatCompletionsCreate.mock.calls[0] ?? [];
    return body as Record<string, unknown>;
  }

  it("streams text and bills the usage chunk a gateway only sends on request", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue(
      asAsyncEvents(GATEWAY_CHUNKS),
    );

    const result = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3.8-27b",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(await consume(result.stream)).toEqual(['{"ok":tr', "ue}"]);
    await expect(result.usagePromise).resolves.toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cachedInputTokens: 4,
      reasoningTokens: 2,
    });
  });

  it("keeps the input tokens when the gateway re-sends cumulative usage that zeroes counters it has not advanced", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue(
      asAsyncEvents([
        {
          choices: [{ index: 0, delta: { content: "hello" } }],
          usage: {
            prompt_tokens: 687,
            completion_tokens: 0,
            total_tokens: 687,
            prompt_tokens_details: { cached_tokens: 0 },
          },
        },
        {
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 42,
            total_tokens: 42,
            prompt_tokens_details: { cached_tokens: 0 },
          },
        },
      ]),
    );

    const result = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3.8-27b",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(await consume(result.stream)).toEqual(["hello"]);
    await expect(result.usagePromise).resolves.toMatchObject({
      inputTokens: 687,
      outputTokens: 42,
      totalTokens: 729,
    });
  });

  it("omits Responses-only fields and merges the gateway's extra params", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue(
      asAsyncEvents(GATEWAY_CHUNKS),
    );

    const stream = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3.8-27b",
      systemPrompt: "system",
      userPrompt: "user",
      reasoningEffort: "high",
      textVerbosity: "low",
    });
    await consume(stream.stream);

    const body = sentChatRequest();
    expect(body).toMatchObject({
      model: "@cf/qwen/qwen3.8-27b",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" },
      ],
      stream: true,
      stream_options: { include_usage: true },
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(Object.keys(body)).not.toContain("service_tier");
    expect(Object.keys(body)).not.toContain("reasoning_effort");
    expect(Object.keys(body)).not.toContain("text");
  });

  it("carries the graph stage request as a strict response_format", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue(
      asAsyncEvents(GATEWAY_CHUNKS),
    );

    const stream = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3.8-27b",
      systemPrompt: "system",
      userPrompt: "user",
      outputSchema: z.object({ ok: z.boolean() }),
    });
    await consume(stream.stream);

    expect(sentChatRequest().response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "repository_architecture", strict: true },
    });
  });

  it("parses a structured completion into the schema output", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: { role: "assistant", content: '{"ok":true}' },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    await expect(
      generateStructuredOutput({
        provider: "openai",
        model: "@cf/qwen/qwen3.8-27b",
        systemPrompt: "system",
        userPrompt: "user",
        schema: z.object({ ok: z.boolean() }),
        schemaName: "diagram_graph",
      }),
    ).resolves.toEqual({
      output: { ok: true },
      rawText: '{"ok":true}',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  });

  it("reports a thinking-only reply as a missing payload so the graph retries", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: { role: "assistant", content: null },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 512, total_tokens: 522 },
    });

    const request = generateStructuredOutput({
      provider: "openai",
      model: "@cf/qwen/qwen3.8-27b",
      systemPrompt: "system",
      userPrompt: "user",
      schema: z.object({ ok: z.boolean() }),
      schemaName: "diagram_graph",
    });
    await expect(request).rejects.toBeInstanceOf(UpstreamProviderError);
    await expect(request).rejects.toThrow("no parsed payload");
  });

  it("fails a structured reply the gateway cut short at the token cap", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          message: { role: "assistant", content: '{"ok":tr' },
          finish_reason: "length",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 512, total_tokens: 522 },
    });

    await expect(
      generateStructuredOutput({
        provider: "openai",
        model: "@cf/qwen/qwen3.8-27b",
        systemPrompt: "system",
        userPrompt: "user",
        schema: z.object({ ok: z.boolean() }),
        schemaName: "diagram_graph",
      }),
    ).rejects.toThrow("finish_reason=length");
  });

  it("fails a stream the gateway closed before a finish reason", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue(
      asAsyncEvents([
        { choices: [{ index: 0, delta: { content: "partial" } }] },
      ]),
    );

    const stream = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3.8-27b",
      systemPrompt: "system",
      userPrompt: "user",
    });

    await expect(consume(stream.stream)).rejects.toThrow(
      "Chat stream ended before a finish reason.",
    );
    await expect(stream.usagePromise).resolves.toBeNull();
  });

  it("refuses to send a malformed extra-params override", async () => {
    vi.stubEnv("AI_CHAT_EXTRA_PARAMS", "not json");

    await expect(
      streamCompletion({
        provider: "openai",
        model: "@cf/qwen/qwen3.8-27b",
        systemPrompt: "system",
        userPrompt: "user",
      }),
    ).rejects.toThrow("AI_CHAT_EXTRA_PARAMS must be a JSON object.");
  });
});

/**
 * A gateway can accept the request, send one event and then keep the connection
 * open in silence. The provider client cannot bound that — its request timeout is
 * cleared as soon as response headers arrive — so without a watchdog the stage
 * holds the request until the route's 220s generation deadline while the user is
 * told the run is still progressing.
 */
describe("upstream stream idle watchdog", () => {
  const CHAT_START = { choices: [{ index: 0, delta: { content: "hello" } }] };
  const RESPONSES_START = {
    type: "response.output_text.delta",
    delta: "hello",
  };

  function stallChatTransport(events: unknown[]) {
    let requestSignal: AbortSignal | undefined;
    openAiMocks.chatCompletionsCreate.mockImplementation(
      async (_body: unknown, options?: { signal?: AbortSignal }) => {
        requestSignal = options?.signal;
        return asEventsThenSilence(events, options?.signal);
      },
    );
    return () => requestSignal;
  }

  function stallResponsesTransport(events: unknown[]) {
    let requestSignal: AbortSignal | undefined;
    openAiMocks.responsesCreate.mockImplementation(
      async (_body: unknown, options?: { signal?: AbortSignal }) => {
        requestSignal = options?.signal;
        return asEventsThenSilence(events, options?.signal);
      },
    );
    return () => requestSignal;
  }

  it("fails a stalled Chat Completions stream at the idle bound", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-gateway-test");
    vi.stubEnv("AI_API_STYLE", "chat");
    vi.useFakeTimers();
    const sentSignal = stallChatTransport([CHAT_START]);

    const result = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3-30b-a3b-fp8",
      systemPrompt: "system",
      userPrompt: "user",
    });
    let failure: unknown;
    const consumed = consume(result.stream).catch((error: unknown) => {
      failure = error;
    });

    // Well inside the bound: a slow model that is still producing events must be
    // left running rather than cut off.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.getTimerCount()).toBe(1);
    expect(failure).toBeUndefined();

    await vi.advanceTimersByTimeAsync(UPSTREAM_STREAM_IDLE_MS);
    await consumed;

    expect(failure).toBeInstanceOf(UpstreamStreamIdleTimeoutError);
    expect((failure as UpstreamStreamIdleTimeoutError).idleMs).toBe(
      UPSTREAM_STREAM_IDLE_MS,
    );
    // The stalled connection is cancelled on the way out, and the stage reports
    // no measured usage so its cost stays an estimate.
    expect(sentSignal()?.aborted).toBe(true);
    await expect(result.usagePromise).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails a stalled Responses stream at the idle bound", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-managed-test");
    vi.stubEnv("AI_API_STYLE", "responses");
    vi.useFakeTimers();
    const sentSignal = stallResponsesTransport([RESPONSES_START]);

    const result = await streamCompletion({
      provider: "openai",
      model: "gpt-5.6-terra",
      systemPrompt: "system",
      userPrompt: "user",
    });
    let failure: unknown;
    const consumed = consume(result.stream).catch((error: unknown) => {
      failure = error;
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.getTimerCount()).toBe(1);
    expect(failure).toBeUndefined();

    await vi.advanceTimersByTimeAsync(UPSTREAM_STREAM_IDLE_MS);
    await consumed;

    expect(failure).toBeInstanceOf(UpstreamStreamIdleTimeoutError);
    expect(sentSignal()?.aborted).toBe(true);
    await expect(result.usagePromise).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a stream that is still producing events off the watchdog", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-gateway-test");
    vi.stubEnv("AI_API_STYLE", "chat");
    vi.useFakeTimers();
    openAiMocks.chatCompletionsCreate.mockResolvedValue(
      asAsyncEvents(GATEWAY_CHUNKS),
    );

    const result = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3-30b-a3b-fp8",
      systemPrompt: "system",
      userPrompt: "user",
    });

    expect(await consume(result.stream)).toEqual(['{"ok":tr', "ue}"]);
    await expect(result.usagePromise).resolves.toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
    });
    // Every read leaves no timer behind, so a completed stage cannot be
    // failed by a watchdog firing later.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a cancellation during a stall as a cancellation, not an idle timeout", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-gateway-test");
    vi.stubEnv("AI_API_STYLE", "chat");
    vi.useFakeTimers();
    stallChatTransport([CHAT_START]);
    const caller = new AbortController();

    const result = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3-30b-a3b-fp8",
      systemPrompt: "system",
      userPrompt: "user",
      signal: caller.signal,
    });
    let failure: unknown;
    const consumed = consume(result.stream).catch((error: unknown) => {
      failure = error;
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(failure).toBeUndefined();
    caller.abort();
    await vi.advanceTimersByTimeAsync(1_000);
    await consumed;

    // The caller ended the run, so the stream simply stops; the route keeps
    // classifying that as a cancellation instead of a provider fault.
    expect(failure).not.toBeInstanceOf(UpstreamStreamIdleTimeoutError);
    expect(failure).toBeInstanceOf(UpstreamProviderError);
    await expect(result.usagePromise).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the connection and settles usage when the consumer stops reading", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-gateway-test");
    vi.stubEnv("AI_API_STYLE", "chat");
    const sentSignal = stallChatTransport([CHAT_START]);

    const result = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3-30b-a3b-fp8",
      systemPrompt: "system",
      userPrompt: "user",
    });
    const reading = result.stream[Symbol.asyncIterator]();

    expect(await reading.next()).toMatchObject({ value: "hello" });
    await reading.return?.();

    await expect(result.usagePromise).resolves.toBeNull();
    expect(sentSignal()?.aborted).toBe(true);
  });

  it("looks up usage after a completed stream on the caller's own signal", async () => {
    // A watchdog abort must never be mistaken for the caller's cancellation, so
    // the follow-up request keeps the caller's signal rather than the composed
    // one the stalled stream was read with.
    vi.stubEnv("OPENAI_API_KEY", "sk-managed-test");
    vi.stubEnv("AI_API_STYLE", "responses");
    openAiMocks.responsesCreate.mockResolvedValue(
      asAsyncEvents([
        { type: "response.output_text.delta", delta: "done" },
        { type: "response.completed", response: { id: "resp_test" } },
      ]),
    );
    openAiMocks.responsesRetrieve.mockResolvedValue({
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    });
    const caller = new AbortController();

    const result = await streamCompletion({
      provider: "openai",
      model: "gpt-5.6-terra",
      systemPrompt: "system",
      userPrompt: "user",
      signal: caller.signal,
    });
    expect(await consume(result.stream)).toEqual(["done"]);

    await expect(result.usagePromise).resolves.toMatchObject({
      totalTokens: 15,
    });
    const retrieveOptions = openAiMocks.responsesRetrieve.mock.calls[0]?.[2] as
      { signal?: AbortSignal } | undefined;
    expect(retrieveOptions?.signal).toBe(caller.signal);
  });
});

describe("Cloudflare AI console gateway transport", () => {
  const gateway = {
    baseUrl: "https://gateway.example/v1",
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  };

  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-managed-key-must-not-be-used");
  });

  function sentChatRequest() {
    const [body] = openAiMocks.chatCompletionsCreate.mock.calls[0] ?? [];
    return body as Record<string, unknown>;
  }

  it("routes the stream to the gateway with the caller key and an explicit output budget", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue(
      asAsyncEvents(GATEWAY_CHUNKS),
    );

    const result = await streamCompletion({
      provider: "openai",
      model: gateway.model,
      systemPrompt: "system",
      userPrompt: "user",
      apiKey: "sk-console-key",
      gateway,
    });
    await consume(result.stream);

    expect(openAiMocks.clientOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-console-key",
        baseURL: "https://gateway.example/v1",
      }),
    );
    // Gateways cut replies off at a small per-model default unless the request
    // names a budget, which truncates a graph mid-JSON.
    expect(sentChatRequest()).toMatchObject({
      model: gateway.model,
      max_tokens: GATEWAY_MAX_OUTPUT_TOKENS,
    });
  });

  it("gives the structured graph reply the same output budget", async () => {
    openAiMocks.chatCompletionsCreate.mockResolvedValue({
      choices: [
        {
          index: 0,
          message: { content: '{"ok":true}' },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    await generateStructuredOutput({
      provider: "openai",
      model: gateway.model,
      systemPrompt: "system",
      userPrompt: "user",
      schema: z.object({ ok: z.boolean() }),
      schemaName: "graph",
      apiKey: "sk-console-key",
      gateway,
    });

    expect(sentChatRequest()).toMatchObject({
      max_tokens: GATEWAY_MAX_OUTPUT_TOKENS,
    });
  });

  it("leaves managed chat-style requests without a budget, as the pipeline contract", async () => {
    vi.stubEnv("AI_API_STYLE", "chat");
    openAiMocks.chatCompletionsCreate.mockResolvedValue(
      asAsyncEvents(GATEWAY_CHUNKS),
    );

    const result = await streamCompletion({
      provider: "openai",
      model: "@cf/qwen/qwen3-30b-a3b-fp8",
      systemPrompt: "system",
      userPrompt: "user",
    });
    await consume(result.stream);

    expect(Object.keys(sentChatRequest())).not.toContain("max_tokens");
  });
});
