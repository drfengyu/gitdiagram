import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readSponsorList: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
  unstable_cache:
    (callback: (...args: never[]) => unknown) =>
    (...args: never[]) =>
      callback(...args),
}));

vi.mock("~/server/storage/sponsors", () => ({
  readSponsorList: mocks.readSponsorList,
}));

import {
  getSponsorPlacements,
  revalidateSponsorCache,
} from "~/server/sponsor-cache";
import type { Sponsor } from "~/features/sponsors/types";

function sponsor(id: string, sortOrder: number, active = true): Sponsor {
  return {
    id,
    name: `name-${id}`,
    body: "body",
    cta: "赞助",
    href: `https://${id}.example/`,
    active,
    sortOrder,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSponsorPlacements", () => {
  it("assigns three distinct sponsors to the three surfaces", async () => {
    mocks.readSponsorList.mockResolvedValue([
      sponsor("alpha", 0),
      sponsor("bravo", 1),
      sponsor("charlie", 2),
    ]);

    const placements = await getSponsorPlacements();
    const ids = [
      placements.home?.id,
      placements.diagram?.id,
      placements.browse?.id,
    ];

    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(expect.arrayContaining(["alpha", "bravo", "charlie"]));
  });

  it("returns empty placements when nothing is active", async () => {
    mocks.readSponsorList.mockResolvedValue([sponsor("alpha", 0, false)]);

    await expect(getSponsorPlacements()).resolves.toEqual({
      home: null,
      diagram: null,
      browse: null,
    });
  });

  it("falls back to placeholders instead of throwing when storage is down", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.readSponsorList.mockRejectedValue(new Error("R2 unavailable"));

    await expect(getSponsorPlacements()).resolves.toEqual({
      home: null,
      diagram: null,
      browse: null,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("sponsors.read_unavailable"),
    );
    warn.mockRestore();
  });
});

describe("revalidateSponsorCache", () => {
  it("expires the sponsors tag", () => {
    revalidateSponsorCache();
    expect(mocks.revalidateTag).toHaveBeenCalledWith("sponsors", "max");
  });
});
