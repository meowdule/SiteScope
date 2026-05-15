export function buildSummary(pages) {
  const perfScores = pages
    .map((p) => p.lighthouse?.performance)
    .filter((x) => typeof x === "number");
  const avgLighthousePerformance = perfScores.length
    ? Math.round(
        perfScores.reduce((a, b) => a + b, 0) / perfScores.length,
      )
    : null;

  const axePerPage = pages.map((p) =>
    (p.axeViolations || []).reduce((s, v) => s + (v.nodes || 0), 0),
  );
  const avgAxeIssuesPerPage = pages.length
    ? Math.round(
        (axePerPage.reduce((a, b) => a + b, 0) / pages.length) * 10,
      ) / 10
    : 0;

  const totalConsoleErrors = pages.reduce(
    (s, p) => s + (p.consoleErrors?.length || 0),
    0,
  );
  const totalFailedRequests = pages.reduce(
    (s, p) => s + (p.failedRequests?.length || 0),
    0,
  );

  const mobileWarnings = [];
  const hasMobileHScroll = pages.some((p) =>
    (p.uiIssues || []).some(
      (i) => i.viewport === "mobile" && i.type === "horizontal_scroll",
    ),
  );
  if (hasMobileHScroll) {
    mobileWarnings.push(
      "At least one page shows horizontal scrolling on the mobile viewport.",
    );
  }
  const lowPerf = pages.filter(
    (p) => (p.lighthouse?.performance ?? 100) < 50,
  ).length;
  if (lowPerf > 0) {
    mobileWarnings.push(
      `${lowPerf} page(s) have Lighthouse performance below 50.`,
    );
  }

  const base = avgLighthousePerformance ?? 72;
  const healthRaw =
    base * 0.55 -
    Math.min(25, avgAxeIssuesPerPage * 1.1) -
    Math.min(12, totalConsoleErrors * 0.35) -
    Math.min(12, totalFailedRequests * 0.25);
  const healthScore = Math.max(
    0,
    Math.min(100, Math.round(healthRaw + 18)),
  );

  return {
    healthScore,
    avgLighthousePerformance,
    avgAxeIssuesPerPage,
    totalConsoleErrors,
    totalFailedRequests,
    mobileWarnings,
  };
}
