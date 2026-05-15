import { reportsDir, writeJson } from "./fs-utils.mjs";

export async function writeStatus(reportId, payload) {
  const dir = reportsDir(reportId);
  const file = `${dir}/status.json`;
  await writeJson(file, {
    reportId,
    updatedAt: new Date().toISOString(),
    ...payload,
  });
}
