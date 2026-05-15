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

export function sameRegistrableDomain(a, b) {
  try {
    return new URL(a).hostname === new URL(b).hostname;
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
