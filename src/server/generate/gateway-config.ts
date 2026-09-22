import type { GenerationErrorCode } from "~/features/diagram/error-codes";
import { getModel, type AIProvider } from "~/server/generate/model-config";

const GATEWAY_NOT_AVAILABLE_ERROR = "外部模型网关当前不可用，请改回默认模型。";
const GATEWAY_MODEL_UNKNOWN_ERROR = "请求的模型不可用。";
const GATEWAY_KEY_REQUIRED_ERROR =
  "GitDiagram 的免费额度只覆盖默认模型。所选模型需要你在 Cloudflare AI 控制台创建并填入自己的 API Key，或改回默认模型。";

export interface GatewayModelResolution {
  baseUrl: string;
  model: string;
}

export type EffectiveModelResolution =
  | { ok: true; model: string; gateway: null }
  | { ok: true; model: string; gateway: GatewayModelResolution }
  | {
      ok: false;
      status: number;
      error: string;
      errorCode: GenerationErrorCode;
    };

function readEnvValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getGatewayBaseUrl(): string | undefined {
  return readEnvValue("GATEWAY_BASE_URL");
}

export function parseGatewayAllowlist(): string[] {
  const raw = readEnvValue("GATEWAY_MODEL_ALLOWLIST");
  if (!raw) {
    return [];
  }
  return [
    ...new Set(
      raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * The only path from a request-supplied model id to generation: an id must be
 * an exact member of the operator allowlist, and it must be paid for by the
 * caller's own key. The base URL is never read from the request, so a client
 * cannot steer the server into calling an arbitrary endpoint.
 */
export function resolveEffectiveModel(params: {
  provider: AIProvider;
  requestedModel?: string;
  apiKey?: string;
}): EffectiveModelResolution {
  const requested = params.requestedModel?.trim();
  if (!requested) {
    return { ok: true, model: getModel(params.provider), gateway: null };
  }

  const baseUrl = getGatewayBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      status: 400,
      error: GATEWAY_NOT_AVAILABLE_ERROR,
      errorCode: "GATEWAY_MODEL_NOT_AVAILABLE",
    };
  }

  if (!parseGatewayAllowlist().includes(requested)) {
    return {
      ok: false,
      status: 400,
      error: GATEWAY_MODEL_UNKNOWN_ERROR,
      errorCode: "VALIDATION_ERROR",
    };
  }

  if (!params.apiKey?.trim()) {
    return {
      ok: false,
      status: 400,
      error: GATEWAY_KEY_REQUIRED_ERROR,
      errorCode: "GATEWAY_MODEL_KEY_REQUIRED",
    };
  }

  return { ok: true, model: requested, gateway: { baseUrl, model: requested } };
}
