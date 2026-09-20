export type AIProvider = "openai" | "openrouter";
export type GenerationServiceTier = "default" | "priority";
export type AIApiStyle = "responses" | "chat";

const DEFAULT_PROVIDER: AIProvider = "openai";
const DEFAULT_API_STYLE: AIApiStyle = "responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-luna";
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-5.6-terra";
const GPT_56_MODEL_PATTERN =
  /^gpt-5\.6(?:-(?:sol|terra|luna))?(?:-\d{4}-\d{2}-\d{2})?$/i;

function readEnvValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizeProvider(value?: string): AIProvider {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "openrouter") {
    return "openrouter";
  }
  return DEFAULT_PROVIDER;
}

export function getProvider(overrideProvider?: string): AIProvider {
  return normalizeProvider(overrideProvider ?? readEnvValue("AI_PROVIDER"));
}

function normalizeApiStyle(value?: string): AIApiStyle {
  return value?.trim().toLowerCase() === "chat" ? "chat" : DEFAULT_API_STYLE;
}

/**
 * OpenAI-compatible gateways reach the model through either the Responses API
 * or Chat Completions. Only the former exposes the exact input-token count and
 * `service_tier`, so the style is a capability rather than a base URL detail.
 */
export function getApiStyle(provider: AIProvider = getProvider()): AIApiStyle {
  return provider === "openai"
    ? normalizeApiStyle(readEnvValue("AI_API_STYLE"))
    : DEFAULT_API_STYLE;
}

export function getProviderLabel(provider: AIProvider): string {
  return provider === "openrouter" ? "OpenRouter" : "OpenAI";
}

export function supportsExactInputTokenCount(provider: AIProvider): boolean {
  return provider === "openai" && getApiStyle(provider) === "responses";
}

export function supportsTextVerbosity(
  provider: AIProvider,
  model: string,
): boolean {
  return provider === "openai" && GPT_56_MODEL_PATTERN.test(model.trim());
}

/** Fast mode is funded by GitDiagram, never silently charged to a user's key. */
export function getGenerationServiceTier(params: {
  provider: AIProvider;
  model: string;
  apiKey?: string;
}): GenerationServiceTier {
  return params.provider === "openai" &&
    getApiStyle(params.provider) === "responses" &&
    !params.apiKey?.trim() &&
    GPT_56_MODEL_PATTERN.test(params.model.trim())
    ? "priority"
    : "default";
}

export function usesSinglePassArchitecture(params: {
  provider: AIProvider;
  model: string;
  apiKey?: string;
}): boolean {
  return (
    params.provider === "openai" &&
    !params.apiKey?.trim() &&
    /^gpt-5\.6-luna(?:-\d{4}-\d{2}-\d{2})?$/.test(params.model)
  );
}

export function shouldUseExactInputTokenCount(params: {
  provider: AIProvider;
  apiKey?: string;
}): boolean {
  return (
    supportsExactInputTokenCount(params.provider) &&
    Boolean(params.apiKey?.trim())
  );
}

export function getModel(provider = getProvider()): string {
  if (provider === "openrouter") {
    return readEnvValue("OPENROUTER_MODEL") ?? DEFAULT_OPENROUTER_MODEL;
  }

  return readEnvValue("OPENAI_MODEL") ?? DEFAULT_OPENAI_MODEL;
}
