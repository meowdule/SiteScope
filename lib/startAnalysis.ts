import { getConfiguredRepo } from "@/lib/config";

export type StartMode = "dispatch" | "issue";

async function dispatchAnalysis(
  reportId: string,
  targetUrl: string,
  token: string,
): Promise<void> {
  const repo = getConfiguredRepo();
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error("Invalid repository configuration.");
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: "sitescope-analyze",
        client_payload: {
          reportId,
          targetUrl,
          createdAt: new Date().toISOString(),
        },
      }),
    },
  );

  if (res.status !== 204 && !res.ok) {
    const text = await res.text();
    throw new Error(
      `Could not start analysis (${res.status}). ${text.slice(0, 200)}`,
    );
  }
}

/** Opens GitHub issue form when dispatch token is not configured at build time. */
export function openAnalysisIssue(reportId: string, targetUrl: string): void {
  const repo = getConfiguredRepo();
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error("Invalid repository configuration.");
  }

  const payload = JSON.stringify(
    { reportId, targetUrl, createdAt: new Date().toISOString() },
    null,
    2,
  );

  const params = new URLSearchParams({
    title: `[SiteScope] ${reportId}`,
    body: [
      "SiteScope analysis request (auto-processed).",
      "",
      "```json",
      payload,
      "```",
    ].join("\n"),
  });

  const url = `https://github.com/${owner}/${name}/issues/new?${params.toString()}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Starts background analysis.
 * - Production (QUEUE_DISPATCH_TOKEN set at build): repository_dispatch (automatic).
 * - Fallback: open prefilled GitHub issue (user clicks Submit once).
 */
export async function startAnalysis(
  reportId: string,
  targetUrl: string,
): Promise<StartMode> {
  const token = process.env.NEXT_PUBLIC_QUEUE_DISPATCH_TOKEN?.trim();
  if (token) {
    await dispatchAnalysis(reportId, targetUrl, token);
    return "dispatch";
  }
  openAnalysisIssue(reportId, targetUrl);
  return "issue";
}

export function hasDispatchToken(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_QUEUE_DISPATCH_TOKEN?.trim());
}
