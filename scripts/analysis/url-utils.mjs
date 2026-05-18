/** True when page URL is the same entry as start (post-redirect tolerant on pathname). */
export function isHomepageUrl(pageUrl, startUrl) {
  const a = normalizeUrl(pageUrl, startUrl);
  const b = normalizeUrl(startUrl, startUrl);
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    const pa = new URL(a);
    const pb = new URL(b);
    return pa.origin === pb.origin && pa.pathname === pb.pathname;
  } catch {
    return false;
  }
}

export function normalizeUrl(href, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    u.hash = "";
    if (u.pathname.endsWith("/") && u.pathname !== "/") {
      u.pathname = u.pathname.replace(/\/+$/, "");
    }
    return u.toString();
  } catch {
    return null;
  }
}

function normalizedPathname(url) {
  const p = url.pathname.replace(/\/+$/, "");
  return p || "/";
}

/**
 * Path prefix for crawl scope derived from seed URL.
 * e.g. https://host/SEO-TESTING-HTML/ → /SEO-TESTING-HTML
 * Root seed https://host/ → null (entire origin allowed).
 */
export function getSeedPathPrefix(startUrl) {
  try {
    const start = new URL(startUrl);
    const path = normalizedPathname(start);
    if (path === "/") return null;
    return path;
  } catch {
    return null;
  }
}

export function getSeedScope(startUrl) {
  try {
    const start = new URL(startUrl);
    return {
      origin: start.origin,
      pathPrefix: getSeedPathPrefix(startUrl),
    };
  } catch {
    return { origin: null, pathPrefix: null };
  }
}

/**
 * URL is allowed when it stays under the seed URL path (same origin + prefix).
 * Prevents /SEO-TESTING-HTML/ seed from crawling /pages/* on the same host.
 */
export function isInCrawlScope(url, startUrl) {
  try {
    const u = new URL(url);
    const start = new URL(startUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.origin !== start.origin) return false;

    const prefix = getSeedPathPrefix(startUrl);
    if (!prefix) return true;

    const path = normalizedPathname(u);
    return path === prefix || path.startsWith(`${prefix}/`);
  } catch {
    return false;
  }
}

function registrableRoot(hostname) {
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

export function sameRegistrableDomain(a, b) {
  try {
    const ha = new URL(a).hostname;
    const hb = new URL(b).hostname;
    if (ha === hb) return true;
    return registrableRoot(ha) === registrableRoot(hb);
  } catch {
    return false;
  }
}

/** @deprecated Use isInCrawlScope — kept for callers; now enforces seed path prefix. */
export function isInternalToSite(url, startUrl, _pageUrl) {
  return isInCrawlScope(url, startUrl);
}

export function isHttp(s) {
  try {
    const p = new URL(s).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

export function filterUrlsInScope(urls, startUrl) {
  return urls
    .map((u) => normalizeUrl(u, startUrl))
    .filter((u) => u && isInCrawlScope(u, startUrl));
}
