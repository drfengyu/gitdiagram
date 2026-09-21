import { revalidateTag, unstable_cache } from "next/cache";

import {
  resolveSponsorPlacements,
  sponsorRotationBucket,
} from "~/features/sponsors/rotation";
import type { SponsorPlacements } from "~/features/sponsors/types";

import { readSponsorList } from "./storage/sponsors";

const SPONSOR_CACHE_REVALIDATE_SECONDS = 5 * 60;
const SPONSOR_CACHE_TAG = "sponsors";

const EMPTY_PLACEMENTS: SponsorPlacements = {
  home: null,
  diagram: null,
  browse: null,
};

const readCachedSponsorList = unstable_cache(
  readSponsorList,
  ["sponsor-list-v1"],
  {
    revalidate: SPONSOR_CACHE_REVALIDATE_SECONDS,
    tags: [SPONSOR_CACHE_TAG],
  },
);

/** 一个位置的赞助商只能在服务端定，客户端组件只负责渲染传下来的结果。 */
export async function getSponsorPlacements(): Promise<SponsorPlacements> {
  try {
    const sponsors = await readCachedSponsorList();
    return resolveSponsorPlacements(sponsors, sponsorRotationBucket());
  } catch {
    console.warn(JSON.stringify({ event: "sponsors.read_unavailable" }));
    return EMPTY_PLACEMENTS;
  }
}

export function revalidateSponsorCache(): void {
  revalidateTag(SPONSOR_CACHE_TAG, "max");
}
