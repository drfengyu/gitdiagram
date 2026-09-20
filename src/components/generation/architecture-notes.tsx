"use client";

import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowDown, ChevronDown, FileText } from "lucide-react";
import styles from "./generation.module.css";

// A small, safe Markdown subset: no HTML, remote assets or syntax highlighter.
// Source offsets identify append-only text without remounting on each token.
function inlineText(text: string): ReactNode[] {
  return Array.from(
    text.matchAll(/`[^`]+`|\*\*[^*]+\*\*|[^`*]+|[`*]/g),
    (match) => {
      const part = match[0];
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={match.index}>{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={match.index}>{inlineText(part.slice(2, -2))}</strong>
        );
      }
      return part;
    },
  );
}

export const ArchitectureNotes = memo(function ArchitectureNotes({
  text = "",
  streaming,
  initiallyExpanded = false,
}: {
  text?: string;
  streaming: boolean;
  initiallyExpanded?: boolean;
}) {
  const id = useId();
  const paneRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const [expanded, setExpanded] = useState(initiallyExpanded);

  useEffect(() => {
    if (!streaming || !followingRef.current || !expanded) return;
    const frame = requestAnimationFrame(() => {
      const pane = paneRef.current;
      if (pane) pane.scrollTop = pane.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [text, expanded, streaming]);

  return (
    <div className={styles.notes} data-streaming={streaming && Boolean(text)}>
      <button
        type="button"
        className={styles.notesToggle}
        aria-label="架构概览"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded((value) => !value)}
      >
        <FileText size={15} aria-hidden="true" />
        <span>架构概览</span>
        <span className={styles.notesState}>
          {text ? (streaming ? "实时" : "完成") : "即将更新"}
        </span>
        <ChevronDown size={15} className={styles.chevron} aria-hidden="true" />
      </button>
      <div id={id} hidden={!expanded}>
        {expanded && (
          <div
            ref={paneRef}
            className={styles.notesBody}
            data-testid="generation-stream"
            role="region"
            aria-label="架构概览"
            tabIndex={text ? 0 : -1}
            onScroll={(event) => {
              const pane = event.currentTarget;
              const atBottom =
                pane.scrollHeight - pane.scrollTop - pane.clientHeight < 40;
              followingRef.current = atBottom;
              setFollowing(atBottom);
            }}
          >
            {text ? (
              <div className={styles.prose}>
                {Array.from(text.matchAll(/[^\n]+/g), (match) => {
                  const line = match[0];
                  if (!line.trim()) return null;
                  if (/^#{1,6}\s/.test(line)) {
                    return (
                      <p className={styles.noteHeading} key={match.index}>
                        {inlineText(line.replace(/^#{1,6}\s+/, ""))}
                      </p>
                    );
                  }
                  return (
                    <p key={match.index}>
                      {inlineText(line.replace(/^[-*]\s+/, "• "))}
                    </p>
                  );
                })}
                {streaming && (
                  <span className={styles.cursor} aria-hidden="true" />
                )}
              </div>
            ) : (
              <div className={styles.notesEmpty}>
                <p>解析仓库时，这里会显示实时概览。</p>
              </div>
            )}
          </div>
        )}
        {expanded && !following && streaming && (
          <button
            type="button"
            className={styles.followButton}
            onClick={() => {
              followingRef.current = true;
              setFollowing(true);
              if (paneRef.current)
                paneRef.current.scrollTop = paneRef.current.scrollHeight;
            }}
          >
            <ArrowDown size={13} aria-hidden="true" /> 跟随最新
          </button>
        )}
      </div>
    </div>
  );
});
