import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-black pt-4 pb-9 sm:border-t-[3px] sm:py-4 lg:px-8 dark:border-black">
      <div className="container mx-auto flex h-8 max-w-4xl items-center justify-center">
        <span className="text-base font-medium text-black sm:text-sm dark:text-neutral-100">
          制作者：{" "}
          <Link
            href="https://github.com/drfengyu"
            className="neo-link hover:underline"
          >
            Mr.Albert
          </Link>
          <span className="mx-2 text-black dark:text-neutral-100">/</span>
          <Link href="/sponsor" className="neo-link hover:underline">
            赞助
          </Link>
        </span>
      </div>
    </footer>
  );
}
