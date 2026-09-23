import { getGitHubApiHeaders } from "../github-auth";
import {
  GitHubApiError,
  GitHubRequestError,
  type GitHubErrorCode,
  hasGitHubErrorCode,
} from "./github-errors";

interface GitHubRepoResponse {
  default_branch?: string;
  private?: boolean;
  stargazers_count?: number;
}

interface GitHubTreeItem {
  path?: unknown;
  type?: unknown;
  sha?: unknown;
  size?: unknown;
  mode?: unknown;
}

interface GitHubTreeResponse {
  tree?: GitHubTreeItem[];
  truncated?: boolean;
}

interface GitHubReadmeResponse {
  content?: unknown;
  encoding?: unknown;
  size?: unknown;
}

export interface SourceBlob {
  sha: string;
  size: number;
}

export interface GithubData {
  defaultBranch: string;
  fileTree: string;
  readme: string;
  isPrivate: boolean;
  /** Metadata/tree were authorized as public after a stale caller token failed. */
  usedPublicFallback?: boolean;
  stargazerCount: number | null;
  pathTypes: ReadonlyMap<string, RepositoryPathType>;
  sourceBlobs?: ReadonlyMap<string, SourceBlob>;
}

export type RepositoryPathType = "blob" | "tree";

export const REPOSITORY_TOO_LARGE_ERROR =
  "仓库过大(超过 195k tokens)，无法分析，请换小一些的仓库。";
// Messages this module authors itself. They describe the caller's own request
// and carry no upstream response text, so `normalizeGenerationError` is willing
// to show them verbatim.
const GITHUB_REQUEST_TIMEOUT_ERROR = "GitHub 请求超时，请重试。";
const REPOSITORY_NOT_FOUND_ERROR = "未找到该仓库。";
const FILE_TREE_UNAVAILABLE_ERROR = "无法获取仓库文件树。";
const EMPTY_REPOSITORY_ERROR = "无法获取仓库文件树，仓库可能为空或不可访问。";
function buildGithubRequestFailedError(status: number): string {
  return `GitHub 请求失败(${status})，请重试。`;
}
export const PRIVATE_REPOSITORY_AUTH_REQUIRED_ERROR =
  "分析私有仓库需要 GitHub 令牌。";
const UNEXPECTED_NOT_MODIFIED_ERROR = "GitHub 返回了意外的 not-modified 响应。";
export const MAX_INCLUDED_FILE_TREE_CHARACTERS = 780_000;
export const MAX_README_BYTES = 750_000;
export const GITHUB_REQUEST_TIMEOUT_MS = 30_000;
const MAX_PUBLIC_TREE_CACHE_ENTRIES = 8;
const MAX_PUBLIC_TREE_CACHE_CHARACTERS = 4_000_000;

interface PublicTreeCacheEntry {
  etag: string;
  fileTree: string;
  pathTypes: ReadonlyMap<string, RepositoryPathType>;
  sourceBlobs?: ReadonlyMap<string, SourceBlob>;
  characters: number;
}

type JsonFetchResult<T> =
  { notModified: true } | { notModified: false; value: T; etag: string | null };

// Fluid instances can reuse unchanged public trees without retaining private
// repository data. Every reuse is revalidated with GitHub, so repository
// changes remain visible immediately while 304 responses avoid the largest
// response body and JSON parse in the ingestion path.
const publicTreeCache = new Map<string, PublicTreeCacheEntry>();
let publicTreeCacheCharacters = 0;

function deletePublicTreeCacheEntry(key: string): void {
  const entry = publicTreeCache.get(key);
  if (entry && publicTreeCache.delete(key)) {
    publicTreeCacheCharacters -= entry.characters;
  }
}

// Directory segments are matched anywhere in the path.
const EXCLUDED_DIRECTORY_SEGMENTS = [
  "node_modules",
  "vendor",
  "venv",
  "__pycache__",
  ".cache",
  ".tmp",
  ".vscode",
  ".idea",
];

// Suffixes are matched against the end of the path only. Substring matching
// here silently drops real source files: ".ico" appears inside "ui.icons.ts",
// ".so" inside "data.source.ts", and ".class" inside "model.classifier.py".
const EXCLUDED_SUFFIXES = [
  ".pyc",
  ".pyo",
  ".pyd",
  ".so",
  ".dll",
  ".class",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".ico",
  ".svg",
  ".ttf",
  ".woff",
  ".woff2",
  ".webp",
  ".log",
  "yarn.lock",
  "poetry.lock",
];

