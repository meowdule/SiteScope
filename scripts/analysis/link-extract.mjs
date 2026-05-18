import {
  normalizeUrl,
  isHttp,
  isInternalToSite,
  isOutboundUrl,
  isAppHashRoute,
} from "./url-utils.mjs";

function decodeSpaWebPath(pathname) {
  const m = pathname.match(/^\/web\/(.+)$/i);
  if (!m) return [];
  try {
    const inner = decodeURIComponent(m[1]);
    if (/^https?:\/\//i.test(inner)) return [inner];
  } catch {
    /* ignore */
  }
  return [];
}

function candidateFromElement(el, base) {
  const urls = [];
  const add = (raw) => {
    if (!raw || typeof raw !== "string") return;
    const t = raw.trim();
    if (!t || t.startsWith("javascript:") || t.startsWith("mailto:")) return;
    try {
      urls.push(new URL(t, base).toString());
    } catch {
      /* ignore */
    }
  };

  add(el.getAttribute?.("href"));
  add(el.getAttribute?.("data-href"));
  add(el.getAttribute?.("data-url"));
  add(el.getAttribute?.("data-to"));
  add(el.getAttribute?.("data-path"));
  add(el.getAttribute?.("data-link"));
  const to = el.getAttribute?.("to");
  if (to && to.startsWith("/")) add(to);

  const onclick = el.getAttribute?.("onclick") || "";
  const loc = onclick.match(
    /(?:location\.href|navigate|push|replace)\s*\(\s*['"`]([^'"`]+)['"`]/i,
  );
  if (loc) add(loc[1]);

  return urls;
}

export function filterInternalUrls(rawUrls, pageUrl, startUrl) {
  const out = new Set();
  for (const href of rawUrls) {
    for (const expanded of expandUrlCandidates(href, pageUrl, startUrl)) {
      const n = normalizeUrl(expanded, pageUrl);
      if (!n || !isHttp(n)) continue;
      if (!isInternalToSite(n, startUrl, pageUrl)) continue;
      out.add(n);
    }
  }
  return [...out];
}

export function filterOutboundUrls(rawUrls, pageUrl, startUrl) {
  const out = new Set();
  for (const href of rawUrls) {
    for (const expanded of expandUrlCandidates(href, pageUrl, startUrl)) {
      const n = normalizeUrl(expanded, pageUrl);
      if (!n || !isHttp(n)) continue;
      if (!isOutboundUrl(n, startUrl)) continue;
      out.add(n);
    }
  }
  return [...out];
}

/** @param {string} href @param {string} baseUrl @param {string} [startUrl] seed for scope when unwrapping /web/… */
export function expandUrlCandidates(href, baseUrl, startUrl) {
  const results = new Set();
  const scopeBase = startUrl || baseUrl;
  try {
    const abs = new URL(href, baseUrl).toString();
    results.add(abs);
    const u = new URL(abs);
    const seedOrigin = new URL(scopeBase).origin;
    for (const decoded of decodeSpaWebPath(u.pathname)) {
      try {
        const inner = new URL(decoded);
        if (inner.origin === seedOrigin) {
          results.add(decoded);
          const dn = normalizeUrl(decoded, baseUrl);
          if (dn) results.add(dn);
        }
      } catch {
        /* ignore */
      }
    }
    if (isAppHashRoute(u.hash)) {
      results.add(u.toString());
    }
  } catch {
    /* ignore */
  }
  return [...results];
}

/** Extract links/routes after JS render (anchors, router attrs, onclick, history). */
export async function extractAllLinks(page, pageUrl, startUrl) {
  const raw = await page.evaluate((base) => {
    const urls = new Set();
    const add = (href) => {
      if (!href) return;
      const t = String(href).trim();
      if (
        !t ||
        t.startsWith("mailto:") ||
        t.startsWith("tel:") ||
        t.startsWith("javascript:")
      )
        return;
      try {
        urls.add(new URL(t, base).toString());
      } catch {
        /* ignore */
      }
    };

    document.querySelectorAll("a[href], area[href]").forEach((el) => {
      add(el.getAttribute("href"));
    });

    const attrNames = [
      "data-href",
      "data-url",
      "data-to",
      "data-path",
      "data-link",
      "data-route",
      "data-router-link",
    ];
    for (const name of attrNames) {
      document.querySelectorAll(`[${name}]`).forEach((el) => {
        add(el.getAttribute(name));
      });
    }

    document
      .querySelectorAll('[role="link"], [role="button"][data-href]')
      .forEach((el) => {
        add(el.getAttribute("href") || el.getAttribute("data-href"));
      });

    document.querySelectorAll("[onclick]").forEach((el) => {
      const on = el.getAttribute("onclick") || "";
      const m = on.match(
        /(?:location\.href|navigate|push|replace)\s*\(\s*['"`]([^'"`]+)['"`]/i,
      );
      if (m) add(m[1]);
    });

    if (window.__NEXT_DATA__?.page) {
      const p = window.__NEXT_DATA__.page;
      if (typeof p === "string" && p.startsWith("/")) add(p);
    }

    try {
      const { pathname, search, hash } = window.location;
      if (hash?.startsWith("#/")) add(hash.slice(1));
      add(pathname + search);
    } catch {
      /* ignore */
    }

    return Array.from(urls);
  }, pageUrl);

  const fromDom = await page.evaluate((base) => {
    const urls = [];
    document.querySelectorAll("a, button, [role=button], [role=link]").forEach((el) => {
      const attrs = [
        "href",
        "data-href",
        "data-url",
        "data-to",
        "data-path",
      ];
      for (const a of attrs) {
        const v = el.getAttribute(a);
        if (v) {
          try {
            urls.push(new URL(v, base).toString());
          } catch {
            /* ignore */
          }
        }
      }
    });
    return urls;
  }, pageUrl);

  return filterInternalUrls([...raw, ...fromDom], pageUrl, startUrl);
}

/** External destinations visible on the page (App Store, etc.) — not crawled. */
export async function extractOutboundLinks(page, pageUrl, startUrl) {
  const raw = await page.evaluate((base) => {
    const urls = new Set();
    const add = (href) => {
      if (!href) return;
      const t = String(href).trim();
      if (
        !t ||
        t.startsWith("mailto:") ||
        t.startsWith("tel:") ||
        t.startsWith("javascript:")
      )
        return;
      try {
        urls.add(new URL(t, base).toString());
      } catch {
        /* ignore */
      }
    };
    document.querySelectorAll("a[href], area[href]").forEach((el) => {
      add(el.getAttribute("href"));
    });
    for (const name of ["data-href", "data-url", "data-link"]) {
      document.querySelectorAll(`[${name}]`).forEach((el) => {
        add(el.getAttribute(name));
      });
    }
    return Array.from(urls);
  }, pageUrl);
  return filterOutboundUrls(raw, pageUrl, startUrl);
}
