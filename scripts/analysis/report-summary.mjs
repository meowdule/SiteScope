const CATEGORY_WEIGHTS = {
  performance: 0.3,
  accessibility: 0.25,
  ux: 0.25,
  seo: 0.2,
};

function axeToAccessibilityScore(pages) {
  const perPage = pages.map((p) => {
    const nodes = (p.axeViolations || []).reduce((s, v) => s + (v.nodes || 0), 0);
    return Math.max(0, Math.min(100, 100 - nodes * 5));
  });
  return perPage.length
    ? Math.round(perPage.reduce((a, b) => a + b, 0) / perPage.length)
    : null;
}

function buildCategoryScores(pages, uxIssueCount) {
  const perfScores = pages
    .map((p) => p.lighthouse?.performance)
    .filter((x) => typeof x === "number");
  const avgLighthousePerformance = perfScores.length
    ? Math.round(perfScores.reduce((a, b) => a + b, 0) / perfScores.length)
    : null;

  const avgCat = (pick) => {
    const scores = pages.map(pick).filter((x) => typeof x === "number");
    return scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  };

  const lhA11y = avgCat((p) => p.lighthouse?.accessibility);
  const axeA11y = axeToAccessibilityScore(pages);
  const accessibility =
    lhA11y != null && axeA11y != null
      ? Math.round(lhA11y * 0.5 + axeA11y * 0.5)
      : lhA11y ?? axeA11y;

  return {
    performance: avgLighthousePerformance,
    accessibility,
    seo: avgCat((p) => p.lighthouse?.seo),
    ux: Math.max(0, Math.min(100, 100 - uxIssueCount * 4)),
  };
}

function weightedHealth(categoryScores) {
  const entries = [
    { key: "performance", value: categoryScores.performance, label: "성능" },
    { key: "accessibility", value: categoryScores.accessibility, label: "접근성" },
    { key: "ux", value: categoryScores.ux, label: "사용성" },
    { key: "seo", value: categoryScores.seo, label: "검색·공유" },
  ].filter((e) => typeof e.value === "number");

  if (entries.length === 0) {
    return { score: 50, weightedBase: 50, contributions: [] };
  }

  let weightSum = 0;
  let weightedBase = 0;
  const contributions = [];

  for (const e of entries) {
    const w = CATEGORY_WEIGHTS[e.key] ?? 0.2;
    weightSum += w;
    const part = e.value * w;
    weightedBase += part;
    contributions.push({
      category: e.key,
      label: e.label,
      score: e.value,
      weight: w,
      weightedPoints: Math.round(part * 10) / 10,
    });
  }

  const score = Math.round(weightedBase / weightSum);
  return { score, weightedBase: Math.round((weightedBase / weightSum) * 10) / 10, contributions };
}

function buildPenalties({
  avgAxeIssuesPerPage,
  totalConsoleErrors,
  totalFailedRequests,
  uxIssueCount,
  lowPerfPages,
}) {
  const penalties = [];
  let total = 0;

  if (avgAxeIssuesPerPage > 2) {
    const d = Math.min(8, Math.round(avgAxeIssuesPerPage));
    total += d;
    penalties.push({
      id: "accessibility_issues",
      label: "접근성 검사 이슈",
      points: d,
      message: `페이지당 접근성 이슈가 평균 ${avgAxeIssuesPerPage}건 있어 ${d}점 감점되었습니다.`,
    });
  }
  if (totalConsoleErrors > 0) {
    const d = Math.min(10, Math.ceil(totalConsoleErrors * 0.5));
    total += d;
    penalties.push({
      id: "console_errors",
      label: "브라우저 오류",
      points: d,
      message: `스크립트 오류 ${totalConsoleErrors}건으로 ${d}점 감점되었습니다.`,
    });
  }
  if (totalFailedRequests > 0) {
    const d = Math.min(8, Math.ceil(totalFailedRequests * 0.3));
    total += d;
    penalties.push({
      id: "failed_requests",
      label: "로딩 실패",
      points: d,
      message: `이미지·API 등 로딩 실패 ${totalFailedRequests}건으로 ${d}점 감점되었습니다.`,
    });
  }
  if (uxIssueCount > 3) {
    const d = Math.min(6, Math.round(uxIssueCount * 0.4));
    total += d;
    penalties.push({
      id: "ux_issues",
      label: "화면·레이아웃 문제",
      points: d,
      message: `사용성 관련 화면 이슈가 많아 ${d}점 추가 감점되었습니다.`,
    });
  }
  if (lowPerfPages > 0) {
    const d = Math.min(5, lowPerfPages * 2);
    total += d;
    penalties.push({
      id: "low_performance_pages",
      label: "느린 페이지",
      points: d,
      message: `성능 50점 미만 페이지 ${lowPerfPages}개로 ${d}점 감점되었습니다.`,
    });
  }

  return { total: Math.min(25, total), penalties };
}

