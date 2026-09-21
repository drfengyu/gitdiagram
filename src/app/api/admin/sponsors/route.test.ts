// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readSponsorListWithEtag: vi.fn(),
  revalidateSponsorCache: vi.fn(),
  writeSponsorList: vi.fn(),
}));

vi.mock("~/server/storage/sponsors", () => ({
  readSponsorListWithEtag: mocks.readSponsorListWithEtag,
  writeSponsorList: mocks.writeSponsorList,
}));

vi.mock("~/server/sponsor-cache", () => ({
  revalidateSponsorCache: mocks.revalidateSponsorCache,
}));

import { GET, PUT } from "./route";

const TOKEN = "a".repeat(64);
const ALPHA = {
  id: "3f0c1b6a-2d5e-4a11-9c7f-6b1e2d4a8c90",
  name: "Alpha",
  body: "触达开发者",
  cta: "赞助",
  href: "https://alpha.example/",
  active: true,
  sortOrder: 0,
};

function get(authorization?: string): Request {
  const headers: Record<string, string> = {};
  if (authorization) {
    headers.Authorization = authorization;
  }
  return new Request("https://gitdiagram.com/api/admin/sponsors", { headers });
}

function put(body: unknown, authorization = `Bearer ${TOKEN}`): Request {
  return new Request("https://gitdiagram.com/api/admin/sponsors", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
      Origin: "https://gitdiagram.com",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

function crossOriginPut(body: unknown): Request {
  return new Request("https://gitdiagram.com/api/admin/sponsors", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      Origin: "https://evil.example",
      "Sec-Fetch-Site": "cross-site",
    },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/sponsors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readSponsorListWithEtag.mockReset();
    mocks.writeSponsorList.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.SPONSOR_ADMIN_TOKEN = TOKEN;
    mocks.readSponsorListWithEtag.mockResolvedValue({
      sponsors: [ALPHA],
      etag: "etag-1",
    });
    mocks.writeSponsorList.mockResolvedValue({ sponsors: [ALPHA], etag: null });
  });

  afterEach(() => {
    delete process.env.SPONSOR_ADMIN_TOKEN;
    vi.restoreAllMocks();
  });

  describe("GET", () => {
    it("rejects missing, wrong and unconfigured tokens", async () => {
      await expect(GET(get())).resolves.toMatchObject({ status: 401 });
      await expect(GET(get(`Bearer ${"b".repeat(64)}`))).resolves.toMatchObject(
        { status: 401 },
      );

      delete process.env.SPONSOR_ADMIN_TOKEN;
      await expect(GET(get(`Bearer ${TOKEN}`))).resolves.toMatchObject({
        status: 401,
      });
    });

    it("returns the stored list with its etag", async () => {
      const response = await GET(get(`Bearer ${TOKEN}`));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        sponsors: [ALPHA],
        etag: "etag-1",
      });
    });
  });

  describe("PUT", () => {
    const payload = {
      baseEtag: "etag-1",
      sponsors: [
        {
          id: ALPHA.id,
          name: ALPHA.name,
          body: ALPHA.body,
          cta: ALPHA.cta,
          href: ALPHA.href,
          active: true,
        },
      ],
    };

    it("rejects before touching storage when unauthorized", async () => {
      const response = await PUT(put(payload, "Bearer nope"));
      expect(response.status).toBe(401);
      expect(mocks.writeSponsorList).not.toHaveBeenCalled();
    });

    it("refuses cross-origin writes", async () => {
      await expect(PUT(crossOriginPut(payload))).resolves.toMatchObject({
        status: 403,
      });
    });

    it("rejects an external logo path", async () => {
      const response = await PUT(
        put({
          ...payload,
          sponsors: [
            { ...payload.sponsors[0], logoSrc: "https://cdn.example/a.png" },
          ],
        }),
      );
      expect(response.status).toBe(400);
      expect(mocks.writeSponsorList).not.toHaveBeenCalled();
    });

    it("writes, busts the cache and answers with the new etag", async () => {
      // PUT 只在写成功后读一次，用来把新 etag 回给客户端。
      mocks.readSponsorListWithEtag.mockResolvedValueOnce({
        sponsors: [ALPHA],
        etag: "etag-2",
      });

      const response = await PUT(put(payload));
      expect(response.status).toBe(200);
      expect(mocks.writeSponsorList).toHaveBeenCalledWith(payload);
      expect(mocks.revalidateSponsorCache).toHaveBeenCalledOnce();
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        etag: "etag-2",
      });
    });

    it("answers 409 with the latest list when the etag moved", async () => {
      mocks.writeSponsorList.mockRejectedValue(
        new Error("412 Precondition Failed"),
      );
      mocks.readSponsorListWithEtag.mockResolvedValue({
        sponsors: [{ ...ALPHA, name: "Someone else" }],
        etag: "etag-9",
      });

      const response = await PUT(put(payload));
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        etag: "etag-9",
      });
    });

    it("answers 503 when the storage failure is not a conflict", async () => {
      mocks.writeSponsorList.mockRejectedValue(new Error("socket hang up"));

      const response = await PUT(put(payload));
      expect(response.status).toBe(503);
    });
  });
});
