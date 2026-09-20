import type { RefObject } from "react";
import { ArrowUpRight, GitBranch, Square } from "lucide-react";
import styles from "./workspace.module.css";

export function RepositorySource({
  repository,
  active,
  stopRef,
  onCancel,
  onRetry,
}: {
  repository: string;
  active: boolean;
  stopRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const [owner, name] = repository.split("/");
  return (
    <div className={styles.source}>
      <div className={styles.repositoryControl}>
        <GitBranch size={18} aria-hidden="true" />
        <a
          className={styles.repositoryName}
          href={`https://github.com/${repository}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{owner} / </span>
          <strong>{name}</strong>
        </a>
        {active ? (
          <button
            ref={stopRef}
            type="button"
            className={styles.stop}
            aria-label="停止生成"
            onClick={onCancel}
          >
            <Square size={12} fill="currentColor" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className={styles.primary} onClick={onRetry}>
            重试 <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
