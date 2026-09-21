import type { Metadata } from "next";

import { SponsorAdminClient } from "./sponsor-admin-client";

export const metadata: Metadata = {
  title: "赞助位管理 | GitDiagram",
  robots: { index: false, follow: false },
};

// 只有表单外壳，数据一律由带密钥的 /api/admin/sponsors 读取。
export const dynamic = "force-dynamic";

export default function SponsorAdminPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        赞助位管理
      </h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        名单保存在对象存储里，首页、仓库图表页和浏览目录按小时轮换展示启用中的赞助商。
      </p>
      <SponsorAdminClient />
    </main>
  );
}
