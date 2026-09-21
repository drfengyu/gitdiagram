export type SponsorSurface = "home" | "diagram" | "browse";

/** 名单上限：既防误操作，也让管理页不必为无限列表做虚拟滚动。 */
export const MAX_SPONSORS = 25;

export type Sponsor = {
  id: string;
  name: string;
  body: string;
  cta: string;
  href: string;
  logoText?: string;
  logoSrc?: string;
  active: boolean;
  sortOrder: number;
};

/** 已选中并交给某个展示位渲染的那一家；`null` 表示该位置走占位文案。 */
export type SponsorPlacement = {
  id: string;
  name: string;
  body: string;
  cta: string;
  href: string;
  logoText?: string;
  logoSrc?: string;
};

export type SponsorPlacements = Record<SponsorSurface, SponsorPlacement | null>;
