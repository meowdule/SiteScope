import dns from "node:dns/promises";
import https from "node:https";
import http from "node:http";
import { performance } from "node:perf_hooks";

function follow(urlString, maxRedirects = 8) {
  return new Promise((resolve, reject) => {
    const redirectChain = [];
    const doReq = (urlStr) => {
      if (redirectChain.length >= maxRedirects) {
        reject(new Error("Too many redirects"));
        return;
      }
      const u = new URL(urlStr);
      const lib = u.protocol === "https:" ? https : http;
      const t0 = performance.now();
      const req = lib.request(
        u,
        {
          method: "GET",
          timeout: 20000,
          headers: { "user-agent": "SiteScope/0.1 (+https://github.com)" },
        },
        (res) => {
          redirectChain.push(urlStr);
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            const next = new URL(res.headers.location, urlStr).toString();
            doReq(next);
            return;
          }
          const ms = Math.round(performance.now() - t0);
          res.resume();
          resolve({
            finalUrl: urlStr,
            statusCode: res.statusCode ?? null,
            redirectChain,
            responseTimeMs: ms,
            sslOk: u.protocol === "https:",
          });
        },
      );
      req.on("timeout", () => {
        req.destroy(new Error("Request timeout"));
      });
      req.on("error", reject);
      req.end();
    };
    doReq(urlString);
  });
}

export async function nodeQuickProbe(targetUrl) {
  const out = {
    dnsOk: false,
    dnsMessage: "",
    httpStatus: undefined,
    httpOk: false,
    finalUrl: undefined,
    redirectChain: [],
    sslOk: false,
    sslMessage: "",
    responseTimeMs: undefined,
  };
  let host;
  try {
    host = new URL(targetUrl).hostname;
  } catch {
    return { ...out, dnsMessage: "Invalid URL" };
  }
  try {
    await dns.lookup(host);
    out.dnsOk = true;
    out.dnsMessage = "DNS resolves.";
  } catch (e) {
    out.dnsOk = false;
    out.dnsMessage = e instanceof Error ? e.message : "DNS lookup failed";
    return out;
  }
  try {
    const r = await follow(targetUrl);
    out.httpStatus = r.statusCode ?? undefined;
    out.httpOk = !!r.statusCode && r.statusCode < 400;
    out.finalUrl = r.finalUrl;
    out.redirectChain = r.redirectChain;
    out.responseTimeMs = r.responseTimeMs;
    out.sslOk = new URL(r.finalUrl).protocol === "https:";
    out.sslMessage = out.sslOk ? "HTTPS in use." : "Final URL is not HTTPS.";
  } catch (e) {
    out.httpOk = false;
    out.sslOk = false;
    out.sslMessage = e instanceof Error ? e.message : "HTTP probe failed";
  }
  return out;
}
