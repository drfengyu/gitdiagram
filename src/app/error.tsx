"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[calc(100svh-9.75rem)] items-center justify-center px-4 py-10 sm:px-8">
      <section className="neo-panel w-full max-w-xl rounded-lg p-6 text-center sm:p-10">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          页面出错了
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[hsl(var(--neo-soft-text))]">
          加载时发生错误，请重试。如果一直失败，可以稍后再来。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="neo-button rounded-md px-5 py-3 text-sm font-semibold"
          >
            重试
          </button>
          <Link
            href="/"
            className="browse-muted-button rounded-md px-5 py-3 text-sm font-semibold"
          >
            回到首页
          </Link>
        </div>
      </section>
    </main>
  );
}
