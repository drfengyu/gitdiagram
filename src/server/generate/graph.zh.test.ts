// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { DiagramGraph } from "~/features/diagram/graph";
import {
  buildFileTreeLookup,
  compileDiagramGraph,
  validateDiagramGraph,
} from "~/server/generate/graph";
import { validateMermaidSyntax } from "~/server/generate/mermaid";

/**
 * The graph planner is told to answer in Simplified Chinese, so CJK labels are
 * production input rather than an edge case. These checks pin that a Chinese
 * graph survives validation, compilation and Mermaid's parser unchanged.
 */
function chineseGraph(): DiagramGraph {
  return {
    groups: [
      { id: "runtime", label: "运行时", description: "主流程所在的进程" },
    ],
    nodes: [
      {
        id: "api",
        label: "HTTP 入口",
        type: "服务",
        description: "接收外部请求",
        groupId: "runtime",
        path: "src/api.ts",
        shape: "box",
      },
      {
        id: "queue",
        label: "Redis 队列",
        type: "队列",
        description: null,
        groupId: "runtime",
        path: "src/queue.ts",
        shape: "queue",
      },
      {
        id: "worker",
        label: "后台任务",
        type: "工作进程",
        description: "消费队列并写回状态",
        groupId: null,
        path: null,
        shape: "hexagon",
      },
    ],
    edges: [
      {
        from: "api",
        to: "queue",
        label: "派发",
        description: null,
        style: "solid",
      },
      {
        from: "worker",
        to: "queue",
        label: "消费",
        description: null,
        style: "dashed",
      },
    ],
  };
}

const diagram = compileDiagramGraph({
  graph: chineseGraph(),
  username: "acme",
  repo: "demo",
  branch: "main",
});

describe("chinese graph labels", () => {
  it("passes validation without a single issue", () => {
    const { issues } = validateDiagramGraph(
      chineseGraph(),
      buildFileTreeLookup("src/api.ts\nsrc/queue.ts"),
    );

    expect(issues).toEqual([]);
  });

  it("compiles the labels verbatim instead of escaping them away", () => {
    // The compiler joins a node label with its type or path, so the assertions
    // match the whole quoted label rather than the bare Chinese noun.
    expect(diagram).toContain('"HTTP 入口<br/>服务"');
    expect(diagram).toContain('"Redis 队列<br/>[queue.ts]"');
    expect(diagram).toContain('-->|"派发"|');
    expect(diagram).toContain('group_runtime["运行时"]');
  });

  it("stays parseable by mermaid", async () => {
    await expect(validateMermaidSyntax(diagram)).resolves.toMatchObject({
      valid: true,
    });
  });
});
