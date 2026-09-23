import type { GenerationSessionAudit } from "~/features/diagram/graph";

export type ArtifactVisibility = "public" | "private";

export interface DiagramArtifact {
  version: 1;
  visibility: ArtifactVisibility;
  username: string;
  repo: string;
  stargazerCount: number | null;
  /** GitHub's language classification, captured at generation time. Absent
   * on artifacts written before the field existed; readers must treat
   * missing as unknown. */
  language?: string | null;
  defaultBranch?: string;
  diagram: string;
  explanation: string;
  graph: GenerationSessionAudit["graph"];
  generatedAt: string;
  usedOwnKey: boolean;
  latestSessionSummary: GenerationSessionAudit;
  lastSuccessfulAt: string;
}

export interface PublicDiagramPreview {
  version: 1;
  username: string;
  repo: string;
  diagram: string;
  lastSuccessfulAt: string;
}

export interface StoredFailureSummary {
  version: 1;
  visibility: ArtifactVisibility;
  username: string;
  repo: string;
  latestSessionSummary: GenerationSessionAudit;
}
