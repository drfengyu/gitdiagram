import type { Metadata } from "next";
import { getSponsorStats } from "~/server/sponsor-stats";
import { SponsorPageContent } from "./sponsor-page-content";
import { createSponsorContent } from "./sponsor-content";

export const metadata: Metadata = {
  title: "赞助 GitDiagram",
  description: "在开发者使用 GitDiagram 查看 GitHub 仓库时触达他们。",
  alternates: { canonical: "/sponsor" },
};

export const revalidate = 300;

export default async function SponsorPage() {
  const stats = await getSponsorStats();
  const content = createSponsorContent(stats);
  return <SponsorPageContent content={content} />;
}
