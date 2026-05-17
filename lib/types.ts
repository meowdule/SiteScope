export type ReportPhase =
  | "queued"
  | "quick"
  | "crawling"
  | "analyzing"
  | "complete"
  | "failed";

export type QuickCheckResult = {
  validUrl: boolean;
  dnsOk: boolean;
  dnsMessage?: string;
  httpStatus?: number;
  httpOk?: boolean;
  finalUrl?: string;
  redirectChain?: string[];
  sslOk?: boolean;
  sslMessage?: string;
  responseTimeMs?: number;
  internalLinkCount?: number;
  screenshotRelativePath?: string;
  error?: string;
};

export type ReportStatusFile = {
  reportId: string;
  targetUrl: string;
  phase: ReportPhase;
  updatedAt: string;
  quick?: QuickCheckResult;
  error?: string;
};

export type ViewportName = "mobile" | "tablet" | "desktop";

export type UiIssueType =
  | "horizontal_scroll"
  | "broken_image"
  | "overlap"
  | "outside_viewport"
  | "hidden_overflow"
  | "modal_or_drawer";

export type UiIssue = {
  id: string;
  type: UiIssueType;
  message: string;
  title?: string;
  friendlyMessage?: string;
  userImpact?: string;
  category?: "ux" | "performance" | "accessibility" | "seo";
  selector?: string;
  viewport: ViewportName;
  severity: "info" | "warn" | "error";
};

export type InteractionEvent = {
  action: string;
  label: string;
  urlBefore?: string;
  urlAfter?: string;
  linksFound?: number;
  newLinks?: number;
};

export type PageReport = {
  url: string;
  statusCode: number | null;
  redirects: string[];
  consoleErrors: string[];
  jsExceptions: string[];
  failedRequests: { url: string; status?: number; failure?: string }[];
  lighthouse?: {
    performance?: number | null;
    accessibility?: number | null;
    bestPractices?: number | null;
    seo?: number | null;
    fcp?: number | null;
    lcp?: number | null;
    cls?: number | null;
    tbt?: number | null;
    si?: number | null;
    collected?: boolean;
    fallback?: boolean;
    lighthouseError?: string;
  };
  axeViolations: { id: string; impact?: string; description: string; nodes: number }[];
  brokenImages: { src: string; alt?: string }[];
  uiIssues: UiIssue[];
  screenshotPaths: Partial<Record<ViewportName, string>>;
  interactionLog?: InteractionEvent[];
  crawledAt: string;
};

export type CategoryScores = {
  performance: number | null;
  accessibility: number | null;
  ux: number | null;
  seo: number | null;
};

export type ReportJson = {
  reportId: string;
  targetUrl: string;
  createdAt: string;
  completedAt?: string;
  quick: QuickCheckResult;
  pages: PageReport[];
  brokenLinks: { from: string; to: string; reason: string }[];
  crawlMeta?: {
    mode?: string;
    interactions?: InteractionEvent[];
  };
  summary: {
    healthScore: number;
    avgLighthousePerformance: number | null;
    avgAxeIssuesPerPage: number;
    totalConsoleErrors: number;
    totalFailedRequests: number;
    mobileWarnings: string[];
    categoryScores?: CategoryScores;
    statusLabel?: "Good" | "Warning" | "Critical";
  };
};
