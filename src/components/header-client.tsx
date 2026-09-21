"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { ThemeToggle } from "./theme-toggle";

const loadApiKeyDialog = () =>
  import("./api-key-dialog").then((module) => module.ApiKeyDialog);
const loadPrivateReposDialog = () =>
  import("./private-repos-dialog").then((module) => module.PrivateReposDialog);

const ApiKeyDialog = dynamic(loadApiKeyDialog, { ssr: false });
const PrivateReposDialog = dynamic(loadPrivateReposDialog, { ssr: false });

export function HeaderClient() {
  const pathname = usePathname();
  const [isPrivateReposDialogOpen, setIsPrivateReposDialogOpen] =
    useState(false);
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // pathname is identical on server and client for full-page loads (the proxy
  // never rewrites URLs), so these can render at SSR without mismatch risk.
  const isBrowsePage = pathname === "/browse";

  return (
    <header className="border-black sm:border-b-[3px] dark:border-black">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center">
          <span className="text-[clamp(1.25rem,6vw,1.5rem)] font-semibold sm:text-xl">
            <span className="text-black transition-colors duration-200 hover:text-gray-600 dark:text-white dark:hover:text-[hsl(var(--neo-button-hover))]">
              Git
            </span>
            <span className="text-purple-600 transition-colors duration-200 hover:text-purple-500 dark:text-[hsl(var(--neo-button))] dark:hover:text-[hsl(var(--neo-button-hover))]">
              Diagram
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:hidden">
          {!isBrowsePage ? (
            <Link
              href="/browse"
              prefetch={false}
              className="browse-muted-button inline-flex min-h-[42px] items-center rounded-md px-3 py-2 text-sm font-semibold"
            >
              浏览
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((currentValue) => !currentValue)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-site-menu"
            className="browse-muted-button inline-flex min-h-[42px] items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold"
          >
            {isMobileMenuOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="max-[360px]:sr-only">菜单</span>
          </button>
        </div>
        <nav className="hidden items-center gap-6 sm:flex">
          <Link
            href="/browse"
            className="text-sm font-medium text-black transition-colors duration-150 hover:text-purple-600 dark:text-neutral-200 dark:hover:text-[hsl(var(--neo-link-hover))]"
          >
            浏览
          </Link>
          <button
            type="button"
            onFocus={() => void loadApiKeyDialog()}
            onPointerEnter={() => void loadApiKeyDialog()}
            onClick={() => setIsApiKeyDialogOpen(true)}
            className="text-sm font-medium text-black transition-colors duration-150 hover:text-purple-600 dark:text-neutral-200 dark:hover:text-[hsl(var(--neo-link-hover))]"
          >
            API Key
          </button>
          <button
            type="button"
            onFocus={() => void loadPrivateReposDialog()}
            onPointerEnter={() => void loadPrivateReposDialog()}
            onClick={() => setIsPrivateReposDialogOpen(true)}
            className="text-sm font-medium text-black transition-colors duration-150 hover:text-purple-600 dark:text-neutral-200 dark:hover:text-[hsl(var(--neo-link-hover))]"
          >
            私有仓库
          </button>
          <ThemeToggle />
        </nav>

        <div
          data-state={isMobileMenuOpen ? "open" : "closed"}
          aria-hidden={!isMobileMenuOpen}
          className="mobile-menu-layer fixed inset-0 z-40 sm:hidden"
        >
          <button
            type="button"
            aria-label="关闭菜单"
            tabIndex={isMobileMenuOpen ? 0 : -1}
            onClick={() => setIsMobileMenuOpen(false)}
            className="mobile-menu-overlay absolute inset-0 bg-black/30"
          />
          <div className="pointer-events-none absolute inset-x-4 top-[4.5rem] z-10">
            <div
              id="mobile-site-menu"
              inert={!isMobileMenuOpen}
              className="neo-panel mobile-menu-panel pointer-events-auto ml-auto w-full max-w-[18rem] rounded-lg p-3"
            >
              <nav className="flex flex-col gap-2">
                {!isBrowsePage ? (
                  <Link
                    href="/browse"
                    prefetch={false}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="browse-muted-button inline-flex min-h-[48px] items-center justify-between rounded-md px-4 py-3 text-sm font-semibold"
                  >
                    浏览
                  </Link>
                ) : null}
                <button
                  type="button"
                  onFocus={() => void loadApiKeyDialog()}
                  onPointerEnter={() => void loadApiKeyDialog()}
                  onClick={() => {
                    setIsApiKeyDialogOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="browse-muted-button inline-flex min-h-[48px] items-center justify-between rounded-md px-4 py-3 text-sm font-semibold"
                >
                  API Key
                </button>
                <button
                  type="button"
                  onFocus={() => void loadPrivateReposDialog()}
                  onPointerEnter={() => void loadPrivateReposDialog()}
                  onClick={() => {
                    setIsPrivateReposDialogOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                  className="browse-muted-button inline-flex min-h-[48px] items-center justify-between rounded-md px-4 py-3 text-sm font-semibold"
                >
                  私有仓库
                </button>
                <ThemeToggle
                  onToggle={() => setIsMobileMenuOpen(false)}
                  className="browse-muted-button inline-flex min-h-[48px] items-center justify-between rounded-md px-4 py-3 text-sm font-semibold"
                />
              </nav>
            </div>
          </div>
        </div>

        {isPrivateReposDialogOpen ? (
          <PrivateReposDialog
            isOpen
            onClose={() => setIsPrivateReposDialogOpen(false)}
          />
        ) : null}
        {isApiKeyDialogOpen ? (
          <ApiKeyDialog isOpen onClose={() => setIsApiKeyDialogOpen(false)} />
        ) : null}
      </div>
    </header>
  );
}
