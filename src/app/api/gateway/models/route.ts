import { NextResponse } from "next/server";

import { getGatewayCatalog } from "~/server/generate/gateway-catalog";
import { isSameOriginRequest } from "~/server/http/same-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Cross-origin model catalog requests are not allowed.",
        error_code: "CROSS_ORIGIN_FORBIDDEN",
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }

  const catalog = await getGatewayCatalog();
  return NextResponse.json(
    {
      ok: true,
      models: catalog?.models ?? [],
      key_portal_url: catalog?.keyPortalUrl ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
