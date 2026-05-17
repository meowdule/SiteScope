export function buildSummary(pages) {
  const perfScores = pages
    .map((p) => p.lighthouse?.performance)
    .filter((x) => typeof x === "number");
  const avgLighthousePerformance = perfScores.length
    ? Math.round(perfScores.reduce((a, b) => a + b, 0) / perfScores.length)
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

  const uxIssueCount = pages.reduce(
    (s, p) => s + (p.uiIssues?.filter((i) => i.severity !== "info").length ?? 0),
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
      "모바일 화면에서 옆으로 스크롤해야 하는 구간이 있습니다.",
    );
  }
  const lhFailed = pages.filter((p) => p.lighthouse?.fallback).length;
  if (lhFailed > 0) {
    mobileWarnings.push(
      `${lhFailed}개 페이지에서 Lighthouse 전체 점수를 가져오지 못해 기본 로딩 시간만 표시했습니다. (SPA 사이트에서 흔함)`,
    );
  }
  const lowPerf = pages.filter(
    (p) => (p.lighthouse?.performance ?? 100) < 50,
  ).length;
  if (lowPerf > 0) {
    mobileWarnings.push(
      `${lowPerf}개 페이지의 성능 점수가 50점 미만입니다.`,
    );
  }

  const base = avgLighthousePerformance ?? 72;
  const healthRaw =
    base * 0.55 -
    Math.min(25, avgAxeIssuesPerPage * 1.1) -
    Math.min(12, totalConsoleErrors * 0.35) -
    Math.min(12, totalFailedRequests * 0.25) -
    Math.min(8, uxIssueCount * 0.5);
  const healthScore = Math.max(0, Math.min(100, Math.round(healthRaw + 18)));

  const avgCat = (pick) => {
    const scores = pages.map(pick).filter((x) => typeof x === "number");
    return scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  };

  const categoryScores = {
    performance: avgLighthousePerformance,
    accessibility: avgCat((p) => p.lighthouse?.accessibility),
    seo: avgCat((p) => p.lighthouse?.seo),
    ux: Math.max(0, Math.min(100, 100 - uxIssueCount * 4)),
  };

  const statusLabel =
    healthScore >= 75 ? "Good" : healthScore >= 50 ? "Warning" : "Critical";

  return {
    healthScore,
    avgLighthousePerformance,
    avgAxeIssuesPerPage,
    totalConsoleErrors,
    totalFailedRequests,
    mobileWarnings,
    categoryScores,
    statusLabel,
  };
}
