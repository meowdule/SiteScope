/** Wait for SPA hydration / network settle before DOM scans. */
export async function waitForSpaReady(page, { short = false } = {}) {
  const netTimeout = short ? 20_000 : 60_000;
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: netTimeout }).catch(() => {});

  await page.evaluate(async () => {
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    if (document.readyState !== "complete") {
      await new Promise((r) =>
        window.addEventListener("load", r, { once: true }),
      );
    }
    let idle = 0;
    while (idle < 8) {
      const busy =
        document.querySelectorAll(
          '[aria-busy="true"], [class*="skeleton"], [class*="Skeleton"], [class*="loading"]',
        ).length > 0;
      if (!busy) idle++;
      else idle = 0;
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 300));
    const h = Math.min(document.body?.scrollHeight ?? 0, 12_000);
    window.scrollTo(0, h);
    await new Promise((r) => setTimeout(r, 500));
    window.scrollTo(0, 0);
  });

  await new Promise((r) => setTimeout(r, short ? 500 : 1000));
}
