// A direct source-grounded pass keeps generation responsive without costly
// model escalation. Repairs get additional reasoning only when validation fails.
export const EXPLANATION_REASONING_EFFORT = "low" as const;
// One recovery attempt leaves room for repository ingestion and rendering.
export const ARCHITECTURE_SLOW_RETRY_MS = 18_000;
// How long a streaming model connection may stay open without sending a single
// event before the transport gives up on it. A gateway can hold the response
// body open indefinitely, and the provider client's own timeout only bounds the
// response headers, so without this bound a stalled stream costs the whole
// generation deadline. Deliberately far above the slowest healthy inter-chunk
// gap (~5s observed on a gateway) so a slow-but-alive model is never cut off.
export const UPSTREAM_STREAM_IDLE_MS = 45_000;
export const ARCHITECTURE_REASONING_EFFORT = "medium" as const;
export const GRAPH_REASONING_EFFORT = "medium" as const;

export const EXPLANATION_TEXT_VERBOSITY = "low" as const;
export const GRAPH_TEXT_VERBOSITY = "low" as const;

// Cost and quota reservation estimates only. Provider requests deliberately omit
// max_output_tokens so reasoning and output can finish beyond these estimates.
export const EXPLANATION_ESTIMATED_OUTPUT_TOKENS = 8_000;
export const GRAPH_ESTIMATED_OUTPUT_TOKENS = 6_000;
export const GRAPH_RETRY_INPUT_BUFFER_TOKENS = 2_000;

// Cloudflare-style gateways apply a small per-model default output cap (often
// 256 tokens) when the request omits one, which truncates a graph reply mid-JSON.
export const GATEWAY_MAX_OUTPUT_TOKENS = 4096;
