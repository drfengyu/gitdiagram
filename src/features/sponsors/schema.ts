import { z } from "zod";

import { MAX_SPONSORS } from "./types";

// href 会进 `<a href>`,所以只收 https 或站内绝对路径，挡掉 javascript:/data:。
const hrefSchema = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (value) => value.startsWith("/") || /^https:\/\/[^\s]+$/.test(value),
    "链接必须是 https 地址或站内路径。",
  );

// CSP 的 img-src 是 'self'，外链 logo 会被浏览器拦掉，所以只收站内路径。
const logoSrcSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
    message: "logo 只能是站内路径。",
  });

const sponsorSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  body: z.string().min(1).max(160),
  cta: z.string().min(1).max(24),
  href: hrefSchema,
  logoText: z.string().min(1).max(4).optional(),
  logoSrc: logoSrcSchema.optional(),
  active: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
});

export const sponsorListSchema = z.strictObject({
  version: z.literal(1),
  updatedAt: z.string().min(1),
  sponsors: z.array(sponsorSchema).max(MAX_SPONSORS),
});

const sponsorInputSchema = z.strictObject({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(60),
  body: z.string().min(1).max(160),
  cta: z.string().min(1).max(24),
  href: hrefSchema,
  logoText: z.string().min(1).max(4).optional(),
  logoSrc: logoSrcSchema.optional(),
  active: z.boolean(),
});

export const sponsorListWriteSchema = z.strictObject({
  baseEtag: z.string().min(1).max(128).nullable(),
  sponsors: z.array(sponsorInputSchema).max(MAX_SPONSORS),
});

export type SponsorInput = z.infer<typeof sponsorInputSchema>;
