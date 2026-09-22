import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadCatalog() {
  vi.resetModules();
  return import("~/server/generate/gateway-catalog");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("gateway model catalog", () => {
  it("reports no catalog when the gateway is unconfigured", async () => {
    delete process.env.GATEWAY_BASE_URL;
    delete process.env.GATEWAY_MODEL_ALLOWLIST;

    const { getGatewayCatalog } = await loadCatalog();
    expect(await getGatewayCatalog()).toBeNull();
  });

  it("returns the allowlist intersected with the gateway catalog", async () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/a,@cf/missing";
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ id: "@cf/a" }, { id: "@cf/b" }] }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    const { getGatewayCatalog } = await loadCatalog();
    const catalog = await getGatewayCatalog();
    expect(catalog?.models).toEqual(["@cf/a"]);
    expect(catalog?.keyPortalUrl).toBe("https://gateway.example/keys");
  });

  it("serves the raw allowlist when the gateway fetch fails", async () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/a,@cf/b";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const { getGatewayCatalog } = await loadCatalog();
    const catalog = await getGatewayCatalog();
    expect(catalog?.models).toEqual(["@cf/a", "@cf/b"]);
  });

  it("caches a fresh catalog instead of refetching per request", async () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/a";
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ id: "@cf/a" }] }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    const { getGatewayCatalog } = await loadCatalog();
    await getGatewayCatalog();
    await getGatewayCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
