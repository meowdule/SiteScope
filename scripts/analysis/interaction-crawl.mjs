import { waitForSpaReady } from "./spa-wait.mjs";
import { extractAllLinks } from "./link-extract.mjs";

const INTERACTION_SELECTORS = [
  "button:visible",
  "[role='button']:visible",
  "[role='tab']:visible",
  "summary:visible",
  "[aria-expanded='false']:visible",
  "[data-testid*='more' i]:visible",
  "[class*='tab' i]:visible",
  "[class*='accordion' i]:visible",
  "a[href]:visible",
];

/**
 * Click safe UI controls, detect navigation / overlays, re-scan links after hydration.
 */
export async function explorePageInteractions(
  page,
  pageUrl,
  startUrl,
  { maxInteractions = 10 } = {},
) {
  const discovered = new Set();
  const interactions = [];
  const uiStateChanges = [];

  const collect = async () => {
    const links = await extractAllLinks(page, pageUrl, startUrl);
    const before = discovered.size;
    links.forEach((l) => discovered.add(l));
    return { links, newCount: discovered.size - before };
  };

  await waitForSpaReady(page);
  const initial = await collect();
  interactions.push({
    action: "initial_scan",
    label: "페이지 로드 후 스캔",
    urlAfter: page.url(),
    linksFound: initial.links.length,
  });

  let clicks = 0;
  const locator = page.locator(INTERACTION_SELECTORS.join(", "));
  const count = Math.min(await locator.count(), maxInteractions * 4);

  for (let i = 0; i < count && clicks < maxInteractions; i++) {
    const el = locator.nth(i);
    try {
      if (!(await el.isVisible())) continue;
      if (await el.isDisabled().catch(() => false)) continue;

      const label =
        (await el.innerText().catch(() => ""))?.trim().slice(0, 60) ||
        (await el.getAttribute("aria-label")) ||
        (await el.getAttribute("title")) ||
        `요소 ${i + 1}`;

      const beforeUrl = page.url();
      const overlayBefore = await countOverlays(page);

      await el.click({ timeout: 4000 });
      await waitForSpaReady(page, { short: true });

      const afterUrl = page.url();
      const overlayAfter = await countOverlays(page);
      const { links, newCount } = await collect();

      const navigated = afterUrl !== beforeUrl;
      const overlayOpened = overlayAfter > overlayBefore;

      if (navigated || overlayOpened || newCount > 0) {
        interactions.push({
          action: navigated ? "navigation" : overlayOpened ? "overlay" : "reveal",
          label,
          urlBefore: beforeUrl,
          urlAfter: afterUrl,
          linksFound: links.length,
          newLinks: newCount,
        });
        if (overlayOpened) {
          uiStateChanges.push({
            type: "modal_or_drawer",
            message: `‘${label}’ 클릭 후 팝업·모달·드로어가 나타났을 수 있습니다.`,
          });
        }
        clicks++;
      }

      if (navigated) {
        await page
          .goBack({ waitUntil: "networkidle", timeout: 20_000 })
          .catch(() => {});
        await waitForSpaReady(page, { short: true });
        pageUrl = page.url();
      } else if (overlayOpened) {
        await page.keyboard.press("Escape").catch(() => {});
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch {
      /* skip failed interactions */
    }
  }

  return {
    links: [...discovered],
    interactions,
    uiStateChanges,
  };
}

async function countOverlays(page) {
  return page.evaluate(() => {
    const sel =
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"], .modal, [class*="Modal"], [class*="drawer" i], [class*="Drawer"], [class*="toast" i], [class*="snackbar" i]';
    return document.querySelectorAll(sel).length;
  });
}
