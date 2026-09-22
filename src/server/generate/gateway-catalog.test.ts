import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadCatalog() {
  vi.resetModules();
  return import("~/server/generate/gateway-catalog");
}

// One macrotask turn settles any resolved-promise chain the background
// refresh awaits on (fetch, response.json).
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
    expect(getGatewayCatalog()).toBeNull();
  });

  it("seeds with the raw allowlist and swaps in the intersection after a background refresh", async () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/a,@cf/missing";
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ id: "@cf/a" }, { id: "@cf/b" }] }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    const { getGatewayCatalog } = await loadCatalog();
    // The first caller never waits for the gateway round trip.
    expect(getGatewayCatalog()?.models).toEqual(["@cf/a", "@cf/missing"]);

    await settle();
    const catalog = getGatewayCatalog();
    expect(catalog?.models).toEqual(["@cf/a"]);
    expect(catalog?.keyPortalUrl).toBe("https://gateway.example/keys");
  });

  it("returns without waiting when the gateway fetch hangs", async () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/a";
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>(() => undefined),
    );

    const { getGatewayCatalog } = await loadCatalog();
    expect(getGatewayCatalog()?.models).toEqual(["@cf/a"]);
  });

  it("keeps serving the allowlist when the gateway fetch fails", async () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/a,@cf/b";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { getGatewayCatalog } = await loadCatalog();
    getGatewayCatalog();
    await settle();
    expect(getGatewayCatalog()?.models).toEqual(["@cf/a", "@cf/b"]);
    warn.mockRestore();
  });

  it("caches a fresh catalog instead of refetching per request", async () => {
    process.env.GATEWAY_BASE_URL = "https://gateway.example/v1";
    process.env.GATEWAY_MODEL_ALLOWLIST = "@cf/a";
    const fetchMock = vi.fn(async () =>
      Response.json({ data: [{ id: "@cf/a" }] }),
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);

    const { getGatewayCatalog } = await loadCatalog();
    getGatewayCatalog();
    await settle();
    getGatewayCatalog();
    getGatewayCatalog();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
