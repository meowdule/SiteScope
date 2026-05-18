import { waitForSpaReady } from "./spa-wait.mjs";
import { extractAllLinks } from "./link-extract.mjs";
import { isInCrawlScope } from "./url-utils.mjs";
import { ANALYSIS_CONFIG, getInteractionProfile } from "./analysis-config.mjs";
import {
  installSpaHooks,
  readNavLog,
  readNetworkDelta,
  clearSpaLogs,
} from "./spa-hooks.mjs";
import { takeDomSnapshot, diffSnapshots } from "./dom-snapshot.mjs";
import {
  createFlowRoot,
  addInteractionNode,
  formatFlowTree,
} from "./interaction-flow.mjs";

/**
 * Human-like interaction discovery — profile-driven (homepage rich, subpage light).
 * @param {'homepage'|'subpage'|'crawlSeed'} profile
 */
export async function explorePageInteractions(
  page,
  pageUrl,
  startUrl,
  options = {},
) {
  const profileName = options.profile || "subpage";
  const P = { ...getInteractionProfile(profileName), ...options };
  const debug = options.debug ?? ANALYSIS_CONFIG.interaction.debug;

  const crawlStartedAt = Date.now();
  const deadline = crawlStartedAt + P.maxRuntimeMs;
  const isTimedOut = () => Date.now() >= deadline;

  const discovered = new Set();
  const interactions = [];
  const uiStateChanges = [];
  const skipped = [];
  const skippedByReason = {};
  const debugInteractions = [];

  const pageLabel =
    profileName === "homepage" || isHomepagePath(pageUrl, startUrl)
      ? "Home"
      : "Page";
  const flowRoot = createFlowRoot(pageLabel);

  if (P.mobileViewport) {
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await installSpaHooks(page);

  const networkEvents = [];
  const onRequest = (req) => {
    const t = req.resourceType();
    if (t === "fetch" || t === "xhr" || t === "websocket") {
      networkEvents.push({
        phase: "request",
        type: t,
        url: req.url().slice(0, 200),
        method: req.method(),
      });
    }
  };
  const onResponse = (res) => {
    const t = res.request().resourceType();
    if (t === "fetch" || t === "xhr") {
      networkEvents.push({
        phase: "response",
        type: t,
        url: res.url().slice(0, 200),
        status: res.status(),
      });
    }
  };
  page.on("request", onRequest);
  page.on("response", onResponse);

  const drainNetwork = () => {
    const copy = networkEvents.splice(0, networkEvents.length);
    return copy;
  };

  const recordSkip = (reason, label) => {
    skipped.push({ label, reason });
    skippedByReason[reason] = (skippedByReason[reason] || 0) + 1;
  };

  const collect = async () => {
    const links = await extractAllLinks(page, pageUrl, startUrl);
    const before = discovered.size;
    links.forEach((l) => discovered.add(l));
    return { links, newCount: discovered.size - before };
  };

  const mergeCandidates = (existing, incoming) => {
    const seen = new Set(existing.map((c) => `${c.hint}|${c.label}`));
    for (const c of incoming) {
      const fp = `${c.hint}|${c.label}`;
      if (seen.has(fp)) continue;
      seen.add(fp);
      existing.push(c);
    }
    existing.sort((a, b) => b.score - a.score);
    return existing.slice(0, P.maxCandidates);
  };

  await scrollToReveal(page, {
    passes: P.scrollPasses,
    quick: profileName !== "homepage",
  });
  await waitForSpaReady(page, { fast: profileName !== "homepage" });
  await rescanAfterHydration(page, true);

  const initialSnap = await takeDomSnapshot(page);
  const initial = await collect();
  const initialEv = {
    action: "initial_scan",
    label: "페이지 로드·스크롤 후 스캔",
    urlAfter: page.url(),
    linksFound: initial.links.length,
    domSummary: `화면 요소 약 ${initialSnap.visibleElements}개, 클릭 후보 ${initialSnap.interactive}개`,
    candidateCount: initialSnap.interactive,
    success: true,
  };
  interactions.push(initialEv);
  addInteractionNode(flowRoot, initialEv);

  let candidates = await findAndTagCandidates(page, P.maxCandidates, P.richHeuristics);
  candidates = await scrollDiscoverCandidates(
    page,
    candidates,
    P,
    interactions,
    flowRoot,
    initialSnap,
    isTimedOut,
    mergeCandidates,
  );

  let clicks = 0;
  let meaningfulCount = 0;
  let attempts = 0;
  let noChangeStreak = 0;
  const seenFingerprints = new Set();

  for (const cand of candidates) {
    if (meaningfulCount >= P.maxInteractions || isTimedOut()) break;
    attempts++;

    const fp = `${cand.hint}|${(cand.label || "").slice(0, 48)}`;
    if (seenFingerprints.has(fp)) {
      recordSkip("duplicate", cand.label);
      continue;
    }
    seenFingerprints.add(fp);

    const locator = page.locator(`[data-sitescope-target="${cand.id}"]`).first();
    try {
      if (!(await locator.isVisible({ timeout: 600 }))) {
        recordSkip("not_visible", cand.label);
        continue;
      }
      if (await locator.isDisabled().catch(() => false)) {
        recordSkip("disabled", cand.label);
        continue;
      }

      const beforeUrl = page.url();
      const beforeSnap = await takeDomSnapshot(page);
      await clearSpaLogs(page);
      const netBefore = drainNetwork().length;

      await locator.scrollIntoViewIfNeeded({ timeout: 2500 }).catch(() => {});
      if (["menu", "dropdown", "tab", "carousel"].includes(cand.hint)) {
        await locator.hover({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(200);
      }

      try {
        await locator.click({ timeout: 4000, force: false });
      } catch {
        try {
          await locator.click({ timeout: 2000, force: true });
        } catch {
          recordSkip("click_failed", cand.label);
          continue;
        }
      }

      await waitForSpaReady(page, { short: true, fast: true });
      await rescanAfterHydration(page, true);

      const afterUrl = page.url();
      if (!isInCrawlScope(afterUrl, startUrl)) {
        await page
          .goBack({ waitUntil: "domcontentloaded", timeout: 10_000 })
          .catch(() => {});
        await waitForSpaReady(page, { short: true, fast: true });
        recordSkip("out_of_scope", cand.label);
        continue;
      }

      const afterSnap = await takeDomSnapshot(page);
      const domDiff = diffSnapshots(beforeSnap, afterSnap);
      const spaNav = await readNavLog(page);
      const fetchDelta = await readNetworkDelta(page);
      const netSession = drainNetwork();
      const { links, newCount } = await collect();

      const classified = classifyInteraction({
        beforeSnap,
        afterSnap,
        domDiff,
        spaNav,
        netSession,
        netBefore,
        fetchDelta,
        hint: cand.hint,
        newLinks: newCount,
      });

      const ev = {
        action: classified.action,
        label: cand.label,
        targetHint: cand.hint,
        score: cand.score,
        urlBefore: beforeUrl,
        urlAfter: afterUrl,
        linksFound: links.length,
        newLinks: newCount,
        domDiff: domDiff.friendlySummary,
        domDelta: {
          visible: domDiff.deltaVisible,
          overlays: domDiff.deltaOverlays,
          links: domDiff.deltaLinks,
          interactive: afterSnap.interactive - beforeSnap.interactive,
        },
        spaNavigation: spaNav.length
          ? spaNav.map((n) => n.type).join(", ")
          : undefined,
        networkSummary: classified.networkSummary,
        apiCallCount: classified.apiCallCount,
        routeChanged: classified.routeChanged,
        success: classified.meaningful,
      };

      interactions.push(ev);

      if (debug) {
        debugInteractions.push({
          label: cand.label,
          meaningful: classified.meaningful,
          action: classified.action,
          routeChanged: classified.routeChanged,
          domDelta: ev.domDelta,
          apiCallCount: classified.apiCallCount,
        });
      }

      if (classified.meaningful) {
        meaningfulCount++;
        clicks++;
        noChangeStreak = 0;
        addInteractionNode(flowRoot, ev);

        if (domDiff.deltaOverlays > 0) {
          uiStateChanges.push({
            type: "modal_or_drawer",
            message: `‘${cand.label}’ 클릭 후 ${domDiff.friendlySummary}`,
          });
        }

        if (!isTimedOut() && profileName === "homepage") {
          const fresh = await findAndTagCandidates(
            page,
            Math.min(P.maxCandidates, 40),
            P.richHeuristics,
          );
          candidates = mergeCandidates(candidates, fresh);
        }
      } else {
        recordSkip("no_change", cand.label);
        noChangeStreak++;
        if (noChangeStreak >= P.consecutiveNoChangeStop) break;
        continue;
      }

      if (classified.routeChanged && afterUrl !== beforeUrl) {
        await page
          .goBack({ waitUntil: "domcontentloaded", timeout: 10_000 })
          .catch(() => {});
        await waitForSpaReady(page, { short: true, fast: true });
        pageUrl = page.url();
        if (!isTimedOut()) {
          const fresh = await findAndTagCandidates(
            page,
            Math.min(P.maxCandidates, 35),
            P.richHeuristics,
          );
          candidates = mergeCandidates(candidates, fresh);
        }
      } else if (domDiff.deltaOverlays > 0) {
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(250);
      }
    } catch (e) {
      recordSkip("error", cand.label);
      if (debug) {
        skipped.push({
          label: cand.label,
          reason: e instanceof Error ? e.message : "error",
        });
      }
    }
  }

  page.off("request", onRequest);
  page.off("response", onResponse);

  const finalLinks = await collect();
  const interactionFlow = formatFlowTree(flowRoot);

  return {
    links: [...discovered],
    interactions,
    uiStateChanges,
    interactionFlow,
    flowRoot,
    discoveryStats: {
      profile: profileName,
      candidatesFound: candidates.length,
      clicksAttempted: attempts,
      clicksRecorded: meaningfulCount,
      linksDiscovered: finalLinks.links.length,
      stoppedEarly: isTimedOut() || noChangeStreak >= P.consecutiveNoChangeStop,
      runtimeMs: Date.now() - crawlStartedAt,
      skippedByReason,
      meaningfulCount,
    },
    debug: debug
      ? {
          skipped: skipped.slice(0, 60),
          skippedByReason,
          interactions: debugInteractions,
        }
      : undefined,
  };
}

function isHomepagePath(pageUrl, startUrl) {
  try {
    const a = new URL(pageUrl);
    const b = new URL(startUrl);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

function classifyInteraction({
  beforeSnap,
  afterSnap,
  domDiff,
  spaNav,
  netSession,
  netBefore,
  fetchDelta,
  hint,
  newLinks,
}) {
  const reqCount = netSession.filter((e) => e.phase === "request").length;
  const apiCallCount = reqCount + fetchDelta.length;
  const networkBurst = apiCallCount > netBefore || fetchDelta.length > 0;
  const routeChanged =
    domDiff.urlChanged || spaNav.length > 0 || beforeSnap.pathname !== afterSnap.pathname;

  const networkSummary =
    reqCount > 0
      ? `서버 요청 ${reqCount}건`
      : fetchDelta.length > 0
        ? `데이터 요청 ${fetchDelta.length}건`
        : undefined;

  let action = "click";
  let meaningful = false;

  if (routeChanged) {
    action = "navigation";
    meaningful = true;
  } else if (domDiff.deltaOverlays > 0) {
    action = "overlay";
    meaningful = true;
  } else if (hint === "tab" && (domDiff.deltaVisible > 1 || afterSnap.interactive !== beforeSnap.interactive)) {
    action = "tab_change";
    meaningful = true;
  } else if (hint === "dropdown" || hint === "accordion") {
    if (domDiff.deltaVisible > 0 || domDiff.deltaInteractive > 0) {
      action = hint === "accordion" ? "accordion" : "content_reveal";
      meaningful = true;
    }
  } else if (hint === "carousel" && domDiff.deltaVisible > 0) {
    action = "carousel";
    meaningful = true;
  } else if (domDiff.deltaVisible > 3 || domDiff.deltaInteractive > 2) {
    action = "content_reveal";
    meaningful = true;
  } else if (networkBurst && (domDiff.deltaVisible > 0 || afterSnap.loadingIndicators < beforeSnap.loadingIndicators)) {
    action = "async_load";
    meaningful = true;
  } else if (newLinks > 0) {
    action = "content_reveal";
    meaningful = true;
  } else if (domDiff.changes.length > 0) {
    meaningful = domDiff.changes.some((c) => c.type !== "loading");
    action = meaningful ? "content_reveal" : "click";
  }

  return {
    meaningful,
    action,
    routeChanged,
    networkSummary,
    apiCallCount,
  };
}

/** Scroll page in steps; rescan candidates when new content appears. */
async function scrollDiscoverCandidates(
  page,
  candidates,
  profile,
  interactions,
  flowRoot,
  initialSnap,
  isTimedOut,
  mergeCandidates,
) {
  if (profile.scrollPasses <= 1) return candidates;

  let prevSnap = initialSnap;
  const steps = profile.scrollPasses;

  for (let i = 1; i <= steps && !isTimedOut(); i++) {
    await page.evaluate(({ step, total }) => {
      const max = Math.min(document.documentElement.scrollHeight, 9000);
      const y = Math.round((max / (total + 1)) * step);
      window.scrollTo(0, y);
    }, { step: i, total: steps });
    await page.waitForTimeout(220);
    await rescanAfterHydration(page, true);

    const snap = await takeDomSnapshot(page);
    const delta = snap.visibleElements - prevSnap.visibleElements;
    if (delta > 4) {
      const ev = {
        action: "scroll_reveal",
        label: `스크롤 ${i}/${steps} — 요소 +${delta}`,
        domDiff: `스크롤 후 보이는 요소 약 ${delta}개 증가`,
        success: true,
        newLinks: 0,
      };
      interactions.push(ev);
      addInteractionNode(flowRoot, ev);

      const fresh = await findAndTagCandidates(
        page,
        profile.maxCandidates,
        profile.richHeuristics,
      );
      candidates = mergeCandidates(candidates, fresh);
    }
    if (snap.scrollHeight > prevSnap.scrollHeight + 100) {
      const ev = {
        action: "scroll_reveal",
        label: "스크롤 — 페이지 길이 증가 (추가 로딩)",
        domDiff: "아래 콘텐츠가 더 로드된 것 같습니다",
        success: true,
      };
      interactions.push(ev);
    }
    prevSnap = snap;
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  return candidates;
}

async function scrollToReveal(page, { passes = 3, quick = false } = {}) {
  await page.evaluate(async ({ passes, quick }) => {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(220, window.innerHeight * 0.75);
    const max = Math.min(document.documentElement.scrollHeight, quick ? 5000 : 8000);
    const maxSteps = Math.min(passes + 1, quick ? 3 : 6);
    let y = 0;
    let n = 0;
    while (y < max && n < maxSteps) {
      window.scrollTo(0, y);
      await delay(quick ? 120 : 180);
      y += step;
      n++;
    }
    window.scrollTo(0, 0);
    await delay(100);
  }, { passes, quick });
}

async function rescanAfterHydration(page, fast = false) {
  await page.waitForTimeout(fast ? 100 : 200);
  await page
    .evaluate(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    })
    .catch(() => {});
}

async function findAndTagCandidates(page, limit, richHeuristics = false) {
  return page.evaluate(
    ({ limit, richHeuristics }) => {
      document
        .querySelectorAll("[data-sitescope-target]")
        .forEach((el) => el.removeAttribute("data-sitescope-target"));

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const seen = new Set();
      const out = [];

      const visible = (el) => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (parseFloat(style.opacity) < 0.08) return false;
        if (style.pointerEvents === "none") return false;
        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6) return false;
        if (r.bottom < -vh * 0.3 || r.top > vh * 1.6) return false;
        return true;
      };

      const inViewport = (r) =>
        r.top < vh * 0.95 && r.bottom > vh * 0.05 && r.left < vw && r.right > 0;

      const textOf = (el) => {
        const t =
          (el.innerText || el.textContent || "").trim() ||
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          el.getAttribute("alt") ||
          "";
        return t.slice(0, 72);
      };

      const scoreEl = (el) => {
        let s = 0;
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role") || "";
        const style = getComputedStyle(el);
        const cls = (el.className || "").toString();
        const text = textOf(el);
        const blob = `${cls} ${text} ${el.id || ""}`;
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;

        if (tag === "button" || role === "button") s += 62;
        if (role === "tab") s += 58;
        if (tag === "a" && (el.getAttribute("href") || el.getAttribute("data-href"))) s += 40;
        if (el.onclick || el.getAttribute("onclick")) s += 48;
        if (style.cursor === "pointer") s += 32;
        if (el.getAttribute("data-href") || el.getAttribute("data-to")) s += 34;
        if (el.getAttribute("data-action")) s += 26;
        if (el.getAttribute("aria-expanded") === "false") s += 30;
        if (el.getAttribute("aria-haspopup")) s += 26;
        if (tag === "summary") s += 34;

        if (/primary|main-cta|hero|submit|buy|purchase|quote|estimate|견적|구매|시작|신청/i.test(blob))
          s += 35;
        if (/cta|btn|button|more|detail|cart|event|이벤트|배너|banner/i.test(blob)) s += 26;
        if (/menu|nav|hamburger|drawer|햄버거/i.test(blob)) s += 30;
        if (/tab|탭/i.test(blob) || role === "tab") s += 28;
        if (/carousel|slide|swiper|slider/i.test(blob)) s += 24;
        if (/card|item|tile|list-item|product|상품/i.test(blob)) s += 18;
        if (/accordion|collapse|expand|펼치/i.test(blob)) s += 26;
        if (/modal|popup|sheet|bottom|fab|floating|sticky|fixed/i.test(blob)) s += 28;

        if (el.closest("nav, header, footer, [role='navigation']")) s += 22;
        if (el.closest("[class*='bottom' i], [class*='gnb' i], [class*='nav-bar' i]"))
          s += 26;
        if (el.closest("[class*='carousel' i], [class*='swiper' i], [class*='slider' i]"))
          s += 20;

        if (inViewport(r)) s += 40;
        else s -= 30;

        if (area > 2500 && area < 180000) s += 14;
        if (r.width >= 48 && r.height >= 48 && !text && richHeuristics) {
          const radius = parseFloat(style.borderRadius) || 0;
          const shadow = style.boxShadow !== "none";
          const border = style.borderWidth && style.borderWidth !== "0px";
          if (radius >= 4 || shadow || border) s += 22;
        }

        if (r.top > vh * 0.68 && r.height < 140) s += 22;
        if (style.position === "fixed" || style.position === "sticky") s += 32;

        if (el.querySelector("svg, img") && (tag === "button" || role === "button" || style.cursor === "pointer"))
          s += 12;

        if (el.getAttribute("aria-disabled") === "true" || el.disabled) s -= 200;

        let hint = "generic";
        if (/menu|nav|hamburger|drawer/i.test(blob)) hint = "menu";
        else if (/accordion|collapse|expand/i.test(blob)) hint = "accordion";
        else if (/dropdown|select/i.test(blob)) hint = "dropdown";
        else if (/primary|cta|fab|floating|sticky|bottom|hero|submit|견적|구매/i.test(blob))
          hint = "cta";
        else if (/tab|탭/i.test(blob) || role === "tab") hint = "tab";
        else if (/carousel|slide|swiper|banner|이벤트|event/i.test(blob)) hint = "carousel";
        else if (/card|item|tile|product|상품/i.test(blob) || (richHeuristics && area > 4000 && !text))
          hint = "card";

        return { s, hint, text, r };
      };

      const selectors = [
        "button",
        "a[href]",
        "a[data-href]",
        "[role='button']",
        "[role='tab']",
        "[role='link']",
        "[role='menuitem']",
        "[onclick]",
        "[data-href]",
        "[data-to]",
        "[data-action]",
        "summary",
        "[tabindex='0']",
        "[class*='btn' i]",
        "[class*='button' i]",
        "[class*='cta' i]",
        "[class*='card' i]",
        "[class*='Card' i]",
        "[class*='banner' i]",
        "[class*='event' i]",
        "[class*='tab' i]",
        "[class*='nav' i]",
        "[class*='menu' i]",
        "[class*='carousel' i] *",
        "[class*='swiper' i] *",
        "[class*='item' i]",
        "li",
        "article",
      ];

      if (richHeuristics) {
        document.querySelectorAll("div, li, section, article").forEach((el) => {
          const style = getComputedStyle(el);
          if (style.cursor !== "pointer") return;
          const r = el.getBoundingClientRect();
          if (r.width < 72 || r.height < 56) return;
          if (!visible(el)) return;
          const hasChildBtn = el.querySelector("button, a, [role='button']");
          if (hasChildBtn && el !== hasChildBtn) return;
          seen.add(el);
        });
      }

      const nodes = new Set(seen);
      for (const sel of selectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => nodes.add(el));
        } catch {
          /* ignore */
        }
      }

      for (const el of nodes) {
        if (!visible(el)) continue;
        const scored = scoreEl(el);
        if (scored.s < 26) continue;
        if (out.some((o) => o.el === el)) continue;
        out.push({ el, ...scored });
      }

      out.sort((a, b) => b.s - a.s);
      const top = out.slice(0, limit);
      top.forEach((item, idx) => {
        item.el.setAttribute("data-sitescope-target", String(idx + 1));
      });

      return top.map((item, idx) => ({
        id: idx + 1,
        score: Math.round(item.s),
        hint: item.hint,
        label:
          item.text ||
          `${item.hint !== "generic" ? `[${item.hint}] ` : ""}${item.el.tagName.toLowerCase()}${item.el.className ? ` · ${String(item.el.className).slice(0, 36)}` : ""}`,
      }));
    },
    { limit, richHeuristics },
  );
}
