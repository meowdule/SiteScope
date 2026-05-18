"use client";

import { useEffect, useState } from "react";
import type { ReportJson } from "@/lib/types";
import { fetchReport } from "@/lib/pollReport";
import { assetUrl } from "@/lib/paths";
import Link from "next/link";
import { DonutChart, ProgressBar, StatusBadge } from "@/components/ReportCharts";
import { ISSUE_COPY, severityBadge } from "@/lib/issueLabels";

type Props = { reportId: string };

export function ReportDashboard({ reportId }: Props) {
  const [report, setReport] = useState<ReportJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchReport(reportId);
        if (!cancelled) {
          if (!data) setError("Report not found yet.");
          else setReport(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load report.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-red-300">{error}</p>
        <Link href={assetUrl("/")} className="mt-4 inline-block text-accent">
          Back home
        </Link>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-400">
        Loading report…
      </div>
    );
  }

  const { summary, pages, quick, targetUrl, brokenLinks, crawlMeta, timing } =
    report;
  const cats = summary.categoryScores;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6">
      <Link
        href={assetUrl("/")}
        className="text-sm text-accent hover:underline"
      >
        ← New analysis
      </Link>
      <header className="mt-4 border-b border-surface-border pb-8">
        <p className="text-xs uppercase tracking-widest text-accent">
          SiteScope report
        </p>
        <h1 className="mt-2 break-all text-2xl font-semibold text-white sm:text-3xl">
          {targetUrl}
        </h1>
        <p className="mt-2 font-mono text-xs text-slate-500">{reportId}</p>
      </header>

      <section className="mt-8 flex flex-wrap items-start gap-6">
        <DonutChart value={summary.healthScore} label="종합 건강 점수" size={112} />
        <div className="min-w-[240px] flex-1">
          {summary.statusLabel && <StatusBadge status={summary.statusLabel} />}
          {summary.healthBreakdown && (
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p className="text-xs text-slate-500">
                {summary.healthBreakdown.formula}
              </p>
              <ul className="list-inside list-disc space-y-1 text-xs text-slate-400">
                {summary.healthBreakdown.explanation.slice(0, 4).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {summary.healthBreakdown.penalties.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  추가 감점 −{summary.healthBreakdown.penaltyTotal}점
                  <ul className="mt-1 list-inside list-disc text-amber-50/90">
                    {summary.healthBreakdown.penalties.map((p) => (
                      <li key={p.id}>{p.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        {(crawlMeta?.mode?.includes("interaction") ||
          crawlMeta?.mode?.includes("homepage") ||
          crawlMeta?.mode === "hybrid_crawl") && (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent">
            홈 중심 사용자 흐름 탐색
          </span>
        )}
      </section>

      {cats && (
        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
            <h2 className="text-sm font-semibold text-white">카테고리별 점수</h2>
            <div className="mt-4 grid gap-4">
              <ProgressBar value={cats.performance} label="성능 · 로딩 속도" />
              <ProgressBar value={cats.accessibility} label="접근성 · 모두가 쓰기 쉬운지" />
              <ProgressBar value={cats.ux} label="사용성 · 화면·버튼 배치" />
              <ProgressBar value={cats.seo} label="검색·공유 · 검색·미리보기" />
            </div>
            {summary.healthBreakdown?.contributions && (
              <div className="mt-4 border-t border-surface-border pt-4 text-xs text-slate-500">
                <p className="font-medium text-slate-400">가중치 반영</p>
                <ul className="mt-2 space-y-1">
                  {summary.healthBreakdown.contributions.map((c) => (
                    <li key={c.category}>
                      {c.label} {c.score}점 × {Math.round(c.weight * 100)}% →{" "}
                      {c.weightedPoints}점
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
            <DonutChart value={cats.performance} label="성능" />
            <DonutChart value={cats.accessibility} label="접근성" />
            <DonutChart value={cats.ux} label="UX" />
            <DonutChart value={cats.seo} label="SEO" />
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="탐색한 페이지" value={String(pages.length)} />
        <MetricTile
          label="발견한 내부 경로"
          value={
            crawlMeta?.discoveryStats?.linksDiscovered != null
              ? String(crawlMeta.discoveryStats.linksDiscovered)
              : quick.internalLinkCount != null
                ? String(quick.internalLinkCount)
                : "—"
          }
        />
        <MetricTile
          label="클릭·탭 시도"
          value={
            crawlMeta?.discoveryStats?.clicksRecorded != null
              ? String(crawlMeta.discoveryStats.clicksRecorded)
              : crawlMeta?.interactions?.length != null
                ? String(crawlMeta.interactions.length)
                : "—"
          }
        />
        <MetricTile
          label="클릭 후보 (탐색)"
          value={
            crawlMeta?.discoveryStats?.candidatesFound != null
              ? String(crawlMeta.discoveryStats.candidatesFound)
              : "—"
          }
        />
      </section>

      {crawlMeta?.discoveryStats?.skippedByReason &&
        Object.keys(crawlMeta.discoveryStats.skippedByReason).length > 0 && (
          <section className="mt-4 rounded-lg border border-surface-border/60 bg-surface/40 px-4 py-3 text-xs text-slate-400">
            <span className="text-slate-300">탐색 스킵 요약: </span>
            {Object.entries(crawlMeta.discoveryStats.skippedByReason).map(
              ([k, v]) => (
                <span key={k} className="mr-3">
                  {k} {v}
                </span>
              ),
            )}
          </section>
        )}

      {crawlMeta?.interactionFlow && (
        <section className="mt-8 rounded-xl border border-accent/20 bg-accent/5 p-5">
          <h2 className="text-sm font-semibold text-white">사용자 흐름 (홈)</h2>
          <p className="mt-1 text-xs text-slate-500">
            사람이 눌러볼 만한 요소를 우선 탐색한 결과입니다.
          </p>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-200">
            {crawlMeta.interactionFlow}
          </pre>
        </section>
      )}

      {(crawlMeta?.interactions?.length ?? 0) > 0 && (
        <section className="mt-8 rounded-xl border border-surface-border bg-surface-raised p-5">
          <h2 className="text-sm font-semibold text-white">탐색 상세 로그</h2>
          <p className="mt-1 text-xs text-slate-500">
            의미 있는 변화가 있었던 클릭·스크롤만 트리에 반영됩니다.
          </p>
          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto text-sm text-slate-300">
            {crawlMeta!.interactions!.slice(0, 20).map((ev, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-surface-border/60 px-3 py-2"
              >
                <span className="text-xs uppercase text-accent">{ev.action}</span>
                <p className="font-medium">{ev.label}</p>
                {ev.domDiff && (
                  <p className="mt-1 text-xs text-slate-400">{ev.domDiff}</p>
                )}
                {ev.networkSummary && (
                  <p className="text-xs text-slate-500">{ev.networkSummary}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {timing?.summary && timing.summary.length > 0 && (
        <section className="mt-8 rounded-xl border border-surface-border bg-surface-raised p-5">
          <h2 className="text-sm font-semibold text-white">분석 소요 시간</h2>
          <p className="mt-1 text-xs text-slate-500">
            GitHub Actions 병목 파악용 (총{" "}
            {timing.totalSeconds != null
              ? `${timing.totalSeconds.toFixed(1)}초`
              : "—"}
            )
          </p>
          <ul className="mt-3 space-y-1 font-mono text-xs text-slate-300">
            {timing.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {summary.mobileWarnings.length > 0 && (
        <section className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <h2 className="text-sm font-semibold text-amber-100">
            Mobile responsiveness warnings
          </h2>
          <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-amber-50/90">
            {summary.mobileWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-white">Quick signals</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Signal label="DNS" ok={quick.dnsOk} detail={quick.dnsMessage} />
          <Signal
            label="HTTP"
            ok={quick.httpOk}
            detail={
              quick.httpStatus != null ? `Status ${quick.httpStatus}` : undefined
            }
          />
          <Signal label="TLS" ok={quick.sslOk} detail={quick.sslMessage} />
          <Signal
            label="Response time"
            detail={
              quick.responseTimeMs != null
                ? `${quick.responseTimeMs} ms`
                : undefined
            }
          />
          <Signal
            label="내부 링크·경로 (인터랙션 스캔)"
            detail={
              quick.internalLinkCount != null
                ? `${quick.internalLinkCount}개 발견`
                : undefined
            }
          />
        </div>
        {quick.screenshotRelativePath && (
          <div className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl(`/${quick.screenshotRelativePath}`)}
              alt="Homepage"
              className="max-h-72 rounded-lg border border-surface-border"
            />
          </div>
        )}
      </section>

      <section className="mt-12 overflow-x-auto">
        <h2 className="text-lg font-semibold text-white">Pages crawled</h2>
        <table className="mt-4 w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-surface-border text-slate-400">
              <th className="py-2 pr-4">URL</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">성능</th>
              <th className="py-2 pr-4">접근성 이슈</th>
              <th className="py-2 pr-4">스크립트 오류</th>
              <th className="py-2">로딩 실패</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr
                key={p.url}
                className="border-b border-surface-border/60 text-slate-200"
              >
                <td className="max-w-xs truncate py-3 pr-4 font-mono text-xs">
                  {p.url}
                </td>
                <td className="py-3 pr-4">{p.statusCode ?? "—"}</td>
                <td className="py-3 pr-4">
                  {p.lighthouse?.performance ?? "—"}
                </td>
                <td className="py-3 pr-4">
                  {(p.axeViolations || []).reduce((s, v) => s + v.nodes, 0)}
                </td>
                <td className="py-3 pr-4">{p.consoleErrors?.length ?? 0}</td>
                <td className="py-3">{p.failedRequests?.length ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {brokenLinks.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-white">Broken links</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {brokenLinks.slice(0, 50).map((b) => (
              <li
                key={`${b.from}-${b.to}`}
                className="rounded-lg border border-surface-border bg-surface-raised px-4 py-3"
              >
                <span className="font-mono text-xs text-slate-500">{b.from}</span>
                <span className="mx-2 text-slate-600">→</span>
                <span className="font-mono text-xs">{b.to}</span>
                <p className="mt-1 text-xs text-amber-200">{b.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 space-y-8">
        <h2 className="text-lg font-semibold text-white">Screenshots & UI issues</h2>
        {pages.map((p) => (
          <article
            key={p.url}
            className="rounded-xl border border-surface-border bg-surface-raised p-5"
          >
            <h3 className="break-all font-mono text-sm text-slate-200">{p.url}</h3>
            <div className="mt-4 flex flex-wrap gap-3">
              {(["mobile", "tablet", "desktop"] as const).map((vp) => {
                const rel = p.screenshotPaths?.[vp];
                if (!rel) return null;
                return (
                  <div key={vp}>
                    <p className="mb-1 text-xs uppercase text-slate-500">{vp}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetUrl(`/reports/${reportId}/${rel}`)}
                      alt={`${vp} screenshot`}
                      className="h-40 w-auto rounded border border-surface-border object-cover"
                    />
                  </div>
                );
              })}
            </div>
            {(p.uiIssues?.length ?? 0) > 0 && (
              <ul className="mt-4 space-y-3">
                {p.uiIssues.slice(0, 12).map((i) => {
                  const copy = ISSUE_COPY[i.type];
                  const badge = severityBadge(i.severity);
                  return (
                    <li
                      key={i.id}
                      className="rounded-lg border border-surface-border/80 bg-surface/50 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-200">
                          {i.title || copy?.title || i.type}
                        </span>
                        <span className="text-xs text-slate-500">({i.viewport})</span>
                        <StatusBadge status={badge} />
                      </div>
                      <p className="mt-1 text-slate-300">
                        {i.friendlyMessage || copy?.message || i.message}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {i.userImpact || copy?.impact}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {p.lighthouse?.lighthouseError && (
              <p className="mt-3 text-xs text-amber-200">{p.lighthouse.lighthouseError}</p>
            )}
            {p.interactionFlow && (
              <details className="mt-3" open={pages[0]?.url === p.url}>
                <summary className="cursor-pointer text-xs text-accent">
                  사용자 흐름 트리
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-surface-border/60 bg-black/30 p-2 font-mono text-xs text-slate-300">
                  {p.interactionFlow}
                </pre>
              </details>
            )}
            {(p.interactionLog?.length ?? 0) > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-slate-400">
                  인터랙션 탐색 로그 ({p.interactionLog!.length})
                </summary>
                <ul className="mt-2 space-y-2 text-xs text-slate-400">
                  {p.interactionLog!.slice(0, 12).map((ev, idx) => (
                    <li
                      key={idx}
                      className="rounded border border-surface-border/50 px-2 py-1.5"
                    >
                      <span className="text-accent">{ev.action}</span> · {ev.label}
                      {ev.domDiff && (
                        <p className="mt-0.5 text-slate-500">{ev.domDiff}</p>
                      )}
                      {ev.newLinks != null && ev.newLinks > 0 && (
                        <p className="text-slate-500">새 경로 +{ev.newLinks}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {(p.consoleErrors?.length ?? 0) > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-slate-400">
                  Console errors ({p.consoleErrors.length})
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs text-red-200">
                  {p.consoleErrors.join("\n")}
                </pre>
              </details>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-raised p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Signal({
  label,
  ok,
  detail,
}: {
  label: string;
  ok?: boolean;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-surface-border/80 bg-surface/60 px-4 py-3">
      <div className="flex justify-between gap-2">
        <span className="text-sm text-slate-200">{label}</span>
        {ok === undefined ? (
          <span className="text-xs text-slate-500">—</span>
        ) : ok ? (
          <span className="text-xs text-emerald-400">OK</span>
        ) : (
          <span className="text-xs text-amber-300">Issue</span>
        )}
      </div>
      {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
    </div>
  );
}
