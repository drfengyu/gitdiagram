const DEFAULT_SITE_URL = "https://gitdiagram.com";

// SITE_URL is interpolated into canonical links, robots, sitemap and every
// og:image, so a malformed override would poison SEO metadata site-wide.
function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_URL;

  try {
    const url = new URL(configured);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.origin;
    }
  } catch {
    // Falls through to the default below.
  }

  console.warn(
    JSON.stringify({
      event: "site.url.invalid_override",
      value: configured,
      fallback: DEFAULT_SITE_URL,
    }),
  );

  return DEFAULT_SITE_URL;
}

export const SITE_URL = resolveSiteUrl();
export const GITHUB_REPO_URL = "https://github.com/ahmedkhaleel2004/gitdiagram";
