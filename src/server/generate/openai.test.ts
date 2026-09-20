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

import { UpstreamProviderError } from "~/server/generate/errors";
import {
  generateStructuredOutput,
  streamCompletion,
} from "~/server/generate/openai";

async function* asAsyncEvents(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
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
afterEach(() => vi.unstubAllEnvs());

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
      undefined,
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
    const signal = new AbortController().signal;

    const result = await streamCompletion({
      provider: "openai",
      model: "gpt-5.6-terra",
      systemPrompt: "system",
      userPrompt: "user",
      apiKey: "sk-test",
      signal,
      clientRequestId: "session:explanation",
    });

    await consume(result.stream);
    expect(openAiMocks.responsesCreate.mock.calls[0]?.[0]).not.toHaveProperty(
      "max_output_tokens",
    );
    expect(openAiMocks.clientOptions).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0, timeout: 150_000 }),
    );
    expect(openAiMocks.responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ service_tier: "default" }),
      {
        signal,
        headers: { "X-Client-Request-Id": "session:explanation" },
      },
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
      undefined,
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