// Minified bundles carry no architectural signal regardless of extension.
const MINIFIED_INFIX = ".min.";

function shouldIncludeFile(path: string): boolean {
  const lowerPath = path.toLowerCase();

  if (lowerPath.includes(MINIFIED_INFIX)) {
    return false;
  }

  if (EXCLUDED_SUFFIXES.some((suffix) => lowerPath.endsWith(suffix))) {
    return false;
  }

  return !lowerPath
    .split("/")
    .some((segment) => EXCLUDED_DIRECTORY_SEGMENTS.includes(segment));
}

async function fetchJsonResult<T>(
  url: string,
  headers: HeadersInit,
  notFoundMessage: string,
  signal?: AbortSignal,
  ifNoneMatch?: string,
  conflictMessage?: string,
  notFoundCode: GitHubErrorCode = "repository_not_found",
): Promise<JsonFetchResult<T>> {
  const timeoutSignal = AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS);
  const requestHeaders = new Headers(headers);
  if (ifNoneMatch) {
    requestHeaders.set("If-None-Match", ifNoneMatch);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      headers: requestHeaders,
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && !signal?.aborted) {
      throw new GitHubApiError("request_timeout", GITHUB_REQUEST_TIMEOUT_ERROR);
    }
    throw error;
  }

  if (response.status === 304 && ifNoneMatch) {
    return { notModified: true };
  }

  if (response.status === 404) {
    throw new GitHubRequestError(notFoundMessage, 404, false, notFoundCode);
  }

  // GitHub answers 409 ("Git Repository is empty.") for zero-commit repos on
  // the trees endpoint — a permanent condition, not a transient failure.
  if (response.status === 409 && conflictMessage) {
    throw new GitHubApiError("repository_empty", conflictMessage);
  }

  if (!response.ok) {
    // GitHub's error body describes *our* credential when the server key is the
    // one being rejected or throttled, and this message reaches the client and
    // the persisted audit. Keep the body in the server log only.
    console.error(
      JSON.stringify({
        event: "generate.github.request_failed",
        status: response.status,
        request_id: response.headers.get("x-github-request-id"),
        rate_limit_remaining: response.headers.get("x-ratelimit-remaining"),
        rate_limit_reset: response.headers.get("x-ratelimit-reset"),
        retry_after: response.headers.get("retry-after"),
        body: (await response.text()).slice(0, 500),
      }),
    );
    throw new GitHubRequestError(
      buildGithubRequestFailedError(response.status),
      response.status,
      response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.has("retry-after"),
    );
  }

  return {
    notModified: false,
    value: (await response.json()) as T,
    etag: response.headers.get("etag"),
  };
}

async function fetchJson<T>(
  url: string,
  headers: HeadersInit,
  notFoundMessage: string,
  signal?: AbortSignal,
  notFoundCode: GitHubErrorCode = "repository_not_found",
): Promise<T> {
  const result = await fetchJsonResult<T>(
    url,
    headers,
    notFoundMessage,
    signal,
    undefined,
    undefined,
    notFoundCode,
  );
  if (result.notModified) {
    throw new GitHubApiError(
      "not_modified_conflict",
      UNEXPECTED_NOT_MODIFIED_ERROR,
    );
  }
  return result.value;
}

async function getRepoMetadata(
  username: string,
  repo: string,
  headers: HeadersInit,
  signal?: AbortSignal,
): Promise<{
  defaultBranch: string;
  isPrivate: boolean;
  stargazerCount: number | null;
}> {
  const data = await fetchJson<GitHubRepoResponse>(
    `https://api.github.com/repos/${username}/${repo}`,
    headers,
    REPOSITORY_NOT_FOUND_ERROR,
    signal,
  );

  return {
    defaultBranch: data.default_branch || "main",
    isPrivate: Boolean(data.private),
    stargazerCount:
      typeof data.stargazers_count === "number" ? data.stargazers_count : null,
  };
}

const USER_NOT_FOUND_ERROR = "未找到该 GitHub 用户。";

/**
 * Whether a GitHub owner account exists. Backs the repo page's 404 decision:
 * a missing account is unambiguous, while a repo 404 is not (GitHub answers
 * 404 for repositories the requester cannot see too), so only this check may
 * short-circuit a page visit. Anything but a clean 404 fails open to
 * "unknown" — throttled or broken checks must never 404 a live repo.
 */
