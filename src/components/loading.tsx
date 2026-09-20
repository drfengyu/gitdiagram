import styles from "./generation/workspace.module.css";

export default function Loading() {
  return (
    <section className={styles.workspace} aria-label="正在加载仓库">
      <span className="sr-only" role="status">
        正在加载图表
      </span>
    </section>
  );
}
