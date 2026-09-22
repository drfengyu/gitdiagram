"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ExternalLink, Key, LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import type { DiagramStateResponse } from "~/features/diagram/types";
import { RepositoryWorkspace } from "~/components/generation/repository-workspace";
import { loadDiagramRenderer } from "~/components/generation/load-diagram-renderer";
import { useDiagram } from "~/hooks/useDiagram";
import { ApiKeyDialog } from "~/components/api-key-dialog";
import type { SponsorPlacement } from "~/features/sponsors/types";

import { Toaster } from "~/components/ui/sonner";
import { TooltipProvider } from "~/components/ui/tooltip";
import { isExampleRepo } from "~/lib/exampleRepos";
import {
  githubAccessTitle,
  isApiKeyCtaErrorCode,
} from "~/features/diagram/github-access";
import controls from "~/components/generation/workspace.module.css";

const PrivateReposDialog = dynamic(
  () =>
    import("~/components/private-repos-dialog").then(
      (module) => module.PrivateReposDialog,
    ),
  { ssr: false },
);

type RepoPageClientProps = {
  sponsor?: SponsorPlacement | null;
  username: string;
  repo: string;
  initialState?: DiagramStateResponse | null;
  initialStateIsAuthoritative?: boolean;
};

function readModelFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("model");
  } catch {
    return null;
  }
}

export default function RepoPageClient({
  username,
  repo,
  initialState = null,
  initialStateIsAuthoritative = false,
  sponsor,
}: RepoPageClientProps) {
  const [showGithubAccess, setShowGithubAccess] = useState(false);
  const [gatewayKeyPortalUrl, setGatewayKeyPortalUrl] = useState<string | null>(
    null,
  );
  // Read synchronously so the very first generation already uses the choice;
  // the value never reaches render output, so there is no hydration mismatch.
  const [model] = useState<string | null>(readModelFromUrl);
  const normalizedUsername = username.toLowerCase();
  const normalizedRepo = repo.toLowerCase();
  const repository = `${normalizedUsername}/${normalizedRepo}`;
  const {
    diagram,
    loading,
    lastGenerated,
    showApiKeyDialog,
    handleApiKeySaved,
    handleCloseApiKeyDialog,
    handleOpenApiKeyDialog,
    handleRegenerate,
    handleCancel,
    handleDiagramRenderError,
    state,
  } = useDiagram(
    normalizedUsername,
    normalizedRepo,
    initialState,
    initialStateIsAuthoritative,
    model ?? undefined,
  );
  const hasDiagram = Boolean(diagram);
  const showApiKeyCta = isApiKeyCtaErrorCode(state.errorCode);
  const showGithubAccessCta = Boolean(githubAccessTitle(state.errorCode));

  useEffect(() => {
    if (hasDiagram || loading) void loadDiagramRenderer();
  }, [hasDiagram, loading]);
  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    fetch("/api/gateway/models", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { key_portal_url?: unknown } | null) => {
        if (!cancelled && typeof data?.key_portal_url === "string") {
          setGatewayKeyPortalUrl(data.key_portal_url);
        }
      })
      .catch(() => {
        // The dialog falls back to generic instructions without the link.
      });
    return () => {
      cancelled = true;
    };
  }, [model]);
  useEffect(() => {
    if (!state.persistenceWarning) return;
    toast.warning("图表已生成，但未保存到服务端", {
      description: state.persistenceWarning,
      duration: 8_000,
    });
  }, [state.persistenceWarning]);

  return (
    <TooltipProvider delayDuration={500} skipDelayDuration={300}>
      <main>
        <RepositoryWorkspace
          sponsor={sponsor}
          repository={repository}
          state={state}
          loading={loading}
          lastGenerated={lastGenerated}
          onRegenerate={() => void handleRegenerate()}
          onCancel={handleCancel}
          onRenderError={handleDiagramRenderError}
          regenerateDisabled={isExampleRepo(normalizedUsername, normalizedRepo)}
          recovery={
            <>
              {showGithubAccessCta && (
                <button
                  type="button"
                  onClick={() => setShowGithubAccess(true)}
                  className={`${controls.actionButton} ${controls.primary}`}
                >
                  <LockKeyhole size={14} aria-hidden="true" />
                  添加 GitHub 访问
                </button>
              )}
              {showApiKeyCta && (
                <button
                  type="button"
                  onClick={handleOpenApiKeyDialog}
                  className={`${controls.actionButton} ${controls.primary}`}
                >
                  <Key size={14} aria-hidden="true" />
                  使用你自己的 API Key
                </button>
              )}
              <a
                href={`https://github.com/${repository}`}
                target="_blank"
                rel="noopener noreferrer"
                className={controls.actionButton}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />在 GitHub
                中打开仓库
              </a>
            </>
          }
        />
        <ApiKeyDialog
          isOpen={showApiKeyDialog}
          onClose={handleCloseApiKeyDialog}
          onSaved={handleApiKeySaved}
          gatewayMode={Boolean(model)}
          keyPortalUrl={gatewayKeyPortalUrl}
        />
        {showGithubAccess && (
          <PrivateReposDialog
            isOpen
            repository={repository}
            onClose={() => setShowGithubAccess(false)}
            onSaved={() => void handleRegenerate()}
          />
        )}
        <Toaster />
      </main>
    </TooltipProvider>
  );
}