export async function checkGitHubUserExists(
  username: string,
): Promise<"exists" | "missing" | "unknown"> {
  try {
    await fetchJson(
      `https://api.github.com/users/${encodeURIComponent(username)}`,
      await getGitHubApiHeaders(),
      USER_NOT_FOUND_ERROR,
      undefined,
      "user_not_found",
    );
    return "exists";
  } catch (error) {
    if (hasGitHubErrorCode(error, "user_not_found")) {
      return "missing";
    }
    return "unknown";
  }
}

async function getFileTree(
  username: string,
  repo: string,
  branch: string,
  headers: HeadersInit,
  usePublicConditionalCache: boolean,
  signal?: AbortSignal,
): Promise<{
  fileTree: string;
  pathTypes: ReadonlyMap<string, RepositoryPathType>;
  sourceBlobs?: ReadonlyMap<string, SourceBlob>;
}> {
  // Branch names may contain URL-significant characters ("#", "?", …).
  // encodeURIComponent also encodes "/" as %2F, which the trees API accepts
  // in the {tree_sha} position; plain branch names are unchanged.
  const url = `https://api.github.com/repos/${username}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const cached = usePublicConditionalCache
    ? publicTreeCache.get(url)
    : undefined;
  if (cached) {
    publicTreeCache.delete(url);
    publicTreeCache.set(url, cached);
  }
  const result = await fetchJsonResult<GitHubTreeResponse>(
    url,
    headers,
    FILE_TREE_UNAVAILABLE_ERROR,
    signal,
    cached?.etag,
    EMPTY_REPOSITORY_ERROR,
    "tree_unavailable",
  );
  if (result.notModified && cached) {
    return {
      fileTree: cached.fileTree,
      pathTypes: cached.pathTypes,
      sourceBlobs: cached.sourceBlobs,
    };
  }
  if (result.notModified) {
    throw new GitHubApiError(
      "not_modified_conflict",
      UNEXPECTED_NOT_MODIFIED_ERROR,
    );
  }
  const data = result.value;

  if (data.truncated === true) {
    throw new GitHubApiError(
      "repository_too_large",
      REPOSITORY_TOO_LARGE_ERROR,
    );
  }

  const paths: string[] = [];
  const pathTypes = new Map<string, RepositoryPathType>();
  const sourceBlobs = new Map<string, SourceBlob>();
  for (const item of data.tree ?? []) {
    if (typeof item.path === "string" && shouldIncludeFile(item.path)) {
      paths.push(item.path);
      if (item.type === "blob" || item.type === "tree") {
        pathTypes.set(item.path, item.type);
        if (
          item.type === "blob" &&
          (item.mode === "100644" || item.mode === "100755") &&
          typeof item.sha === "string" &&
          /^[a-f0-9]{40,64}$/.test(item.sha) &&
          typeof item.size === "number" &&
          item.size >= 0
        ) {
          sourceBlobs.set(item.path, { sha: item.sha, size: item.size });
        }
      }
    }
  }

  if (!paths.length) {
    throw new GitHubApiError("repository_empty", EMPTY_REPOSITORY_ERROR);
  }

  const fileTree = paths.join("\n");
  if (fileTree.length > MAX_INCLUDED_FILE_TREE_CHARACTERS) {
    throw new GitHubApiError(
      "repository_too_large",
      REPOSITORY_TOO_LARGE_ERROR,
    );
  }

  if (usePublicConditionalCache) {
    deletePublicTreeCacheEntry(url);
    if (result.etag) {
      while (
        publicTreeCache.size >= MAX_PUBLIC_TREE_CACHE_ENTRIES ||
        publicTreeCacheCharacters + fileTree.length >
          MAX_PUBLIC_TREE_CACHE_CHARACTERS
      ) {
        const oldestKey = publicTreeCache.keys().next().value;
        if (typeof oldestKey !== "string") {
          break;
        }
        deletePublicTreeCacheEntry(oldestKey);
      }
      publicTreeCache.set(url, {
        etag: result.etag,
        fileTree,
        pathTypes,
        sourceBlobs,
        characters: fileTree.length,
      });
      publicTreeCacheCharacters += fileTree.length;
    }
  }

  return { fileTree, pathTypes, sourceBlobs };
}

class MissingReadmeError extends Error {}

const MISSING_README_MESSAGE = "未找到该仓库的 README。";

async function getReadme(
  username: string,
  repo: string,
  headers: HeadersInit,
  signal?: AbortSignal,
): Promise<string> {
  let data: GitHubReadmeResponse;
  try {
    data = await fetchJson<GitHubReadmeResponse>(
      `https://api.github.com/repos/${username}/${repo}/readme`,
      headers,
      MISSING_README_MESSAGE,
      signal,
      "readme_not_found",
    );
  } catch (error) {
    // The 404 arrives as a `GitHubRequestError` from the shared fetch helper,
    // while an oversized or empty-body README is a plain absence; both mean
    // "this repository has no readable README" and must not become a
    // repository-level failure.
    if (hasGitHubErrorCode(error, "readme_not_found")) {
      throw new MissingReadmeError(MISSING_README_MESSAGE);
    }
    throw error;
  }

  if (typeof data.size === "number" && data.size > MAX_README_BYTES) {
    throw new GitHubApiError(
      "repository_too_large",
      REPOSITORY_TOO_LARGE_ERROR,
    );
  }

  if (typeof data.content !== "string" || !data.content) {
    throw new MissingReadmeError(MISSING_README_MESSAGE);
  }

  // GitHub's contents API returns base64 with line breaks. Bound the encoded
  // payload too, so malformed metadata cannot bypass the decoded byte limit.
  if (data.content.length > MAX_README_BYTES * 2) {
    throw new GitHubApiError(
      "repository_too_large",
      REPOSITORY_TOO_LARGE_ERROR,
    );
  }

  let readme: string;
  if (data.encoding === "base64") {
    readme = Buffer.from(data.content, "base64").toString("utf-8");
  } else {
    readme = data.content;
  }

  if (Buffer.byteLength(readme, "utf-8") > MAX_README_BYTES) {
    throw new GitHubApiError(
      "repository_too_large",
      REPOSITORY_TOO_LARGE_ERROR,
    );
  }

  return readme;
}

