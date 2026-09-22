import { afterEach, describe, expect, it } from "vitest";

import {
  parseGatewayAllowlist,
  resolveEffectiveModel,
} from "~/server/generate/gateway-config";
import { getModel } from "~/server/generate/model-config";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("gateway model resolution", () => {
  it("falls back to the managed model when none is requested", () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/meta/llama-3.1-8b-instruct";

    expect(
      resolveEffectiveModel({ provider: "openai", requestedModel: "  " }),
    ).toEqual({ ok: true, model: getModel("openai"), gateway: null });
  });

  it("rejects a requested model when the gateway is not configured", () => {
    delete process.env.GATEWAY_BASE_URL;
    delete process.env.GATEWAY_MODEL_ALLOWLIST;

    const result = resolveEffectiveModel({
      provider: "openai",
      requestedModel: "@cf/meta/llama-3.1-8b-instruct",
      apiKey: "user-key",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("GATEWAY_MODEL_NOT_AVAILABLE");
    }
  });

  it("rejects allowlisted models without the caller's own key", () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/meta/llama-3.1-8b-instruct";

    const result = resolveEffectiveModel({
      provider: "openai",
      requestedModel: "@cf/meta/llama-3.1-8b-instruct",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("GATEWAY_MODEL_KEY_REQUIRED");
      expect(result.status).toBe(400);
    }
  });

  it("rejects ids outside the allowlist as validation errors", () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/meta/llama-3.1-8b-instruct";

    const result = resolveEffectiveModel({
      provider: "openai",
      requestedModel: "@evil/model",
      apiKey: "user-key",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("VALIDATION_ERROR");
    }
  });

  it("admits an allowlisted model carrying the caller key and fixed base URL", () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST =
      "@cf/meta/llama-3.1-8b-instruct,@cf/deepseek-ai/deepseek-r1-distill-llama-70b";

    const result = resolveEffectiveModel({
      provider: "openai",
      requestedModel: "@cf/deepseek-ai/deepseek-r1-distill-llama-70b",
      apiKey: "user-key",
    });
    expect(result).toEqual({
      ok: true,
      model: "@cf/deepseek-ai/deepseek-r1-distill-llama-70b",
      gateway: {
        baseUrl: "https://gateway.example/v1",
        model: "@cf/deepseek-ai/deepseek-r1-distill-llama-70b",
      },
    });
  });

  it("deduplicates and trims the allowlist", () => {
    process.env.GATEWAY_MODEL_ALLOWLIST = " @cf/a , @cf/b,@cf/a ,, @cf/b ";
    expect(parseGatewayAllowlist()).toEqual(["@cf/a", "@cf/b"]);
  });
});
