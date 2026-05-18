const LABELS = {
  browser_launch: "Browser launch",
  quick_scan: "Quick scan",
  crawl: "URL crawl",
  page_analysis: "Page analysis (total)",
  report_generation: "Report generation",
  initial_load: "Initial load",
  hydration_wait: "Hydration wait",
  interaction_crawl: "Interaction crawl",
  screenshots: "Screenshots",
  ui_signals: "UI checks",
  axe: "Accessibility scan",
  lighthouse: "Lighthouse",
};

export class AnalysisTimer {
  constructor() {
    /** @type {Record<string, { start: number, end?: number, ms?: number }>} */
    this.phases = {};
    /** @type {{ url: string, phases: Record<string, number> }[]} */
    this.pagePhases = [];
  }

  start(name) {
    this.phases[name] = { start: performance.now() };
  }

  end(name) {
    const p = this.phases[name];
    if (!p?.start) return;
    p.end = performance.now();
    p.ms = p.end - p.start;
  }

  /** Per-page phase in seconds (rounded 0.1s). */
  recordPagePhase(url, name, ms) {
    let row = this.pagePhases.find((r) => r.url === url);
    if (!row) {
      row = { url, phases: {} };
      this.pagePhases.push(row);
    }
    row.phases[name] = Math.round(((row.phases[name] || 0) * 1000 + ms)) / 1000;
  }

  toReport() {
    const phases = {};
    for (const [k, v] of Object.entries(this.phases)) {
      if (v.ms != null) phases[k] = Math.round(v.ms) / 1000;
    }
    return {
      phases,
      pages: this.pagePhases,
      summary: this.formatLines(),
      totalSeconds:
        Math.round(
          Object.values(this.phases).reduce((s, v) => s + (v.ms || 0), 0),
        ) / 1000,
    };
  }

  formatLines() {
    const rows = Object.entries(this.phases)
      .filter(([, v]) => v.ms != null)
      .map(([k, v]) => ({
        key: k,
        label: LABELS[k] || k,
        sec: (v.ms || 0) / 1000,
      }));

    const pageAgg = {};
    for (const row of this.pagePhases) {
      for (const [k, sec] of Object.entries(row.phases)) {
        pageAgg[k] = (pageAgg[k] || 0) + sec;
      }
    }
    for (const [k, sec] of Object.entries(pageAgg)) {
      if (sec < 0.2) continue;
      rows.push({
        key: `page_${k}`,
        label: `${LABELS[k] || k} (pages)`,
        sec,
      });
    }

    rows.sort((a, b) => b.sec - a.sec);
    return rows.map((r) => `${r.label}: ${r.sec.toFixed(1)}s`);
  }

  logSummary() {
    const lines = this.formatLines();
    if (lines.length === 0) return;
    console.log("\n[SiteScope] Timing breakdown:");
    for (const line of lines) {
      console.log(`  ${line}`);
    }
    console.log("");
  }
}

/** @param {AnalysisTimer} timer */
export function createPageTimer(timer, url) {
  const marks = {};
  return {
    start(name) {
      marks[name] = performance.now();
    },
    end(name) {
      if (marks[name] == null) return;
      const ms = performance.now() - marks[name];
      timer.recordPagePhase(url, name, ms);
      delete marks[name];
    },
  };
}
