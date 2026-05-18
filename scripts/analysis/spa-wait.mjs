import { ANALYSIS_CONFIG } from "./analysis-config.mjs";

const { spa: SPA } = ANALYSIS_CONFIG;

/**
 * SPA-ready wait without Playwright networkidle (hangs on long-polling SPAs).
 * Uses capped network settle + DOM/skeleton debounce.
 */
export async function waitForSpaReady(page, { short = false, fast = false } = {}) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});

  const settleMs = fast
    ? 600
    : short
      ? SPA.networkSettleShortMs
      : SPA.networkSettleMs;
  await waitNetworkSettle(page, settleMs);

  const stableMs = fast
    ? 400
    : short
      ? SPA.domStableShortMs
      : SPA.domStableMaxMs;
  const ticks = fast ? 2 : short ? 3 : SPA.domIdleTicks;
  await waitDomStable(page, { maxMs: stableMs, idleTicks: ticks });

  if (SPA.lightScroll && !short && !fast) {
    await lightScroll(page);
  } else {
    await page.waitForTimeout(fast ? 80 : short ? SPA.postScrollPauseMs : SPA.postScrollPauseMs);
  }
}

/** Pending fetch/xhr count drops to zero for ~idleMs. */
async function waitNetworkSettle(page, maxMs) {
  let pending = 0;
  let lastChange = Date.now();
  const bump = () => {
    lastChange = Date.now();
  };
  const onReq = (req) => {
    const t = req.resourceType();
    if (t === "fetch" || t === "xhr" || t === "websocket") {
      pending++;
      bump();
    }
  };
  const onDone = (req) => {
    const t = req.resourceType();
    if (t === "fetch" || t === "xhr" || t === "websocket") {
      pending = Math.max(0, pending - 1);
      bump();
    }
  };
  page.on("request", onReq);
  page.on("requestfinished", onDone);
  page.on("requestfailed", onDone);

  const idleMs = 380;
  const deadline = Date.now() + maxMs;
  try {
    while (Date.now() < deadline) {
      if (pending === 0 && Date.now() - lastChange >= idleMs) break;
      await page.waitForTimeout(80);
    }
  } finally {
    page.off("request", onReq);
    page.off("requestfinished", onDone);
    page.off("requestfailed", onDone);
  }
}

async function waitDomStable(page, { maxMs, idleTicks }) {
  await page.evaluate(
    async ({ maxMs, idleTicks }) => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );
      const start = Date.now();
      let idle = 0;
      while (Date.now() - start < maxMs) {
        const busy =
          document.querySelectorAll(
            '[aria-busy="true"], [class*="skeleton" i], [class*="Skeleton"], [class*="loading" i]',
          ).length > 0;
        if (!busy) idle++;
        else idle = 0;
        if (idle >= idleTicks) return;
        await delay(120);
      }
    },
    { maxMs, idleTicks },
  );
}

async function lightScroll(page) {
  await page.evaluate(async () => {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(280, window.innerHeight * 0.85);
    const max = Math.min(document.documentElement.scrollHeight, 6000);
    let y = 0;
    let steps = 0;
    while (y < max && steps < 5) {
      window.scrollTo(0, y);
      await delay(180);
      y += step;
      steps++;
    }
    window.scrollTo(0, 0);
    await delay(200);
  });
}
