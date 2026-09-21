// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SponsorCatalogRow, SponsorSlot } from "./sponsor-slot";
import type { SponsorPlacement } from "~/features/sponsors/types";

afterEach(cleanup);

const placement: SponsorPlacement = {
  id: "3f0c1b6a-2d5e-4a11-9c7f-6b1e2d4a8c90",
  name: "Acme Cloud",
  body: "为开发者而生的云。",
  cta: "了解一下",
  href: "https://acme.example/",
  logoText: "AC",
};

describe("SponsorSlot", () => {
  it("keeps the placeholder when no sponsor is assigned", () => {
    render(<SponsorSlot surface="home" />);

    expect(screen.getByText("你的公司")).toBeTruthy();
    expect(screen.getByText("赞助位")).toBeTruthy();
    expect(screen.getByLabelText("首页赞助位").getAttribute("href")).toBe(
      "/sponsor",
    );
  });

  it("renders the assigned sponsor as a sponsored placement", () => {
    render(<SponsorSlot surface="diagram" sponsor={placement} />);

    const link = screen.getByLabelText("仓库图表赞助位");
    expect(screen.getByText("Acme Cloud")).toBeTruthy();
    expect(screen.getByText("已赞助")).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://acme.example/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("routes an internal href without external-link attributes", () => {
    render(
      <SponsorSlot
        surface="home"
        sponsor={{ ...placement, href: "/pricing" }}
      />,
    );

    const link = screen.getByLabelText("首页赞助位");
    expect(link.getAttribute("href")).toBe("/pricing");
    expect(link.getAttribute("target")).toBeNull();
  });
});

describe("SponsorCatalogRow", () => {
  it("falls back to the placeholder copy without a sponsor", () => {
    const { container } = render(
      <table>
        <tbody>
          <SponsorCatalogRow />
        </tbody>
      </table>,
    );

    expect(container.textContent).toContain("你的公司");
    expect(container.querySelector("tr")?.getAttribute("aria-label")).toBe(
      "浏览目录赞助位",
    );
  });

  it("shows the assigned sponsor", () => {
    const { container } = render(
      <table>
        <tbody>
          <SponsorCatalogRow sponsor={placement} />
        </tbody>
      </table>,
    );

    expect(container.textContent).toContain("Acme Cloud");
    expect(container.textContent).toContain("已赞助");
  });
});
