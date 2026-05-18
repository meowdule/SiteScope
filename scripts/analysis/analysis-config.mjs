/** Central tuning for CI/runtime — override via env where noted. */
const fast = process.env.SITE_SCOPE_FAST === "1";

/** @type {'mobile' | 'desktop'} */
let runtimeDeviceProfile =
  process.env.SITE_SCOPE_DEVICE === "mobile" ? "mobile" : "desktop";

export function setRuntimeDeviceProfile(profile) {
  if (profile === "mobile" || profile === "desktop") {
    runtimeDeviceProfile = profile;
  }
}

export function getRuntimeDeviceProfile() {
  return runtimeDeviceProfile;
}

export const ANALYSIS_CONFIG = {
  fast,
  get deviceProfile() {
    return runtimeDeviceProfile;
  },

  spa: {
    networkSettleMs: fast ? 1800 : 3500,
    networkSettleShortMs: fast ? 800 : 2000,
    domStableMaxMs: fast ? 700 : 2200,
    domStableShortMs: fast ? 400 : 900,
    domIdleTicks: fast ? 2 : 4,
    postScrollPauseMs: fast ? 120 : 350,
    lightScroll: !fast,
  },

  /** Interaction profiles: homepage = rich, subpage/crawlSeed = light. */
  interaction: {
    profiles: {
      homepage: {
        maxInteractions: fast ? 12 : 15,
        maxRuntimeMs: fast ? 45_000 : 60_000,
        maxCandidates: fast ? 50 : 60,
        consecutiveNoChangeStop: 5,
        scrollPasses: fast ? 3 : 4,
        richHeuristics: true,
      },
      subpage: {
        maxInteractions: fast ? 5 : 6,
        maxRuntimeMs: fast ? 20_000 : 28_000,
        maxCandidates: fast ? 22 : 28,
        consecutiveNoChangeStop: 2,
        scrollPasses: 1,
        richHeuristics: false,
      },
      crawlSeed: {
        maxInteractions: fast ? 14 : 18,
        maxRuntimeMs: fast ? 50_000 : 65_000,
        maxCandidates: fast ? 55 : 65,
        consecutiveNoChangeStop: 4,
        scrollPasses: fast ? 3 : 4,
        richHeuristics: true,
      },
    },
    maxInteractionsQuick: fast ? 10 : 12,
    debug: process.env.SITE_SCOPE_DEBUG === "1",
  },

  crawl: {
    maxPages: Number(process.env.SITE_SCOPE_MAX_PAGES) || (fast ? 12 : 20),
    maxDepth: Number(process.env.SITE_SCOPE_MAX_DEPTH) || 2,
    homepageHybridInteraction: true,
  },

  lighthouse: {
    fullOnFirstPageOnly: true,
    fullTimeoutMs: fast ? 50_000 : 70_000,
    lightweightTimeoutMs: fast ? 28_000 : 40_000,
    fullCategories: "performance,accessibility,best-practices,seo",
    lightCategories: "performance",
    maxWaitForLoad: fast ? 18_000 : 28_000,
    skipOnSubpages: true,
  },

  screenshots: {
    get viewports() {
      if (runtimeDeviceProfile === "mobile") {
        return [{ name: "mobile", width: 390, height: 844 }];
      }
      return fast
        ? [{ name: "desktop", width: 1440, height: 900 }]
        : [
            { name: "desktop", width: 1440, height: 900 },
            { name: "mobile", width: 390, height: 844 },
          ];
    },
    type: "jpeg",
    quality: 72,
  },

  parallel: {
    pageConcurrency: fast ? 2 : 2,
  },

  brokenLinkProbeLimit: fast ? 10 : 16,
};

export function getInteractionProfile(name = "subpage") {
  return (
    ANALYSIS_CONFIG.interaction.profiles[name] ||
    ANALYSIS_CONFIG.interaction.profiles.subpage
  );
}
