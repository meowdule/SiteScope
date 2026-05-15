export const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

export async function collectUiSignals(page, viewport) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await new Promise((r) => setTimeout(r, 500));
  return page.evaluate(
    ({ w, h, viewportName }) => {
      const doc = document.documentElement;
      const body = document.body;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const issues = [];

      const scrollOverflowX =
        Math.max(doc.scrollWidth, body?.scrollWidth ?? 0) > vw + 2;
      if (scrollOverflowX) {
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
      ).slice(0, 40);

      const rects = candidates
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { el, r };
        })
        .filter((x) => x.r.width > 4 && x.r.height > 4);

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
            if (ix > minArea * 0.2) {
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
      ).slice(0, 60);
      for (const el of textNodes) {
        const style = window.getComputedStyle(el);
        if (style.overflowX === "hidden" || style.overflow === "hidden") {
          if (el.scrollWidth > el.clientWidth + 4 && el.textContent?.trim()) {
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

      const big = document.querySelectorAll("img, svg, video, section, article");
      big.forEach((el, idx) => {
        if (idx > 40) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.right < -20 || r.bottom < -20 || r.left > vw + 20 || r.top > vh + 20) {
          issues.push({
            id: `off-${viewportName}-${idx}`,
            type: "outside_viewport",
            message: "Large element mostly sits outside the viewport.",
            viewport: viewportName,
            severity: "info",
          });
        }
      });

      return issues;
    },
    {
      w: viewport.width,
      h: viewport.height,
      viewportName: viewport.name,
    },
  );
}
