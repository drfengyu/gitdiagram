import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "~/components/copy-button";
import { TooltipProvider } from "~/components/ui/tooltip";

function renderCopyButton(onClick: () => Promise<void> | void) {
  return render(
    <TooltipProvider>
      <CopyButton onClick={onClick} />
    </TooltipProvider>,
  );
}

describe("CopyButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("announces success only after the clipboard write resolves", async () => {
    let resolveCopy!: () => void;
    const onClick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCopy = resolve;
        }),
    );
    renderCopyButton(onClick);

    fireEvent.click(
      screen.getByRole("button", { name: "复制 Mermaid.js 代码" }),
    );
    expect(
      screen.queryByRole("button", { name: "已复制 Mermaid 代码" }),
    ).not.toBeInTheDocument();

    resolveCopy();
    await screen.findByRole("button", { name: "已复制 Mermaid 代码" });
  });

  it("reports clipboard rejection instead of claiming success", async () => {
    renderCopyButton(() => Promise.reject(new Error("denied")));

    fireEvent.click(
      screen.getByRole("button", { name: "复制 Mermaid.js 代码" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "复制失败" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "已复制 Mermaid 代码" }),
    ).not.toBeInTheDocument();
  });
});