function buildHealthExplanation(categoryScores, contributions, penalties, healthScore) {
  const lines = [];
  lines.push(
    "종합 점수 = 성능(30%) + 접근성(25%) + 사용성(25%) + 검색·공유(20%) − 추가 감점",
  );

  const sorted = [...contributions].sort(
    (a, b) => a.weightedPoints - b.weightedPoints,
  );
  const weakest = sorted[0];
  if (weakest && weakest.score < 60) {
    lines.push(
      `${weakest.label} 점수(${weakest.score}점)가 전체 점수를 가장 많이 낮추고 있습니다.`,
    );
  }

  if (categoryScores.performance != null && categoryScores.performance < 50) {
    lines.push(
      `성능 점수 ${categoryScores.performance}점이 낮습니다. 첫 화면·이미지 로딩이 느리면 이탈이 늘어날 수 있습니다.`,
    );
  }

  for (const p of penalties) {
    lines.push(p.message);
  }

  if (healthScore < 50 && penalties.length === 0 && weakest) {
    lines.push(
      `카테고리 평균이 낮아 종합 ${healthScore}점입니다. 특히 ${weakest.label}을 우선 개선하는 것이 좋습니다.`,
    );
  }

  return lines;
}

export function buildSummary(pages) {
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

  const categoryScores = buildCategoryScores(pages, uxIssueCount);
  const { score: weightedBase, contributions } = weightedHealth(categoryScores);
  const lowPerfPages = pages.filter(
    (p) => (p.lighthouse?.performance ?? 100) < 50,
  ).length;

  const { total: penaltyTotal, penalties } = buildPenalties({
    avgAxeIssuesPerPage,
    totalConsoleErrors,
    totalFailedRequests,
    uxIssueCount,
    lowPerfPages,
  });

  const healthScore = Math.max(
    0,
    Math.min(100, Math.round(weightedBase - penaltyTotal)),
  );

  const healthExplanation = buildHealthExplanation(
    categoryScores,
    contributions,
    penalties,
    healthScore,
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
      `${lhFailed}개 페이지에서 상세 성능 점수를 가져오지 못해 로딩 시간 기준으로 추정했습니다.`,
    );
  }
  if (lowPerfPages > 0) {
    mobileWarnings.push(
      `${lowPerfPages}개 페이지의 성능 점수가 50점 미만입니다.`,
    );
  }

  const statusLabel =
    healthScore >= 75 ? "Good" : healthScore >= 50 ? "Warning" : "Critical";

  const perfScores = pages
    .map((p) => p.lighthouse?.performance)
    .filter((x) => typeof x === "number");
  const avgLighthousePerformance = perfScores.length
    ? Math.round(perfScores.reduce((a, b) => a + b, 0) / perfScores.length)
    : null;

  return {
    healthScore,
    avgLighthousePerformance,
    avgAxeIssuesPerPage,
    totalConsoleErrors,
    totalFailedRequests,
    mobileWarnings,
    categoryScores,
    statusLabel,
    healthBreakdown: {
      formula:
        "종합 점수 = 카테고리 가중 평균(성능 30%·접근성 25%·사용성 25%·SEO 20%) − 추가 감점",
      weights: CATEGORY_WEIGHTS,
      weightedBase,
      penaltyTotal,
      contributions,
      penalties,
      explanation: healthExplanation,
    },
  };
}
