import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiagramStreamState } from "~/features/diagram/types";
import RepoPageClient from "./repo-page-client";
import controls from "~/components/generation/workspace.module.css";
const { warningToast } = vi.hoisted(() => ({ warningToast: vi.fn() }));
const useDiagram = vi.fn();
const retry = vi.fn();
const openKey = vi.fn();
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: { warning: warningToast },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("~/hooks/useDiagram", () => ({
  useDiagram: (...args: unknown[]) => useDiagram(...args),
}));
vi.mock("~/components/sponsor-slot", () => ({ SponsorSlot: () => null }));
vi.mock("~/components/mermaid-diagram", () => ({
  default: ({
    chart,
    onRenderComplete,
  }: {
    chart: string;
    onRenderComplete?: () => void;
  }) => (
    <div data-testid="diagram">
      {chart}
      <button onClick={onRenderComplete}>Finish rendering</button>
    </div>
  ),
}));
vi.mock("~/components/api-key-dialog", () => ({ ApiKeyDialog: () => null }));
function setup(state: DiagramStreamState) {
  useDiagram.mockReturnValue({
    diagram: state.diagram ?? "",
    error: state.error ?? "",
    loading: false,
    showApiKeyDialog: false,
    handleRegenerate: retry,
    handleCancel: vi.fn(),
    handleDiagramRenderError: vi.fn(),
    handleOpenApiKeyDialog: openKey,
    state,
  });
}
describe("RepoPageClient", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);
  it("keeps a cached diagram available alongside latest failure recovery", async () => {
    setup({
      status: "error",
      diagram: "flowchart TD\nA-->B",
      error: "Latest regeneration failed.",
    });
    render(<RepoPageClient username="Acme" repo="Demo" />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Finish rendering",
        hidden: true,
      }),
    );
    expect(screen.getByTestId("diagram").parentElement).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    expect(screen.getByText("Latest regeneration failed.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("warns when a completed diagram could not be persisted", () => {
    const persistenceWarning =
      "The diagram was generated, but could not be cached.";
    setup({
      status: "complete",
      diagram: "flowchart TD\nA-->B",
      persistenceWarning,
    });
    render(<RepoPageClient username="Acme" repo="Demo" />);
    expect(warningToast).toHaveBeenCalledWith(
      "图表已生成，但未保存到服务端",
      expect.objectContaining({ description: persistenceWarning }),
    );
  });
  it("offers the API key escape hatch on rate limits", () => {
    setup({
      status: "error",
      error: "Too many free generations. Try again later.",
      errorCode: "RATE_LIMITED",
    });
    render(<RepoPageClient username="Acme" repo="Demo" />);
    fireEvent.click(
      screen.getByRole("button", { name: "使用你自己的 API Key" }),
    );
    expect(openKey).toHaveBeenCalledOnce();
  });
  it("does not suggest API keys for unrelated failures", () => {
    setup({ status: "error", error: "Something went wrong." });
    render(<RepoPageClient username="Acme" repo="Demo" />);
    expect(
      screen.queryByRole("button", { name: "使用你自己的 API Key" }),
    ).not.toBeInTheDocument();
  });
  it("shows final cost within Activity", async () => {
    setup({
      status: "complete",
      diagram: "flowchart TD\nA-->B",
      costSummary: {
        kind: "estimate",
        approximate: true,
        amountUsd: 0.01,
        display: "$0.0100 USD",
        pricingModel: "gpt-5.6-terra",
        usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
      },
    });
    render(<RepoPageClient username="Acme" repo="Demo" />);
    expect(screen.getByRole("button", { name: "导出" })).toBeDisabled();
    expect(screen.queryByText("预估成本：$0.0100 USD")).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Finish rendering",
        hidden: true,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "活动" }));
    expect(screen.getByRole("region", { name: "生成活动" })).toHaveTextContent(
      "预估成本：$0.0100 USD",
    );
  });
  it("offers GitHub access recovery and retries the current repository", () => {
    setup({
      status: "error",
      error: "Check your GitHub access.",
      errorCode: "GITHUB_TOKEN_INVALID",
    });
    render(<RepoPageClient username="Acme" repo="Demo" />);
    expect(
      screen.getByRole("button", { name: "添加 GitHub 访问" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "使用你自己的 API Key" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "在 GitHub 中打开仓库" }),
    ).toHaveAttribute("href", "https://github.com/acme/demo");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it.each([
    ["REPOSITORY_NOT_FOUND", "是私有仓库吗？"],
    ["GITHUB_AUTH_REQUIRED", "这个仓库需要 GitHub 访问权限"],
    ["GITHUB_ACCESS_DENIED", "你的令牌缺少仓库读取权限"],
    ["GITHUB_TOKEN_INVALID", "请更新你的 GitHub 令牌"],
  ] as const)(
    "presents %s as an access step instead of a generation failure",
    (errorCode, title) => {
      setup({
        status: "error",
        errorCode,
        error: "Add GitHub access to continue.",
      });
      render(<RepoPageClient username="Acme" repo="Demo" />);
      expect(screen.getByRole("alert")).toHaveTextContent(title);
      expect(screen.queryByText("无法生成图表")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "添加 GitHub 访问" }),
      ).toHaveClass(controls.actionButton!, controls.primary!);
      expect(
        screen.getByRole("link", { name: "在 GitHub 中打开仓库" }),
      ).toHaveClass(controls.actionButton!);
    },
  );
});
