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
  domDiff?: string;
  domSummary?: string;
  networkSummary?: string;
  spaNavigation?: string;
  routeBefore?: string;
  routeAfter?: string;
  hashBefore?: string;
  hashAfter?: string;
  targetHint?: string;
  score?: number;
  success?: boolean;
  candidateCount?: number;
};

export type HealthPenalty = {
  id: string;
  label: string;
  points: number;
  message: string;
};

export type HealthContribution = {
  category: string;
  label: string;
  score: number;
  weight: number;
  weightedPoints: number;
};

export type HealthBreakdown = {
  formula: string;
  weights: Record<string, number>;
  weightedBase: number;
  penaltyTotal: number;
  contributions: HealthContribution[];
  penalties: HealthPenalty[];
  explanation: string[];
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
  interactionFlow?: string;
  interactionDiscovery?: {
    profile?: string;
    candidatesFound?: number;
    clicksAttempted?: number;
    clicksRecorded?: number;
    skippedByReason?: Record<string, number>;
    meaningfulCount?: number;
    runtimeMs?: number;
  };
  crawledAt: string;
};

export type CategoryScores = {
  performance: number | null;
  accessibility: number | null;
  ux: number | null;
  seo: number | null;
};

export type TimingReport = {
  phases: Record<string, number>;
  pages?: { url: string; phases: Record<string, number> }[];
  summary: string[];
  totalSeconds?: number;
};

export type DeviceProfile = "mobile" | "desktop";

export type ReportJson = {
  reportId: string;
  targetUrl: string;
  deviceProfile?: DeviceProfile;
  createdAt: string;
  completedAt?: string;
  quick: QuickCheckResult;
  pages: PageReport[];
  brokenLinks: { from: string; to: string; reason: string }[];
  timing?: TimingReport;
  crawlMeta?: {
    mode?: string;
    seedScope?: { origin?: string; pathPrefix?: string | null; mode?: string };
    deviceProfile?: DeviceProfile;
    interactions?: InteractionEvent[];
    interactionFlow?: string;
    outboundLinks?: string[];
    discoveryStats?: {
      candidatesFound?: number;
      clicksRecorded?: number;
      linksDiscovered?: number;
      outboundDiscovered?: number;
      runtimeRoutes?: number;
      profile?: string;
      skippedByReason?: Record<string, number>;
    };
    debug?: {
      skipped?: { label?: string; reason: string }[];
      skippedByReason?: Record<string, number>;
    };
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
    healthBreakdown?: HealthBreakdown;
  };
};
