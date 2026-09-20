import type { DiagramStreamState } from "~/features/diagram/types";
import { githubAccessTitle } from "~/features/diagram/github-access";
import { generationStep } from "./progress";

function generationTitle(state: DiagramStreamState) {
  if (state.status === "idle") return "正在打开你的图表";
  if (state.status === "started")
    return state.lastActivityAt ? "正在读取仓库" : "正在连接你的仓库";
  if (generationStep(state.status) === 1) return "正在理解架构";
  if (state.status === "graph_retry") return "正在完善连接";
  if (state.status === "diagram_compiling" || state.status === "complete")
    return "正在绘制你的图表";
  return "正在梳理连接";
}

export function feedbackState(
  state: DiagramStreamState,
  active: boolean,
  renderFailed: boolean,
  seconds: number,
  now: number,
) {
  const failed = state.status === "error" || renderFailed;
  const cancelled = state.errorCode === "GENERATION_CANCELLED";
  const rendering =
    state.status === "diagram_compiling" || state.status === "complete";
  const quiet =
    active &&
    !rendering &&
    (state.lastActivityAt !== undefined
      ? now - state.lastActivityAt > 25_000
      : seconds > 25);
  if (failed)
    return {
      failed,
      cancelled,
      quiet,
      title: cancelled
        ? "已停止生成"
        : renderFailed
          ? "无法显示图表"
          : (githubAccessTitle(state.errorCode) ?? "无法生成图表"),
      description: cancelled ? "" : state.error,
    };
  return {
    failed,
    cancelled,
    quiet,
    title: quiet ? "等待更新" : generationTitle(state),
    description: quiet
      ? "服务器暂无新进度。"
      : seconds >= 20 && state.lastActivityAt && !rendering
        ? "仍在生成中 · 持续接收更新"
        : "",
  };
}
