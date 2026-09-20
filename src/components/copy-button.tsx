import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { FileText, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface CopyButtonProps {
  onClick: () => Promise<void> | void;
}

export function CopyButton({ onClick }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = async () => {
    setCopyFailed(false);
    try {
      await onClick();
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
    }, 2000);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          onClick={handleClick}
          aria-label={
            copied
              ? "已复制 Mermaid 代码"
              : copyFailed
                ? "复制失败"
                : "复制 Mermaid.js 代码"
          }
          className="neo-button h-11 w-full px-3 text-sm sm:h-10 sm:w-auto sm:p-6 sm:px-6 sm:text-lg"
        >
          <span className="copy-button-content" aria-hidden="true">
            <span className="copy-button-state" data-active={!copied}>
              <FileText className="h-6 w-6" />
              <span className="text-sm">复制 Mermaid.js 代码</span>
            </span>
            <span className="copy-button-state" data-active={copied}>
              <Check className="h-6 w-6" />
              <span className="text-sm">已复制！</span>
            </span>
          </span>
          <span className="sr-only" aria-live="polite">
            {copied
              ? "Mermaid 代码已复制到剪贴板"
              : copyFailed
                ? "无法复制 Mermaid 代码"
                : ""}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {copied
            ? "已复制！"
            : copyFailed
              ? "复制失败"
              : "复制生成图表所需的内部 Mermaid.js 代码"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
