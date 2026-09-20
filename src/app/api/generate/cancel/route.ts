import { z } from "zod";

import { markGenerationCancelled } from "~/server/generate/cancellation";
import {
  generationCancelTokenSchema,
  generationSessionIdSchema,
} from "~/server/generate/types";
import {
  jsonErrorResponse,
  NO_STORE_RESPONSE_HEADERS,
  parseSameOriginJsonRequest,
} from "~/server/http/same-origin-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const MAX_CANCELLATION_REQUEST_BYTES = 256;
const cancellationRequestSchema = z.strictObject({
  session_id: generationSessionIdSchema,
  cancel_token: generationCancelTokenSchema,
});

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseSameOriginJsonRequest(request, {
    schema: cancellationRequestSchema,
    maxBytes: MAX_CANCELLATION_REQUEST_BYTES,
    crossOriginError: "不允许跨域取消。",
  });
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    await markGenerationCancelled(
      parsed.data.session_id,
      parsed.data.cancel_token,
    );
  } catch {
    console.error(
      JSON.stringify({
        event: "generate.cancellation.write_failed",
        session_id: parsed.data.session_id,
        error: "未能记录取消请求。",
      }),
    );
    return jsonErrorResponse("取消服务暂时不可用。", 503);
  }

  return new Response(null, {
    status: 204,
    headers: NO_STORE_RESPONSE_HEADERS,
  });
}
