import {
  normalizeUrl,
  isInCrawlScope,
  isOutboundUrl,
  isHttp,
} from "./url-utils.mjs";
import { expandUrlCandidates } from "./link-extract.mjs";

/** Tracks crawlable routes vs outbound (external) navigations from the seed site. */
export function createRouteCollector(startUrl) {
  const routes = new Set();
  const outbound = new Set();

  const add = (raw, baseUrl) => {
    if (!raw || typeof raw !== "string") return;
    for (const candidate of expandUrlCandidates(raw, baseUrl || startUrl, startUrl)) {
      const n = normalizeUrl(candidate, baseUrl || startUrl);
      if (!n || !isHttp(n)) continue;
      if (isInCrawlScope(n, startUrl)) {
        routes.add(n);
      } else if (isOutboundUrl(n, startUrl)) {
        outbound.add(n);
      }
    }
  };

  return {
    add,
    addMany(urls, baseUrl) {
      for (const u of urls) add(u, baseUrl);
    },
    addFromSpaNav(spaNavLog) {
      for (const entry of spaNavLog || []) {
        if (entry?.url) add(entry.url, startUrl);
      }
    },
    list() {
      return [...routes];
    },
    outboundList() {
      return [...outbound];
    },
    mergeIntoSet(targetSet) {
      for (const u of routes) targetSet.add(u);
    },
    mergeOutboundIntoSet(targetSet) {
      for (const u of outbound) targetSet.add(u);
    },
    size() {
      return routes.size;
    },
    outboundSize() {
      return outbound.size;
    },
  };
}
