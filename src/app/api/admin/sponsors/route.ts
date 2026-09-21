import { timingSafeEqual } from "node:crypto";

import { sponsorListWriteSchema } from "~/features/sponsors/schema";
import {
  jsonErrorResponse,
  NO_STORE_RESPONSE_HEADERS,
  parseSameOriginJsonRequest,
} from "~/server/http/same-origin-json";
import { revalidateSponsorCache } from "~/server/sponsor-cache";
import {
  readSponsorListWithEtag,
  writeSponsorList,
} from "~/server/storage/sponsors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_SPONSOR_REQUEST_BYTES = 64 * 1_024;

/**
 * 这个端点是给人用的，可以被反复请求，所以用恒时比较；
 * 未配置 SPONSOR_ADMIN_TOKEN 时一律拒绝，而不是放开。
 */
function isAuthorized(request: Request): boolean {
  const token = process.env.SPONSOR_ADMIN_TOKEN?.trim();
  if (!token) {
    return false;
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const expected = Buffer.from(token, "utf8");
  const provided = Buffer.from(header.slice("Bearer ".length).trim(), "utf8");
  if (expected.byteLength !== provided.byteLength) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}

function unauthorized(): Response {
  return jsonErrorResponse("Unauthorized.", 401);
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  try {
    const { sponsors, etag } = await readSponsorListWithEtag();
    return Response.json(
      { ok: true, sponsors, etag },
      { headers: NO_STORE_RESPONSE_HEADERS },
    );
  } catch {
    console.error(JSON.stringify({ event: "sponsors.admin_read_failed" }));
    return jsonErrorResponse("赞助列表暂时不可用。", 503);
  }
}

export async function PUT(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return unauthorized();
  }

  const parsed = await parseSameOriginJsonRequest(request, {
    schema: sponsorListWriteSchema,
    maxBytes: MAX_SPONSOR_REQUEST_BYTES,
    crossOriginError: "不允许跨域修改赞助列表。",
  });
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const { sponsors } = await writeSponsorList(parsed.data);
    revalidateSponsorCache();
    const stored = await readSponsorListWithEtag();
    return Response.json(
      { ok: true, sponsors, etag: stored.etag },
      { headers: NO_STORE_RESPONSE_HEADERS },
    );
  } catch (error) {
    // putGzipJsonObject 不区分 412，所以用"重读 etag 是否已变"来判断冲突。
    const current = await readSponsorListWithEtag().catch(() => null);
    if (current && current.etag !== parsed.data.baseEtag) {
      return Response.json(
        {
          ok: false,
          error: "赞助列表已在别处被修改，请重新载入最新版本后再保存。",
          sponsors: current.sponsors,
          etag: current.etag,
        },
        { status: 409, headers: NO_STORE_RESPONSE_HEADERS },
      );
    }

    console.error(
      JSON.stringify({
        event: "sponsors.admin_write_failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    return jsonErrorResponse("赞助列表保存失败，请稍后重试。", 503);
  }
}
