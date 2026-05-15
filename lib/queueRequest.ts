import { getConfiguredRepo } from "@/lib/config";

const TOKEN_KEY = "sitescope_automation_token_v1";

export { getConfiguredRepo };

export function getAutomationToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAutomationToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (!token) window.localStorage.removeItem(TOKEN_KEY);
  else window.localStorage.setItem(TOKEN_KEY, token);
}

export async function createRequestFile(params: {
  reportId: string;
  targetUrl: string;
  token: string;
  repo?: string;
}): Promise<void> {
  const { reportId, targetUrl, token } = params;
  const repo = params.repo ?? getConfiguredRepo();
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    throw new Error("Invalid repository configuration.");
  }
  const path = `requests/${reportId}.json`;
  const body = {
    reportId,
    targetUrl,
    createdAt: new Date().toISOString(),
  };
  const json = JSON.stringify(body, null, 2);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const content = btoa(binary);
  const url = `https://api.github.com/repos/${owner}/${name}/contents/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      message: `SiteScope: queue analysis ${reportId}`,
      content,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Could not queue analysis (${res.status}). ${text.slice(0, 200)}`,
    );
  }
}
