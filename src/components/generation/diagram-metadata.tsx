"use client";

import type { GenerationCostSummary } from "~/features/diagram/cost";
import { useHydrated } from "~/hooks/use-hydrated";
import styles from "./workspace.module.css";

const generatedTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: false,
});

// The browser's timezone is only known after hydration. Keep the server's
// reserved date space empty, then reveal the final local value once.
function localGeneratedTime(date: Date) {
  return generatedTimeFormatter.format(date);
}

export function DiagramMetadata({
  lastGenerated,
  cost,
}: {
  lastGenerated?: Date;
  cost?: GenerationCostSummary;
}) {
  const hydrated = useHydrated();
  if (!lastGenerated && !cost) return null;
  return (
    <div className={styles.resultMetadata}>
      {lastGenerated && (
        <span
          className={styles.generatedTime}
          data-hydrated={hydrated}
          aria-hidden={!hydrated}
        >
          上次生成{" "}
          <time
            dateTime={lastGenerated.toISOString()}
            title={lastGenerated.toISOString()}
          >
            {hydrated ? localGeneratedTime(lastGenerated) : null}
          </time>
        </span>
      )}
      {cost && (
        <span>
          {cost.kind === "actual" ? "实际" : "预估"}成本：{cost.display}
        </span>
      )}
    </div>
  );
}
