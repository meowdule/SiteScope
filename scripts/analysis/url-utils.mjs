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

/** Internal if same site as start or current page origin / registrable domain. */
export function isInternalToSite(url, startUrl, pageUrl) {
  try {
    const u = new URL(url);
    const start = new URL(startUrl);
    const page = new URL(pageUrl);
    if (u.origin === start.origin || u.origin === page.origin) return true;
    return (
      sameRegistrableDomain(u.href, start.href) ||
      sameRegistrableDomain(u.href, page.href)
    );
  } catch {
    return false;
  }
}

export function isHttp(s) {
  try {
    const p = new URL(s).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}
