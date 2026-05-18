import { ANALYSIS_CONFIG } from "./analysis-config.mjs";

const { screenshots: SHOT } = ANALYSIS_CONFIG;

/** Single viewport capture with JPEG compression. */
export async function captureViewportScreenshot(page, absPath) {
  await page.screenshot({
    path: absPath,
    fullPage: false,
    type: SHOT.type,
    quality: SHOT.quality,
    animations: "disabled",
  });
}

export function screenshotViewports() {
  return SHOT.viewports;
}
