import type { ReportJson, ReportStatusFile } from "@/lib/types";
import { assetUrl } from "@/lib/paths";

export async function fetchStatus(reportId: string): Promise<ReportStatusFile | null> {
  const url = assetUrl(`/reports/${reportId}/status.json`);
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Status request failed (${res.status})`);
  return (await res.json()) as ReportStatusFile;
}

export async function fetchReport(reportId: string): Promise<ReportJson | null> {
  const url = assetUrl(`/reports/${reportId}/report.json`);
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Report request failed (${res.status})`);
  return (await res.json()) as ReportJson;
}
