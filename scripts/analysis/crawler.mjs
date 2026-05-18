import { normalizeUrl, isInCrawlScope, getSeedScope } from "./url-utils.mjs";
import { waitForSpaReady } from "./spa-wait.mjs";
import { explorePageInteractions } from "./interaction-crawl.mjs";
import { SPA_HOOKS_INIT } from "./spa-hooks.mjs";
import { ANALYSIS_CONFIG } from "./analysis-config.mjs";

export { extractAllLinks } from "./link-extract.mjs";

export async function discoverUrls({
  browser,
  startUrl,
  maxPages = 30,
  maxDepth = 2,
}) {
  const startNorm = normalizeUrl(startUrl, startUrl);
  if (!startNorm) throw new Error("Invalid start URL");

  const visited = new Set();
  const enqueued = new Set();
  /** @type {{url:string, depth:number}[]} */
  const queue = [{ url: startNorm, depth: 0 }];
  enqueued.add(startNorm);
  const ordered = [];
  const crawlMeta = {
    interactions: [],
    mode: "hybrid_crawl",
    seedScope: getSeedScope(startUrl),
    discoveryStats: { candidatesFound: 0, clicksRecorded: 0, linksDiscovered: 0 },
    interactionFlow: "",
  };

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36 SiteScope/0.1",
  });
  await context.addInitScript(SPA_HOOKS_INIT);

  const spaRoutes = new Set();

  context.on("page", (page) => {
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        try {
          const u = normalizeUrl(frame.url(), startUrl);
          if (u && isInCrawlScope(u, startUrl)) spaRoutes.add(u);
        } catch {
          /* ignore */
        }
      }
    });
  });

  try {
    while (queue.length > 0 && ordered.length < maxPages) {
      const { url, depth } = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);
      ordered.push(url);

      if (depth >= maxDepth) continue;

      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await waitForSpaReady(page, { fast: true });

        let links = [];
        const isHome = depth === 0 && url === startNorm;

        if (isHome && ANALYSIS_CONFIG.crawl.homepageHybridInteraction) {
          const explored = await explorePageInteractions(page, url, startUrl, {
            profile: "crawlSeed",
          });
          links = explored.links;
          crawlMeta.interactions.push(...explored.interactions.slice(0, 12));
          if (explored.interactionFlow) {
            crawlMeta.interactionFlow = explored.interactionFlow;
          }
          if (explored.discoveryStats) {
            crawlMeta.discoveryStats.candidatesFound +=
              explored.discoveryStats.candidatesFound || 0;
            crawlMeta.discoveryStats.clicksRecorded +=
              explored.discoveryStats.clicksRecorded || 0;
          }
        } else {
          const { extractAllLinks } = await import("./link-extract.mjs");
          links = await extractAllLinks(page, url, startUrl);
        }

        for (const route of spaRoutes) {
          if (isInCrawlScope(route, startUrl)) links.push(route);
        }

        links = links.filter((l) => isInCrawlScope(l, startUrl));

        crawlMeta.discoveryStats.linksDiscovered = Math.max(
          crawlMeta.discoveryStats.linksDiscovered,
          links.length,
        );

        for (const link of links) {
          const n = normalizeUrl(link, url);
          if (!n || !isInCrawlScope(n, startUrl)) continue;
          if (visited.has(n)) continue;
          if (enqueued.has(n)) continue;
          enqueued.add(n);
          queue.push({ url: n, depth: depth + 1 });
        }
      } catch {
        /* keep URL in list even if navigation fails */
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }

  return { urls: ordered, crawlMeta };
}
