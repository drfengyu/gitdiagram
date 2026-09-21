import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  getGzipJsonObjectWithEtag: vi.fn(),
  putGzipJsonObject: vi.fn(),
}));

vi.mock("~/server/storage/r2", () => storageMocks);

import {
  readSponsorList,
  readSponsorListWithEtag,
  writeSponsorList,
} from "~/server/storage/sponsors";

const BUCKET = "test-public-bucket";
const KEY = "public/v1/_meta/sponsors.json.gz";

const alpha = {
  id: "3f0c1b6a-2d5e-4a11-9c7f-6b1e2d4a8c90",
  name: "Alpha",
  body: "触达开发者",
  cta: "赞助",
  href: "https://alpha.example/",
  active: true,
  sortOrder: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.R2_PUBLIC_BUCKET = BUCKET;
});

describe("readSponsorListWithEtag", () => {
  it("treats a missing object as an empty list", async () => {
    storageMocks.getGzipJsonObjectWithEtag.mockResolvedValue(null);

    await expect(readSponsorListWithEtag()).resolves.toEqual({
      sponsors: [],
      etag: null,
    });
    expect(storageMocks.getGzipJsonObjectWithEtag).toHaveBeenCalledWith(
      BUCKET,
      KEY,
    );
  });

  it("returns the validated list with its etag", async () => {
    storageMocks.getGzipJsonObjectWithEtag.mockResolvedValue({
      value: {
        version: 1,
        updatedAt: "2026-09-21T00:00:00.000Z",
        sponsors: [alpha],
      },
      etag: "etag-1",
    });

    await expect(readSponsorListWithEtag()).resolves.toEqual({
      sponsors: [alpha],
      etag: "etag-1",
    });
  });

  it("degrades a corrupt payload to an empty list but keeps the etag", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    storageMocks.getGzipJsonObjectWithEtag.mockResolvedValue({
      value: { version: 2, sponsors: [{ nope: true }] },
      etag: "etag-bad",
    });

    await expect(readSponsorListWithEtag()).resolves.toEqual({
      sponsors: [],
      etag: "etag-bad",
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("sponsors.payload_invalid"),
    );
    warn.mockRestore();
  });

  it("exposes the list without the etag", async () => {
    storageMocks.getGzipJsonObjectWithEtag.mockResolvedValue({
      value: {
        version: 1,
        updatedAt: "2026-09-21T00:00:00.000Z",
        sponsors: [alpha],
      },
      etag: "etag-1",
    });

    await expect(readSponsorList()).resolves.toEqual([alpha]);
  });
});

describe("writeSponsorList", () => {
  it("creates the first object with an if-none-match guard", async () => {
    storageMocks.putGzipJsonObject.mockResolvedValue(undefined);

    await writeSponsorList({
      baseEtag: null,
      sponsors: [
        {
          name: "Alpha",
          body: "b",
          cta: "赞助",
          href: "https://a.example/",
          active: true,
        },
      ],
    });

    const [bucket, key, payload, condition] =
      storageMocks.putGzipJsonObject.mock.calls[0]!;
    expect(bucket).toBe(BUCKET);
    expect(key).toBe(KEY);
    expect(condition).toEqual({ ifNoneMatch: true });
    expect(payload.sponsors).toHaveLength(1);
    expect(payload.sponsors[0].sortOrder).toBe(0);
    expect(payload.sponsors[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("reuses supplied ids and renumbers sortOrder by list position", async () => {
    storageMocks.putGzipJsonObject.mockResolvedValue(undefined);

    const result = await writeSponsorList({
      baseEtag: "etag-1",
      sponsors: [
        {
          id: alpha.id,
          name: alpha.name,
          body: alpha.body,
          cta: alpha.cta,
          href: alpha.href,
          active: alpha.active,
        },
        { name: "Beta", body: "b", cta: "赞助", href: "/beta", active: false },
      ],
    });

    const [, , payload, condition] =
      storageMocks.putGzipJsonObject.mock.calls[0]!;
    expect(condition).toEqual({ ifMatch: "etag-1" });
    expect(
      payload.sponsors.map(
        ({ id, sortOrder }: { id: string; sortOrder: number }) => [
          id,
          sortOrder,
        ],
      ),
    ).toEqual([
      [alpha.id, 0],
      [result.sponsors[1]!.id, 1],
    ]);
  });

  it("lets a conditional-write failure reach the caller", async () => {
    storageMocks.putGzipJsonObject.mockRejectedValue(new Error("412"));

    await expect(
      writeSponsorList({
        baseEtag: "stale",
        sponsors: [alpha],
      }),
    ).rejects.toThrow("412");
  });
});
