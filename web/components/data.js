// 화면 목록 (데스크톱 좌측 메뉴 · 모바일 하단 탭 공용)
export const TABS = [
  { id: "home", ico: "⌂", label: "홈", short: "홈" },
  { id: "handwriting", ico: "✎", label: "손글씨로 만들기", short: "손글씨" },
  { id: "glyphs", ico: "▦", label: "글자 목록", short: "글자" },
  { id: "check", ico: "✓", label: "검수", short: "검수" },
  { id: "build", ico: "↗", label: "폰트 만들기", short: "빌드" },
  { id: "settings", ico: "⚙", label: "설정", short: "설정" },
];

// 1단계는 시안과 같은 샘플 12자 (4단계에서 실제 2,350자 목록으로 교체)
export const SAMPLE_GLYPHS = [
  ["가", "U+AC00", 1], ["각", "U+AC01", 1], ["간", "U+AC04", 1], ["갇", "U+AC07", 0],
  ["갈", "U+AC08", 0], ["감", "U+AC10", 1], ["갑", "U+AC11", 0], ["강", "U+AC15", 1],
  ["개", "U+AC1C", 0], ["거", "U+AC70", 1], ["고", "U+ACE0", 0], ["나", "U+B098", 1],
];

export const SETTINGS_KEY = "glyphroom-settings";
export const DEFAULT_SETTINGS = {
  name: "My Hangul Font",
  spacing: "0",
  preview: "가나다라마바사 아자차카타파하",
};
