import { randomUUID } from "node:crypto";

import {
  sponsorListSchema,
  type SponsorInput,
} from "~/features/sponsors/schema";
import type { Sponsor } from "~/features/sponsors/types";

import { readRequiredEnv } from "./config";
import { getGzipJsonObjectWithEtag, putGzipJsonObject } from "./r2";

const PUBLIC_SPONSORS_KEY = "public/v1/_meta/sponsors.json.gz";

type SponsorListPayload = {
  version: 1;
  updatedAt: string;
  sponsors: Sponsor[];
};

export type StoredSponsorList = {
  sponsors: Sponsor[];
  etag: string | null;
};

function getPublicBucket(): string {
  return readRequiredEnv("R2_PUBLIC_BUCKET");
}

/**
 * 读失败一律降级成空名单：名单损坏是永久状态，抛错会让每次渲染都重试同一个坏
 * 对象，而缓存成"空 5 分钟"只是回到占位文案。
 */
export async function readSponsorListWithEtag(): Promise<StoredSponsorList> {
  const result = await getGzipJsonObjectWithEtag<SponsorListPayload>(
    getPublicBucket(),
    PUBLIC_SPONSORS_KEY,
  );
  if (!result) {
    return { sponsors: [], etag: null };
  }

  const parsed = sponsorListSchema.safeParse(result.value);
  if (!parsed.success) {
    console.error(
      JSON.stringify({ event: "sponsors.payload_invalid", etag: result.etag }),
    );
    return { sponsors: [], etag: result.etag };
  }

  return { sponsors: parsed.data.sponsors, etag: result.etag };
}

export async function readSponsorList(): Promise<Sponsor[]> {
  return (await readSponsorListWithEtag()).sponsors;
}

export async function writeSponsorList(params: {
  baseEtag: string | null;
  sponsors: SponsorInput[];
}): Promise<StoredSponsorList> {
  const sponsors: Sponsor[] = params.sponsors.map((sponsor, index) => ({
    ...sponsor,
    id: sponsor.id ?? randomUUID(),
    sortOrder: index,
  }));

  await putGzipJsonObject(
    getPublicBucket(),
    PUBLIC_SPONSORS_KEY,
    {
      version: 1,
      updatedAt: new Date().toISOString(),
      sponsors,
    } satisfies SponsorListPayload,
    params.baseEtag ? { ifMatch: params.baseEtag } : { ifNoneMatch: true },
  );

  return { sponsors, etag: null };
}
