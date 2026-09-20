"use client";

import { useTheme } from "next-themes";

import { useHydrated } from "~/hooks/use-hydrated";
import { cn } from "~/lib/utils";

interface ThemeToggleProps {
  className?: string;
  onToggle?: () => void;
}

export function ThemeToggle({ className, onToggle }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useHydrated();
  const baseClassName =
    "text-sm font-medium text-black transition-colors duration-150 hover:text-purple-600 dark:text-neutral-200 dark:hover:text-[hsl(var(--neo-link-hover))]";

  if (!mounted) {
    return (
      <button type="button" className={cn(baseClassName, className)}>
        深色
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(isDark ? "light" : "dark");
        onToggle?.();
      }}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      className={cn(baseClassName, className)}
    >
      {isDark ? "浅色" : "深色"}
    </button>
  );
}
