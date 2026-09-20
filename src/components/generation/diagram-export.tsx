"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Copy, Download, ImageDown } from "lucide-react";
import { exportMermaidSvgAsPng } from "~/features/diagram/export";
import { TooltipProvider } from "~/components/ui/tooltip";
import { ExportAction } from "./export-action";
import styles from "./workspace.module.css";

export function DiagramExport({
  diagram,
  getSvg,
  disabled = false,
}: {
  diagram: string;
  getSvg: () => SVGSVGElement | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pointerMotion, setPointerMotion] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPointerMotion(false);
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className={styles.exportControl} ref={container}>
      <button
        ref={trigger}
        type="button"
        className={styles.actionButton}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={(event) => {
          setPointerMotion(event.detail !== 0);
          setOpen(!open);
        }}
      >
        <Download size={13} aria-hidden="true" /> 导出{" "}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      <div
        id={id}
        className={styles.exportMenu}
        role="group"
        aria-label="导出图表"
        data-open={open}
        data-motion={pointerMotion}
        aria-hidden={!open}
        inert={!open}
      >
        <TooltipProvider delayDuration={350} skipDelayDuration={300}>
          <div className={styles.exportOptions}>
            <ExportAction
              label="下载 PNG"
              successLabel="已下载"
              announcement="PNG 已下载"
              description="保存图表的高清图片"
              errorMessage="下载失败，请重试。"
              icon={ImageDown}
              onAction={async () => {
                const svg = getSvg();
                if (!svg) throw new Error("Diagram not ready");
                await exportMermaidSvgAsPng(
                  svg,
                  getComputedStyle(document.body).backgroundColor,
                );
              }}
            />
            <ExportAction
              label="复制 Mermaid"
              successLabel="已复制"
              announcement="Mermaid 已复制"
              description="复制可编辑的 Mermaid 图表代码"
              errorMessage="复制失败，请重试。"
              icon={Copy}
              onAction={() => navigator.clipboard.writeText(diagram)}
            />
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
