import {
  getGatewayBaseUrl,
  parseGatewayAllowlist,
} from "~/server/generate/gateway-config";

const MODELS_CACHE_TTL_MS = 600_000;
const MODELS_FETCH_TIMEOUT_MS = 5_000;
// A failed catalog refresh retries at this cadence instead of every request.
const CATALOG_RETRY_MS = 60_000;

export interface GatewayCatalog {
  models: string[];
  keyPortalUrl: string | null;
  fetchedAt: number;
}

let cache: GatewayCatalog | null = null;
let inflight: Promise<GatewayCatalog> | null = null;

function getKeyPortalUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    return new URL("/keys", url.origin).toString();
  } catch {
    return null;
  }
}

function readModelIds(payload: unknown): Set<string> {
  const entries = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(entries)) {
    return new Set();
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    const id = (entry as { id?: unknown } | null)?.id;
    if (typeof id === "string") {
      ids.add(id);
    }
  }
  return ids;
}

async function fetchCatalog(
  baseUrl: string,
  allowlist: string[],
): Promise<GatewayCatalog> {
  const keyPortalUrl = getKeyPortalUrl(baseUrl);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(MODELS_FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(
        `Gateway model catalog returned status ${response.status}.`,
      );
    }
    const known = readModelIds(await response.json());
    return {
      models: allowlist.filter((id) => known.has(id)),
      keyPortalUrl,
      fetchedAt: Date.now(),
    };
  } catch (error) {
    // The allowlist remains the admission authority, so serving it unscreens
    // the selector only until the next retry. Stamped stale, it refreshes
    // early rather than pinning a transient outage in for the full TTL.
    console.warn(
      JSON.stringify({
        event: "gateway.catalog.fetch_failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    return {
      models: allowlist,
      keyPortalUrl,
      fetchedAt: Date.now() - MODELS_CACHE_TTL_MS + CATALOG_RETRY_MS,
    };
  }
}

/**
 * The allowlist ∩ gateway catalog for the selector UI. Request validation never
 * consults this: an id only needs the allowlist plus the caller's own key, so a
 * slow or failing catalog can shrink the dropdown without locking anyone out.
 */
export async function getGatewayCatalog(): Promise<GatewayCatalog | null> {
  const baseUrl = getGatewayBaseUrl();
  const allowlist = parseGatewayAllowlist();
  if (!baseUrl || allowlist.length === 0) {
    return null;
  }

  if (cache && Date.now() - cache.fetchedAt < MODELS_CACHE_TTL_MS) {
    return cache;
  }

  inflight ??= fetchCatalog(baseUrl, allowlist)
    .then((next) => {
      cache = next;
      return next;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
