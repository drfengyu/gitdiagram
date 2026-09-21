import MainCard from "~/components/main-card";
import { getSponsorPlacements } from "~/server/sponsor-cache";
import Hero from "~/components/hero";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GitDiagram - 任意 GitHub 仓库一键生成架构图",
  description: "把任意 GitHub 仓库变成可交互的架构图，快速理解代码结构。",
  alternates: {
    canonical: "/",
  },
};

export const revalidate = 300;

export default async function HomePage() {
  const sponsorPlacements = await getSponsorPlacements();

  return (
    <main className="flex min-h-[calc(100svh-9.75rem)] flex-col justify-center px-4 pt-6 pb-3 sm:block sm:min-h-0 sm:px-8 sm:py-8 md:p-8">
      <div className="mx-auto mb-5 max-w-4xl pt-9 sm:mb-4 sm:pt-0 lg:my-8">
        <Hero />
        <div className="mx-auto mt-5 max-w-[22rem] space-y-2 text-center text-[1.0625rem] leading-6 text-balance text-[hsl(var(--neo-soft-text))] sm:mt-12 sm:max-w-2xl sm:text-lg sm:leading-normal">
          <p>输入任意 GitHub 仓库地址，生成可交互的架构图。</p>
          <p className="hidden sm:block">
            也可以把任意 GitHub 网址里的「hub」换成「diagram」。
          </p>
        </div>
      </div>
      <div className="flex justify-center sm:mb-16 lg:mb-0">
        <MainCard sponsor={sponsorPlacements.home} />
      </div>
    </main>
  );
}
