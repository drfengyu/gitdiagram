import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";
import { Header } from "~/components/header";
import { Footer } from "~/components/footer";
import { CSPostHogProvider } from "./providers";
import { SITE_URL } from "~/lib/site";

export const metadata: Metadata = {
  title: "GitDiagram",
  description: "输入任意 GitHub 仓库地址，几秒生成可交互的架构图。",
  metadataBase: new URL(SITE_URL),
  keywords: [
    "github",
    "git diagram",
    "git diagram generator",
    "git diagram tool",
    "git diagram maker",
    "git diagram creator",
    "diagram",
    "repository",
    "visualization",
    "code structure",
    "system design",
    "software architecture",
    "software design",
    "software engineering",
    "software development",
    "open source",
    "open source software",
    "架构图",
    "仓库架构图",
    "代码结构图",
    "系统架构图生成",
    "GitHub 可视化工具",
    "架构图在线生成",
    "gitdiagram",
  ],
  authors: [{ name: "Mr.Albert", url: "https://github.com/drfengyu" }],
  creator: "Mr.Albert",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: SITE_URL,
    title: "GitDiagram - 几秒把仓库变成架构图",
    description: "输入任意 GitHub 仓库地址，生成可交互的架构图。",
    siteName: "GitDiagram",
  },
  twitter: {
    card: "summary_large_image",
    title: "GitDiagram - 几秒把仓库变成架构图",
    description: "输入任意 GitHub 仓库地址，生成可交互的架构图。",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${GeistSans.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <CSPostHogProvider>
          <Header />
          <div className="flex-grow">{children}</div>
          <Footer />
        </CSPostHogProvider>
      </body>
    </html>
  );
}
