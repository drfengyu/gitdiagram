import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

import { cjkFonts } from "./cjk-font";

const socialImageSize = {
  width: 1200,
  height: 630,
} as const;

const SOCIAL_IMAGE_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
  "CDN-Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
  "Vercel-CDN-Cache-Control":
    "public, max-age=86400, stale-while-revalidate=86400",
} as const;

type RepoCardData = {
  username: string;
  repo: string;
  defaultBranch: string | null;
  language: string | null;
  stargazerCount: number | null;
  isPrivate: boolean | null;
};

const colors = {
  background: "hsl(269 100% 95%)",
  foreground: "hsl(220 18% 24%)",
  strong: "#111111",
  brand: "hsl(271 81% 55%)",
  brandSoft: "hsl(270 100% 92%)",
  border: "#000000",
  white: "#ffffff",
  sky: "#38bdf8",
} as const;

const geistFontsPromise = Promise.all([
  readFile(
    path.join(
      process.cwd(),
      "node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf",
    ),
  ),
  readFile(
    path.join(
      process.cwd(),
      "node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf",
    ),
  ),
  readFile(
    path.join(
      process.cwd(),
      "node_modules/geist/dist/fonts/geist-sans/Geist-Bold.ttf",
    ),
  ),
]).then(([regular, medium, bold]) => [
  {
    name: "Geist",
    data: regular,
    weight: 400 as const,
    style: "normal" as const,
  },
  {
    name: "Geist",
    data: medium,
    weight: 500 as const,
    style: "normal" as const,
  },
  { name: "Geist", data: bold, weight: 700 as const, style: "normal" as const },
  // Geist has no CJK outlines, so Chinese labels fall through to this subset.
  ...cjkFonts,
]);

function formatStarCount(value: number | null) {
  if (value === null) {
    return "未知";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/u, "")}m`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/u, "")}k`;
  }

  return `${value}`;
}

function fitOwnerSize(owner: string) {
  if (owner.length > 26) {
    return 48;
  }

  if (owner.length > 18) {
    return 56;
  }

  return 64;
}

function fitRepoSize(repo: string) {
  if (repo.length > 28) {
    return 64;
  }

  if (repo.length > 20) {
    return 76;
  }

  return 88;
}

function MetaItem({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 34,
          fontWeight: 500,
          lineHeight: 1,
          color: colors.strong,
        }}
      >
        {value}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 10,
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1,
          color: "rgba(45, 55, 72, 0.7)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontSize: 70,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: "-0.075em",
      }}
    >
      <span style={{ display: "flex", color: colors.strong }}>Git</span>
      <span style={{ display: "flex", color: colors.brand }}>Diagram</span>
    </div>
  );
}

function RepoCard(data: RepoCardData) {
  const metadata = [
    { label: "星标", value: formatStarCount(data.stargazerCount) },
    { label: "语言", value: data.language ?? "未知" },
    { label: "默认分支", value: data.defaultBranch ?? "未知" },
    {
      label: "可见性",
      value:
        data.isPrivate === null ? "未知" : data.isPrivate ? "私有" : "公开",
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: colors.background,
        color: colors.foreground,
        fontFamily: "Geist, 'Noto Sans SC', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at top left, rgba(255,255,255,0.8) 0, rgba(255,255,255,0) 32%), radial-gradient(circle at bottom right, rgba(147,51,234,0.08) 0, rgba(147,51,234,0) 26%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 18,
          background: `linear-gradient(90deg, ${colors.sky} 0%, ${colors.brand} 72%, ${colors.brandSoft} 100%)`,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "42px 56px 44px",
          position: "relative",
        }}
      >
        <Wordmark />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              maxWidth: 800,
              fontSize: 34,
              fontWeight: 400,
              lineHeight: 1.24,
              color: "rgba(31, 41, 55, 0.84)",
            }}
          >
            为任意 GitHub 仓库，生成免费、简单、快速的交互式架构图。
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 42,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: fitOwnerSize(data.username),
                fontWeight: 400,
                lineHeight: 0.98,
                letterSpacing: "-0.06em",
                color: colors.foreground,
              }}
            >
              {data.username}/
            </div>
            <div
              style={{
                display: "flex",
                fontSize: fitRepoSize(data.repo),
                fontWeight: 700,
                lineHeight: 0.92,
                letterSpacing: "-0.07em",
                color: colors.strong,
                maxWidth: 980,
                wordBreak: "break-word",
              }}
            >
              {data.repo}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              width: "100%",
              maxWidth: 900,
            }}
          >
            {metadata.map((item) => (
              <MetaItem
                key={item.label}
                value={item.value}
                label={item.label}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export async function createRepoSocialImage(data: RepoCardData) {
  const fonts = await geistFontsPromise;

  return new ImageResponse(<RepoCard {...data} />, {
    ...socialImageSize,
    fonts,
    headers: SOCIAL_IMAGE_CACHE_HEADERS,
  });
}

const exampleRepositories = [
  "FastAPI",
  "Streamlit",
  "Flask",
  "api-analytics",
  "Monkeytype",
];

/**
 * The site-level card cannot reuse RepoCard because a share of gitdiagram.com
 * has no repository to name; it mirrors the homepage input instead.
 */
function SiteCard() {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: colors.background,
        color: colors.foreground,
        fontFamily: "Geist, 'Noto Sans SC', sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at top left, rgba(255,255,255,0.8) 0, rgba(255,255,255,0) 32%), radial-gradient(circle at bottom right, rgba(147,51,234,0.12) 0, rgba(147,51,234,0) 30%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 18,
          background: `linear-gradient(90deg, ${colors.sky} 0%, ${colors.brand} 72%, ${colors.brandSoft} 100%)`,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: "46px 56px 52px",
          position: "relative",
        }}
      >
        <Wordmark />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 44,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: "-0.05em",
              color: colors.strong,
            }}
          >
            几秒把仓库变成架构图
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 34,
              fontWeight: 400,
              lineHeight: 1.3,
              color: "rgba(31, 41, 55, 0.84)",
            }}
          >
            输入任意 GitHub 仓库地址，生成可交互的架构图。
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "auto",
            gap: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexGrow: 1,
              height: 78,
              padding: "0 26px",
              borderRadius: 12,
              border: `3px solid ${colors.border}`,
              background: colors.white,
              fontSize: 30,
              color: "rgba(45, 55, 72, 0.7)",
            }}
          >
            https://github.com/用户名/仓库
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 78,
              padding: "0 30px",
              borderRadius: 12,
              border: `3px solid ${colors.border}`,
              background: colors.brandSoft,
              boxShadow: `6px 6px 0 ${colors.border}`,
              fontSize: 30,
              fontWeight: 700,
              color: colors.strong,
            }}
          >
            生成架构图
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 26,
            gap: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: "rgba(45, 55, 72, 0.72)",
            }}
          >
            试试这些示例仓库：
          </div>
          {exampleRepositories.map((repo) => (
            <div
              key={repo}
              style={{
                display: "flex",
                padding: "10px 18px",
                borderRadius: 10,
                border: `2px solid ${colors.border}`,
                background: colors.white,
                fontSize: 24,
                fontWeight: 500,
                color: colors.strong,
              }}
            >
              {repo}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export async function createSiteSocialImage() {
  const fonts = await geistFontsPromise;

  return new ImageResponse(<SiteCard />, {
    ...socialImageSize,
    fonts,
    headers: SOCIAL_IMAGE_CACHE_HEADERS,
  });
}
