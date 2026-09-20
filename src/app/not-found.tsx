import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100svh-9.75rem)] items-center justify-center px-4 py-10 sm:px-8">
      <section className="neo-panel w-full max-w-xl rounded-lg p-6 text-center sm:p-10">
        <p className="text-sm font-semibold tracking-wide text-[hsl(var(--neo-soft-text))]">
          404
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          页面不存在
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[hsl(var(--neo-soft-text))]">
          这个地址没有找到内容。仓库名称拼错了，或者它还没有生成过架构图。
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="neo-button rounded-md px-5 py-3 text-sm font-semibold"
          >
            回到首页
          </Link>
          <Link
            href="/browse"
            className="browse-muted-button rounded-md px-5 py-3 text-sm font-semibold"
          >
            浏览图表
          </Link>
        </div>
      </section>
    </main>
  );
}
