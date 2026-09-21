import type {
  Sponsor,
  SponsorPlacement,
  SponsorPlacements,
  SponsorSurface,
} from "./types";

const SPONSOR_ROTATION_WINDOW_MS = 60 * 60 * 1000;

const SURFACE_ORDER: readonly SponsorSurface[] = ["home", "diagram", "browse"];

export function sponsorRotationBucket(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / SPONSOR_ROTATION_WINDOW_MS);
}

/** FNV-1a：跨服务端/客户端/构建一致，且不需要引入哈希依赖。 */
function hashBucket(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function toPlacement(sponsor: Sponsor): SponsorPlacement {
  return {
    id: sponsor.id,
    name: sponsor.name,
    body: sponsor.body,
    cta: sponsor.cta,
    href: sponsor.href,
    logoText: sponsor.logoText,
    logoSrc: sponsor.logoSrc,
  };
}

/**
 * 每个位置取环上的相邻一项，所以整组赞助商一起随分桶前进：≥3 家时三个位置必然
 * 不同家，1 家时三处相同，2 家时恰好有一对重复 —— 这是刻意的取舍，避免为三个
 * 独立哈希而牺牲"同屏不重复"。
 */
export function resolveSponsorPlacements(
  sponsors: Sponsor[],
  bucket: number,
): SponsorPlacements {
  const ring = sponsors
    .filter((sponsor) => sponsor.active)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(toPlacement);

  if (ring.length === 0) {
    return { home: null, diagram: null, browse: null };
  }

  const start = hashBucket(String(bucket)) % ring.length;

  return Object.fromEntries(
    SURFACE_ORDER.map((surface, surfaceIndex) => [
      surface,
      ring[(start + surfaceIndex) % ring.length],
    ]),
  ) as SponsorPlacements;
}