async function fetchGithubData(
  username: string,
  repo: string,
  githubPat?: string,
  signal?: AbortSignal,
): Promise<GithubData> {
  const hasCallerGithubPat = Boolean(githubPat?.trim());
  const headers = await getGitHubApiHeaders({ githubPat });
  const { defaultBranch, isPrivate, stargazerCount } = await getRepoMetadata(
    username,
    repo,
    headers,
    signal,
  );

  // GitHub App installation tokens and the server PAT pool may be able to read
  // private repositories. They improve public API rate limits, but they must
  // never become authorization for an anonymous caller.
  if (isPrivate && !hasCallerGithubPat) {
    throw new GitHubApiError(
      "token_required",
      PRIVATE_REPOSITORY_AUTH_REQUIRED_ERROR,
    );
  }

  const [tree, readmeResult] = await Promise.all([
    getFileTree(
      username,
      repo,
      defaultBranch,
      headers,
      !hasCallerGithubPat && !isPrivate,
      signal,
    ),
    getReadme(username, repo, headers, signal).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  ]);
  // A repository without a README is still perfectly diagrammable from its file
  // tree, so only a genuine fetch failure should abort the run.
  if (!readmeResult.ok && !(readmeResult.error instanceof MissingReadmeError)) {
    throw readmeResult.error;
  }

  return {
    defaultBranch,
    fileTree: tree.fileTree,
    readme: readmeResult.ok ? readmeResult.value : "",
    isPrivate,
    stargazerCount,
    pathTypes: tree.pathTypes,
    sourceBlobs: tree.sourceBlobs,
  };
}

export async function getGithubData(
  username: string,
  repo: string,
  githubPat?: string,
  signal?: AbortSignal,
): Promise<GithubData> {
  try {
    return await fetchGithubData(username, repo, githubPat, signal);
  } catch (error) {
    if (
      !githubPat?.trim() ||
      !(error instanceof GitHubRequestError) ||
      ![401, 403, 404].includes(error.status) ||
      signal?.aborted
    )
      throw error;

    // An expired/restricted saved token must not block public repositories.
    // No caller token means fetchGithubData rejects private metadata BEFORE
    // reading contents, even if the server's installation could access it.
    try {
      const publicData = await fetchGithubData(
        username,
        repo,
        undefined,
        signal,
      );
      console.info(
        JSON.stringify({ event: "generate.github.public_fallback_succeeded" }),
      );
      return { ...publicData, usedPublicFallback: true };
    } catch {
      // Preserve the caller's actionable credential/access failure without
      // revealing whether the server can see a private repository.
      signal?.throwIfAborted();
      throw error;
    }
  }
}
