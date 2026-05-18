/** Lightweight DOM / UI state fingerprint for before/after interaction diffs. */
export async function takeDomSnapshot(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (parseFloat(style.opacity) < 0.05) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom < -vh || r.top > vh * 2) return false;
      return true;
    };

    let visibleElements = 0;
    let interactive = 0;
    let linkLike = 0;
    const all = document.body?.querySelectorAll("*") || [];
    for (const el of all) {
      if (!visible(el)) continue;
      visibleElements++;
      const tag = el.tagName;
      const role = el.getAttribute("role");
      if (
        tag === "BUTTON" ||
        tag === "A" ||
        role === "button" ||
        role === "tab" ||
        role === "link" ||
        el.onclick ||
        el.getAttribute("onclick") ||
        el.getAttribute("data-href")
      ) {
        interactive++;
      }
      if (tag === "A" || el.getAttribute("href") || el.getAttribute("data-href")) {
        linkLike++;
      }
    }

    const overlaySel =
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [class*="modal" i], [class*="Modal"], [class*="drawer" i], [class*="Drawer"], [class*="bottom-sheet" i], [class*="toast" i], [class*="snackbar" i], [class*="popup" i]';
    const overlays = document.querySelectorAll(overlaySel);
    let visibleOverlays = 0;
    overlays.forEach((o) => {
      if (visible(o)) visibleOverlays++;
    });

    const loading = document.querySelectorAll(
      '[aria-busy="true"], [class*="loading" i], [class*="spinner" i], [class*="skeleton" i]',
    ).length;

    return {
      href: location.href,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      visibleElements,
      interactive,
      linkLike,
      overlayCount: visibleOverlays,
      loadingIndicators: loading,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
}

export function diffSnapshots(before, after) {
  const parts = [];
  const dVisible = after.visibleElements - before.visibleElements;
  const dInteractive = after.interactive - before.interactive;
  const dLinks = after.linkLike - before.linkLike;
  const dOverlay = after.overlayCount - before.overlayCount;
  const urlChanged =
    before.pathname !== after.pathname ||
    before.search !== after.search ||
    before.hash !== after.hash ||
    before.href !== after.href;

  if (urlChanged) {
    parts.push({
      type: "navigation",
      message: `화면 주소가 변경되었습니다 (${before.pathname} → ${after.pathname})`,
    });
  }
  if (dOverlay > 0) {
    parts.push({
      type: "overlay",
      message: `팝업·모달·바텀시트 등 ${dOverlay}개가 새로 나타났습니다`,
    });
  }
  if (dVisible > 3) {
    parts.push({
      type: "content_reveal",
      message: `새로 보이는 화면 요소가 약 ${dVisible}개 증가했습니다`,
    });
  }
  if (dLinks > 0) {
    parts.push({
      type: "links",
      message: `클릭 가능한 링크·경로가 ${dLinks}개 늘었습니다`,
    });
  }
  if (after.loadingIndicators > before.loadingIndicators) {
    parts.push({
      type: "loading",
      message: "로딩 표시가 나타났습니다 (콘텐츠를 불러오는 중일 수 있음)",
    });
  }
  if (after.scrollHeight > before.scrollHeight + 80) {
    parts.push({
      type: "scroll_growth",
      message: "아래로 스크롤할 콘텐츠가 늘어났습니다",
    });
  }

  return {
    urlChanged,
    deltaVisible: dVisible,
    deltaInteractive: dInteractive,
    deltaLinks: dLinks,
    deltaOverlays: dOverlay,
    changes: parts,
    friendlySummary:
      parts.length > 0
        ? parts.map((p) => p.message).join(" · ")
        : "눈에 띄는 화면 변화는 없었습니다",
  };
}
