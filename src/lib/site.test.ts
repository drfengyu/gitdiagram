import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

async function siteUrlFor(value: string | undefined): Promise<string> {
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = value;
  }
  vi.resetModules();
  const { SITE_URL } = await import("./site");
  return SITE_URL;
}

describe("SITE_URL", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
    vi.restoreAllMocks();
  });

  it("keeps the upstream origin when nothing is configured", async () => {
    await expect(siteUrlFor(undefined)).resolves.toBe("https://gitdiagram.com");
  });

  it("reduces a deployment override to its origin", async () => {
    await expect(
      siteUrlFor("https://gdgram.fuwari.fun/custom/path/"),
    ).resolves.toBe("https://gdgram.fuwari.fun");
  });

  it("falls back to the default for a non-URL value", async () => {
    await expect(siteUrlFor("gdgram.fuwari.fun")).resolves.toBe(
      "https://gitdiagram.com",
    );
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("rejects a non-http protocol", async () => {
    await expect(siteUrlFor("javascript:alert(1)")).resolves.toBe(
      "https://gitdiagram.com",
    );
  });
});
