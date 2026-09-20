import { createSiteSocialImage } from "~/server/og/cards";

export const alt = "GitDiagram：几秒把任意 GitHub 仓库变成可交互的架构图";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-static";

export default function Image() {
  return createSiteSocialImage();
}
