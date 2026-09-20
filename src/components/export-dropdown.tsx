import { CopyButton } from "./copy-button";
import { Image as ImageIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import type { GenerationCostSummary } from "~/features/diagram/cost";

interface ExportDropdownProps {
  onCopy: () => Promise<void> | void;
  lastGenerated?: Date;
  costSummary?: GenerationCostSummary;
  onExportImage: () => void;
}

export function ExportDropdown({
  onCopy,
  lastGenerated,
  costSummary,
  onExportImage,
}: ExportDropdownProps) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={(event) => {
                event.preventDefault();
                onExportImage();
              }}
              className="neo-button h-11 w-full px-3 text-sm sm:h-10 sm:w-auto sm:p-6 sm:px-6 sm:text-lg"
            >
              <ImageIcon className="h-6 w-6" />
              <span className="text-sm">下载 PNG</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>将图表下载为高质量 PNG</p>
          </TooltipContent>
        </Tooltip>
        <CopyButton onClick={onCopy} />
      </div>

      {lastGenerated ? (
        <div className="flex items-center">
          <span className="text-xs text-gray-700 sm:text-sm dark:text-neutral-300">
            上次生成：{lastGenerated.toLocaleString()}
          </span>
        </div>
      ) : null}
      {costSummary ? (
        <div className="flex items-center">
          <span className="text-xs text-gray-700 sm:text-sm dark:text-neutral-300">
            {costSummary.kind === "actual" ? "实际" : "预估"} 成本：{" "}
            {costSummary.display}
          </span>
        </div>
      ) : null}
    </div>
  );
}
