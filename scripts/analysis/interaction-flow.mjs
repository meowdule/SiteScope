/**
 * Build a text interaction flow tree from exploration events.
 */

export function createFlowRoot(pageLabel = "Home") {
  return { label: pageLabel, children: [] };
}

export function addInteractionNode(root, interaction) {
  if (!interaction.success && interaction.action === "no_visible_change") {
    return null;
  }

  const node = {
    label: formatInteractionLabel(interaction),
    children: [],
  };

  for (const effect of buildEffectChildren(interaction)) {
    node.children.push({ label: effect, children: [] });
  }

  root.children.push(node);
  return node;
}

function formatInteractionLabel(ev) {
  const hint =
    ev.targetHint && ev.targetHint !== "generic" ? ` [${ev.targetHint}]` : "";
  const actionLabels = {
    navigation: "이동",
    overlay: "팝업·시트",
    content_reveal: "콘텐츠 노출",
    async_load: "데이터 로드",
    tab_change: "탭 전환",
    accordion: "펼침",
    carousel: "슬라이드",
    scroll_reveal: "스크롤 노출",
    initial_scan: "초기 스캔",
  };
  const act = actionLabels[ev.action] || "클릭";
  return `${ev.label}${hint} — ${act}`;
}

function buildEffectChildren(ev) {
  const out = [];
  if (ev.spaNavigation) out.push(`SPA 경로 변경 (${ev.spaNavigation})`);
  if (ev.urlBefore && ev.urlAfter && ev.urlBefore !== ev.urlAfter) {
    try {
      const path = new URL(ev.urlAfter).pathname;
      out.push(`경로 → ${path}`);
    } catch {
      out.push("화면 주소 변경");
    }
  }
  if (ev.domDiff && ev.domDiff !== "눈에 띄는 화면 변화는 없었습니다") {
    out.push(ev.domDiff);
  }
  if (ev.networkSummary) out.push(ev.networkSummary);
  if (ev.domDelta?.visible > 3) {
    out.push(`보이는 요소 +${ev.domDelta.visible}`);
  }
  if (ev.newLinks > 0) out.push(`새 경로 +${ev.newLinks}`);
  return out;
}

export function formatFlowTree(root) {
  const lines = [root.label];
  formatChildren(root.children, "", lines);
  return lines.join("\n");
}

function formatChildren(children, prefix, lines) {
  const last = children.length - 1;
  children.forEach((child, i) => {
    const branch = i === last ? "└─ " : "├─ ";
    const nextPrefix = i === last ? prefix + "   " : prefix + "│  ";
    lines.push(`${prefix}${branch}${child.label}`);
    if (child.children?.length) {
      formatChildren(child.children, nextPrefix, lines);
    }
  });
}
