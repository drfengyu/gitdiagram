import type { SponsorStats } from "~/server/sponsor-stats";

export const SPONSOR_EMAIL_ADDRESS = "ahmedkhaleel2004@gmail.com";
export const SPONSOR_EMAIL = `mailto:${SPONSOR_EMAIL_ADDRESS}?subject=${encodeURIComponent("GitDiagram 赞助广告位")}`;
export const SPONSOR_PRICE = "$949";
export const sponsorFits = [
  "AI 编程工具与仓库智能体",
  "代码审查、安全与依赖管理工具",
  "可观测性、日志与 API 监控",
  "云托管、数据库、CI 与开发者基础设施",
];
export type SponsorMetric = { label: string; value: string; detail: string };
export type SponsorSurface = {
  name: string;
  metric: { value: string; label: string };
  description: string;
  preview: {
    src: string;
    width: number;
    height: number;
    highlight: { x: number; y: number; width: number; height: number };
    alt: string;
    caption: string;
  };
};

const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateOptions: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Toronto",
};
const dateFormatter = new Intl.DateTimeFormat("zh-CN", dateOptions);
const updatedAtFormatter = new Intl.DateTimeFormat("zh-CN", {
  ...dateOptions,
  hour: "numeric",
  minute: "2-digit",
});
const format = (value: number) => numberFormatter.format(value);
const date = (value: string, includeTime = false) =>
  (includeTime ? updatedAtFormatter : dateFormatter).format(new Date(value));

export function createSponsorContent(stats: SponsorStats) {
  const monthly: SponsorMetric[] = [
    {
      label: "已统计的独立访客",
      value: format(stats.monthlyVisitors),
      detail: "GitDiagram 全站去重访客",
    },
    {
      label: "浏览量",
      value: format(stats.monthlyPageviews),
      detail: "覆盖 GitDiagram 全站",
    },
    {
      label: "仓库页面访客",
      value: format(stats.repoVisitors),
      detail: "仓库页面的独立访客",
    },
  ];
  const lifetime: SponsorMetric[] = [
    {
      label: "已统计的独立访客",
      value: format(stats.lifetimeVisitors),
      detail: `自 ${date(stats.trackedSince)} 起统计`,
    },
    {
      label: "浏览量",
      value: format(stats.lifetimePageviews),
      detail: "覆盖 GitDiagram 全站",
    },
    {
      label: "GitHub Star 数",
      value: format(stats.githubStars),
      detail: "开源开发者触达",
    },
  ];
  const surfaces: SponsorSurface[] = [
    {
      name: "仓库图表页面",
      metric: { value: format(stats.repoPageviews), label: "浏览量" },
      description:
        "在生成的架构图下方展示赞助位置，包含你的 logo、产品简介和指向你网站的链接。",
      preview: {
        src: "/sponsor-previews/diagram.png",
        width: 2344,
        height: 1260,
        highlight: { x: 14, y: 1018, width: 2310, height: 170 },
        alt: "FastAPI 架构图，正下方紧贴着一个全宽赞助广告位。",
        caption: "位于生成图表下方的全宽展示位。",
      },
    },
    {
      name: "首页",
      metric: { value: format(stats.homePageviews), label: "浏览量" },
      description:
        "你的产品出现在仓库查询控件下方，开发者正是从这里把代码库变成图表。",
      preview: {
        src: "/sponsor-previews/home.png",
        width: 1794,
        height: 1346,
        highlight: { x: 186, y: 1056, width: 1420, height: 148 },
        alt: "GitDiagram 首页，仓库输入框和示例仓库下方是赞助广告位。",
        caption: "位于仓库查询面板内、示例下方。",
      },
    },
    {
      name: "仓库浏览目录",
      metric: { value: format(stats.browsePageviews), label: "浏览量" },
      description:
        "公开仓库列表之间的一整行专属赞助位，包含你的 logo、简介和链接。",
      preview: {
        src: "/sponsor-previews/browse.png",
        width: 2388,
        height: 1434,
        highlight: { x: 58, y: 1098, width: 2276, height: 184 },
        alt: "GitDiagram 仓库浏览目录，前两个仓库列表之间有一整行专属赞助位。",
        caption: "紧随第一个仓库之后的独立一行。",
      },
    },
    {
      name: "GitHub README",
      metric: { value: format(stats.githubStars), label: "GitHub Star 数" },
      description:
        "GitDiagram 的 GitHub README 顶部附近的赞助提及，直接链接到你的产品。",
      preview: {
        src: "/sponsor-previews/readme.png",
        width: 1804,
        height: 1000,
        highlight: { x: 60, y: 330, width: 1714, height: 76 },
        alt: "GitHub 上的 GitDiagram README，赞助提及位于简介与 Features 章节之间。",
        caption: "位于简介下方、Features 章节之前。",
      },
    },
  ];
  return {
    monthlyVisitors: format(stats.monthlyVisitors),
    monthly,
    lifetime,
    surfaces,
    asOf: stats.asOf,
    updatedAt: `${date(stats.asOf, true)} 东部时间`,
  };
}
export type SponsorContent = ReturnType<typeof createSponsorContent>;
