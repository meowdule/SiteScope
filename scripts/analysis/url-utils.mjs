/** Hash-based SPA routes: #/plans, #!/plans */
export function isAppHashRoute(hash) {
  return /^#!?\//.test(hash || "");
}

/** GitHub/GitLab Pages style deploy under a subpath — strict path prefix crawl. */
export function isSubpathDeployment(startUrl) {
  try {
    const u = new URL(startUrl);
    const host = u.hostname.toLowerCase();
    if (host.endsWith(".github.io") || host.endsWith(".gitlab.io")) return true;
    const segments = u.pathname.split("/").filter(Boolean);
    return segments.length >= 2;
  } catch {
    return false;
  }
}

/** Human-readable route for logs (pathname + hash route when present). */
export function formatRouteLabel(urlOrHref, baseUrl) {
  try {
    const u = new URL(urlOrHref, baseUrl || urlOrHref);
    const path = normalizedPathname(u);
    if (isAppHashRoute(u.hash)) return `${path}${u.hash}`;
    if (u.search) return `${path}${u.search}`;
    return path;
  } catch {
    return String(urlOrHref ?? "");
  }
}

export function isHomepageUrl(pageUrl, startUrl) {
  const a = normalizeUrl(pageUrl, startUrl);
  const b = normalizeUrl(startUrl, startUrl);
  if (!a || !b) return false;
  if (a === b) return true;
  try {
    const pa = new URL(a);
    const pb = new URL(b);
    return (
      pa.origin === pb.origin &&
      pa.pathname === pb.pathname &&
      (pa.hash || "") === (pb.hash || "")
    );
  } catch {
    return false;
  }
}

export function normalizeUrl(href, baseUrl) {
  try {
    const u = new URL(href, baseUrl);
    if (isAppHashRoute(u.hash)) {
      if (u.hash.startsWith("#!")) u.hash = `#${u.hash.slice(2)}`;
    } else {
      u.hash = "";
    }
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
      mode: isSubpathDeployment(startUrl) ? "path_prefix" : "origin",
    };
  } catch {
    return { origin: null, pathPrefix: null, mode: "origin" };
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

/**
 * Pages we actually crawl — must stay on the seed origin (and subpath when deployed under one).
 * e.g. m.getcha.kr/web/https%3A%2F%2Fwww... is in-scope; www.getcha.kr/... is not.
 */
export function isInCrawlScope(url, startUrl) {
  try {
    const u = new URL(url);
    const start = new URL(startUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.origin !== start.origin) return false;

    if (isSubpathDeployment(startUrl)) {
      const prefix = getSeedPathPrefix(startUrl);
      if (!prefix) return true;
      const path = normalizedPathname(u);
      if (path === prefix || path.startsWith(`${prefix}/`)) return true;
      if (path === prefix && isAppHashRoute(u.hash)) return true;
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/** HTTP(S) link that leaves the crawl scope (record navigation, do not crawl). */
export function isOutboundUrl(url, startUrl) {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return !isInCrawlScope(url, startUrl);
  } catch {
    return false;
  }
}

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
  const out = new Set();
  for (const raw of urls) {
    const n = normalizeUrl(raw, startUrl);
    if (!n || !isInCrawlScope(n, startUrl)) continue;
    out.add(n);
  }
  return [...out];
}

export function sameLogicalRoute(a, b, baseUrl) {
  try {
    const ua = new URL(a, baseUrl);
    const ub = new URL(b, baseUrl);
    return (
      ua.origin === ub.origin &&
      normalizedPathname(ua) === normalizedPathname(ub) &&
      (ua.search || "") === (ub.search || "") &&
      (ua.hash || "") === (ub.hash || "")
    );
  } catch {
    return a === b;
  }
}
