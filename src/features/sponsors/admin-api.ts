import type { Sponsor } from "./types";

export type SponsorListResult =
  | { ok: true; sponsors: Sponsor[]; etag: string | null }
  | {
      ok: false;
      error: string;
      conflict?: { sponsors: Sponsor[]; etag: string | null };
    };

type ListPayload = {
  ok?: boolean;
  sponsors?: Sponsor[];
  etag?: string | null;
  error?: string;
};

const ENDPOINT = "/api/admin/sponsors";

function headers(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

function toResult(
  response: Response,
  payload: ListPayload | null,
): SponsorListResult {
  if (response.ok && payload?.ok && Array.isArray(payload.sponsors)) {
    return { ok: true, sponsors: payload.sponsors, etag: payload.etag ?? null };
  }

  const error = payload?.error ?? `请求失败（HTTP ${response.status}）。`;
  if (response.status === 409 && Array.isArray(payload?.sponsors)) {
    return {
      ok: false,
      error,
      conflict: { sponsors: payload.sponsors, etag: payload.etag ?? null },
    };
  }

  return { ok: false, error };
}

async function request(
  init: RequestInit,
): Promise<{ response: Response; payload: ListPayload | null }> {
  const response = await fetch(ENDPOINT, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });

  let payload: ListPayload | null = null;
  try {
    payload = (await response.json()) as ListPayload;
  } catch {
    payload = null;
  }

  return { response, payload };
}

export async function fetchSponsorList(
  token: string,
): Promise<SponsorListResult> {
  try {
    const { response, payload } = await request({ headers: headers(token) });
    return toResult(response, payload);
  } catch {
    return { ok: false, error: "网络错误，无法读取赞助列表。" };
  }
}

export async function saveSponsorList(
  token: string,
  body: { baseEtag: string | null; sponsors: unknown[] },
): Promise<SponsorListResult> {
  try {
    const { response, payload } = await request({
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return toResult(response, payload);
  } catch {
    return { ok: false, error: "网络错误，赞助列表未保存。" };
  }
}
