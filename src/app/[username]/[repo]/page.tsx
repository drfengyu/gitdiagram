import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { permanentRedirect } from "next/navigation";
import { SITE_URL } from "~/lib/site";
import { getStoredDiagramState } from "~/server/storage/artifact-store";
import { getSponsorPlacements } from "~/server/sponsor-cache";

import {
  getPublicDiagramStateCacheTag,
  getRepoPagePath,
} from "~/server/storage/repo-page-cache";
import RepoPageClient from "./repo-page-client";

type RepoPageProps = {
  params: Promise<{ username: string; repo: string }>;
};

// Successful generations invalidate the page and data tag on demand. Keep
// unchanged diagrams warm; this interval is only the fallback refresh.
export const revalidate = 21600;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

async function getCachedPublicDiagramState(username: string, repo: string) {
  const getCachedState = unstable_cache(
    async () =>
      getStoredDiagramState({
        username,
        repo,
      }),
    ["public-diagram-state", username.toLowerCase(), repo.toLowerCase()],
    {
      revalidate,
      tags: [getPublicDiagramStateCacheTag(username, repo)],
    },
  );

  return getCachedState();
}

export async function generateMetadata({
  params,
}: RepoPageProps): Promise<Metadata> {
  const { username, repo } = await params;
  const repositoryPath = getRepoPagePath(username, repo);
  const image = {
    url: `${SITE_URL}${repositoryPath}/opengraph-image`,
    width: 1200,
    height: 630,
    alt: "GitDiagram 仓库架构图预览",
  };
  const title = `${username}/${repo} 架构图 | GitDiagram`;
  const description = `${username}/${repo} 的可交互架构图。`;

  return {
    title,
    description,
    alternates: {
      canonical: repositoryPath,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${repositoryPath}`,
      siteName: "GitDiagram",
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function Repo({ params }: RepoPageProps) {
  const { username, repo } = await params;
  if (username !== username.toLowerCase() || repo !== repo.toLowerCase()) {
    permanentRedirect(getRepoPagePath(username, repo));
  }
  const initialState = await getCachedPublicDiagramState(username, repo);
  const sponsorPlacements = await getSponsorPlacements();

  return (
    <RepoPageClient
      key={`${username.toLowerCase()}/${repo.toLowerCase()}`}
      username={username}
      repo={repo}
      initialState={initialState?.diagram ? initialState : null}
      initialStateIsAuthoritative={Boolean(initialState?.diagram)}
      sponsor={sponsorPlacements.diagram}
    />
  );
}
