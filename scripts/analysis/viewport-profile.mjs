/** @typedef {'mobile' | 'desktop'} DeviceProfileName */

export const VIEWPORT_PROFILES = {
  mobile: {
    name: "mobile",
    width: 390,
    height: 844,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 SiteScope/0.1",
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
  desktop: {
    name: "desktop",
    width: 1440,
    height: 900,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 SiteScope/0.1",
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
  },
};

export function getDeviceProfile(name = "desktop") {
  return VIEWPORT_PROFILES[name] || VIEWPORT_PROFILES.desktop;
}

export function playwrightContextOptions(deviceProfileName = "desktop") {
  const p = getDeviceProfile(deviceProfileName);
  return {
    viewport: { width: p.width, height: p.height },
    userAgent: p.userAgent,
    isMobile: p.isMobile,
    hasTouch: p.hasTouch,
    deviceScaleFactor: p.deviceScaleFactor,
    ignoreHTTPSErrors: true,
  };
}

export async function applyDeviceViewport(page, deviceProfileName = "desktop") {
  const p = getDeviceProfile(deviceProfileName);
  await page.setViewportSize({ width: p.width, height: p.height });
}
