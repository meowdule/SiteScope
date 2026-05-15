import { normalizeUrl, sameRegistrableDomain, isHttp } from "./url-utils.mjs";

export async function extractInternalLinks(page, basePageUrl, startUrl) {
  return page.evaluate(
    ({ basePageUrl: b }) => {
      const urls = new Set();
      const add = (href) => {
        if (!href) return;
        const t = href.trim();
        if (
          t.startsWith("mailto:") ||
          t.startsWith("tel:") ||
          t.startsWith("javascript:")
        )
          return;
        urls.add(new URL(t, b).toString());
      };
      document.querySelectorAll("a[href]").forEach((a) => add(a.getAttribute("href")));
      document.querySelectorAll("area[href]").forEach((a) => add(a.getAttribute("href")));
      document
        .querySelectorAll('[data-href][role="link"], [data-router-link]')
        .forEach((el) => add(el.getAttribute("data-href")));
      document.querySelectorAll("link[rel='alternate'][href]").forEach((l) => {
        /* skip */
      });
      return Array.from(urls);
    },
    { basePageUrl },
  ).then((raw) => {
    const out = new Set();
    for (const href of raw) {
      const n = normalizeUrl(href, basePageUrl);
      if (!n || !isHttp(n)) continue;
      if (!sameRegistrableDomain(n, startUrl)) continue;
      out.add(n);
    }
    return [...out];
  });
}

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

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SiteScope/0.1",
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
        await page.goto(url, { waitUntil: "networkidle", timeout: 90000 });
        await page.evaluate(async () => {
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 400));
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise((r) => setTimeout(r, 600));
          window.scrollTo(0, 0);
        });
        await new Promise((r) => setTimeout(r, 800));
        const links = await extractInternalLinks(page, url, startUrl);
        for (const link of links) {
          const n = normalizeUrl(link, url);
          if (!n) continue;
          if (visited.has(n)) continue;
          if (enqueued.has(n)) continue;
          enqueued.add(n);
          queue.push({ url: n, depth: depth + 1 });
        }
      } catch {
        /* navigation errors still keep page in ordered list */
      } finally {
        await page.close();
      }
    }
  } finally {
    await context.close();
  }

  return ordered;
}
