/** Non-developer friendly copy for UI issue types. */
export const ISSUE_COPY = {
  horizontal_scroll: {
    title: "가로 스크롤 발생",
    message:
      "화면보다 콘텐츠가 더 넓어 옆으로 밀어야 볼 수 있는 구간이 있습니다.",
    impact:
      "모바일 사용자가 콘텐츠를 놓치거나, 버튼을 잘못 누를 수 있습니다.",
    category: "ux",
    severityDefault: "warn",
  },
  broken_image: {
    title: "이미지 로딩 실패",
    message: "일부 이미지가 깨져 보이거나 표시되지 않습니다.",
    impact: "상품·배너·아이콘이 보이지 않아 신뢰도와 전환율에 영향을 줄 수 있습니다.",
    category: "ux",
    severityDefault: "error",
  },
  overlap: {
    title: "요소 겹침",
    message: "버튼·링크 등이 서로 겹쳐 누르기 어려울 수 있습니다.",
    impact: "터치/클릭이 어려워 주요 기능 이용에 방해가 될 수 있습니다.",
    category: "ux",
    severityDefault: "warn",
  },
  outside_viewport: {
    title: "화면 밖 콘텐츠 가능성",
    message:
      "일부 요소가 화면 밖에 있어 스크롤 없이는 보이지 않을 수 있습니다.",
    impact:
      "중요한 안내·버튼이 첫 화면에서 보이지 않을 수 있습니다. (의도된 캐러셀·숨김 메뉴는 제외)",
    category: "ux",
    severityDefault: "info",
  },
  hidden_overflow: {
    title: "글자 잘림",
    message: "텍스트가 잘려 일부만 보이거나 ‘…’으로 끊길 수 있습니다.",
    impact: "가격·약관·안내 문구를 읽지 못할 수 있습니다.",
    category: "ux",
    severityDefault: "info",
  },
  modal_or_drawer: {
    title: "팝업·모달·드로어",
    message: "클릭 후 추가 화면(팝업·바텀시트 등)이 열렸습니다.",
    impact: "숨겨진 메뉴·쿠폰·동의창 등 실제 이용 흐름에 포함될 수 있습니다.",
    category: "ux",
    severityDefault: "info",
  },
};

export function enrichUiIssue(issue) {
  const copy = ISSUE_COPY[issue.type] || {
    title: issue.type,
    message: issue.message,
    impact: "사용자 경험에 영향을 줄 수 있습니다.",
    category: "ux",
    severityDefault: "info",
  };
  return {
    ...issue,
    title: copy.title,
    friendlyMessage: copy.message,
    userImpact: copy.impact,
    category: copy.category,
    severity: issue.severity || copy.severityDefault,
  };
}
