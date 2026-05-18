import { enrichUiIssue } from "./issue-labels.mjs";

export const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

function visibleRatio(rect, vw, vh) {
  const ix = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
  const iy = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
  const inter = ix * iy;
  const area = Math.max(1, rect.width * rect.height);
  return inter / area;
}

export async function collectUiSignals(page, viewport, { fast = false } = {}) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await new Promise((r) => setTimeout(r, fast ? 200 : 400));

  const raw = await page.evaluate(
    ({ vw, vh, viewportName }) => {
      const doc = document.documentElement;
      const body = document.body;
      const issues = [];

      const overflowPx = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0) - vw;
      const ox = window.getComputedStyle(doc).overflowX;
      const canScrollX =
        overflowPx > 16 && (ox === "auto" || ox === "scroll" || ox === "visible");
      if (canScrollX) {
        issues.push({
          id: `hscroll-${viewportName}`,
          type: "horizontal_scroll",
          message: "Document scroll width exceeds viewport width.",
          viewport: viewportName,
          severity: "warn",
        });
      }

      const imgs = Array.from(document.images || []);
      for (const img of imgs) {
        if (!img.complete) continue;
        const style = window.getComputedStyle(img);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          issues.push({
            id: `img-${viewportName}-${issues.length}`,
            type: "broken_image",
            message: `Image failed to load: ${img.currentSrc || img.src}`,
            viewport: viewportName,
            severity: "error",
          });
        }
      }

      const candidates = Array.from(
        document.querySelectorAll(
          "button, a, input, textarea, select, [role=button]",
        ),
      ).slice(0, 35);

      const rects = candidates
        .map((el) => {
          const style = window.getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none")
            return null;
          const r = el.getBoundingClientRect();
          return { el, r };
        })
        .filter((x) => x && x.r.width > 4 && x.r.height > 4);

      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i].r;
          const b = rects[j].r;
          const overlap = !(
            a.right < b.left ||
            a.left > b.right ||
            a.bottom < b.top ||
            a.top > b.bottom
          );
          if (overlap) {
            const areaA = a.width * a.height;
            const areaB = b.width * b.height;
            const minArea = Math.min(areaA, areaB);
            const ix =
              Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
              Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            if (ix > minArea * 0.35) {
              issues.push({
                id: `overlap-${viewportName}-${i}-${j}`,
                type: "overlap",
                message: "Two interactive elements overlap significantly.",
                viewport: viewportName,
                severity: "warn",
              });
            }
          }
        }
      }

      const textNodes = Array.from(
        document.querySelectorAll("p, span, li, h1, h2, h3, label"),
      ).slice(0, 50);
      for (const el of textNodes) {
        const style = window.getComputedStyle(el);
        if (style.overflowX === "hidden" || style.overflow === "hidden") {
          if (el.scrollWidth > el.clientWidth + 6 && el.textContent?.trim()) {
            issues.push({
              id: `clip-${viewportName}-${issues.length}`,
              type: "hidden_overflow",
              message: "Possible clipped text with hidden overflow.",
              viewport: viewportName,
              severity: "info",
            });
            break;
          }
        }
      }

      const checkEls = document.querySelectorAll(
        "img, svg, video, section, article, main, [role=main]",
      );
      checkEls.forEach((el, idx) => {
        if (idx > 50) return;
        const style = window.getComputedStyle(el);
        if (
          style.visibility === "hidden" ||
          style.display === "none" ||
          style.opacity === "0"
        )
          return;
        if (el.getAttribute("aria-hidden") === "true") return;
        const pos = style.position;
        if (pos === "fixed" || pos === "sticky") return;

        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) return;

        const ratio =
          (Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) *
            Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))) /
          Math.max(1, r.width * r.height);

        const hasMeaningfulText =
          (el.textContent?.trim().length ?? 0) > 2 ||
          el.querySelector("img, svg, button, a");

        if (ratio < 0.12 && hasMeaningfulText) {
          issues.push({
            id: `off-${viewportName}-${idx}`,
            type: "outside_viewport",
            message: "Meaningful content is mostly outside the visible viewport.",
            viewport: viewportName,
            severity: "info",
          });
        }
      });

      return issues;
    },
    {
      vw: viewport.width,
      vh: viewport.height,
      viewportName: viewport.name,
    },
  );

  return raw.map((i) => enrichUiIssue(i));
}
