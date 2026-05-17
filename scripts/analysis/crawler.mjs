import { normalizeUrl } from "./url-utils.mjs";
import { waitForSpaReady } from "./spa-wait.mjs";
import { explorePageInteractions } from "./interaction-crawl.mjs";

export { extractAllLinks } from "./link-extract.mjs";

export async function discoverUrls({
  browser,
  startUrl,
  maxPages = 30,
  maxDepth = 2,
  interactionMode = true,
}) {
  const startNorm = normalizeUrl(startUrl, startUrl);
  if (!startNorm) throw new Error("Invalid start URL");

  const visited = new Set();
  const enqueued = new Set();
  /** @type {{url:string, depth:number}[]} */
  const queue = [{ url: startNorm, depth: 0 }];
  enqueued.add(startNorm);
  const ordered = [];
  const crawlMeta = { interactions: [], mode: interactionMode ? "interaction" : "static" };

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SiteScope/0.1",
  });

  const spaRoutes = new Set();

  context.on("page", (page) => {
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        try {
          const u = normalizeUrl(frame.url(), startUrl);
          if (u) spaRoutes.add(u);
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
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
        await waitForSpaReady(page);

        let links = [];
        if (interactionMode) {
          const explored = await explorePageInteractions(page, url, startUrl, {
            maxInteractions: 10,
          });
          links = explored.links;
          crawlMeta.interactions.push(...explored.interactions);
          for (const ch of explored.uiStateChanges || []) {
            crawlMeta.interactions.push({
              action: "ui_state",
              label: ch.message,
              urlAfter: page.url(),
            });
          }
        } else {
          const { extractAllLinks } = await import("./link-extract.mjs");
          links = await extractAllLinks(page, url, startUrl);
        }

        for (const route of spaRoutes) {
          links.push(route);
        }

        for (const link of links) {
          const n = normalizeUrl(link, url);
          if (!n) continue;
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
