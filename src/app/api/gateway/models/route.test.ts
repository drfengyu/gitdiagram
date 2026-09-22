// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

function request() {
  return new Request("https://gitdiagram.com/api/gateway/models", {
    headers: {
      Origin: "https://gitdiagram.com",
      "Sec-Fetch-Site": "same-origin",
    },
  });
}

describe("GET /api/gateway/models", () => {
  it("returns the empty catalog when no gateway is configured", async () => {
    delete process.env.GATEWAY_BASE_URL;
    delete process.env.GATEWAY_MODEL_ALLOWLIST;
    vi.resetModules();
    const { GET } = await import("~/app/api/gateway/models/route");

    const body = (await (await GET(request())).json()) as {
      ok: boolean;
      models: string[];
    };
    expect(body).toMatchObject({ ok: true, models: [] });
  });

  it("seeds with the allowlist, then serves the intersection after the background refresh", async () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/a,@cf/removed";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ data: [{ id: "@cf/a" }, { id: "@cf/other" }] }),
    );
    vi.resetModules();
    const { GET } = await import("~/app/api/gateway/models/route");

    const seeded = (await (await GET(request())).json()) as {
      models: string[];
      key_portal_url: string | null;
    };
    expect(seeded.models).toEqual(["@cf/a", "@cf/removed"]);
    expect(seeded.key_portal_url).toBe("https://gateway.example/keys");

    await new Promise((resolve) => setTimeout(resolve, 0));
    const refreshed = (await (await GET(request())).json()) as {
      models: string[];
    };
    expect(refreshed.models).toEqual(["@cf/a"]);
  });

  it("rejects cross-origin requests", async () => {
    vi.resetModules();
    const { GET } = await import("~/app/api/gateway/models/route");
    const crossOrigin = new Request(
      "https://gitdiagram.com/api/gateway/models",
      { headers: { Origin: "https://evil.example" } },
    );

    const response = await GET(crossOrigin);
    expect(response.status).toBe(403);
  });
});
