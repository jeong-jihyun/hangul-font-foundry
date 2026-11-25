// 화면 목록 (데스크톱 좌측 메뉴 · 모바일 하단 탭 공용)
export const TABS = [
  { id: "home", ico: "⌂", label: "Overview", short: "홈" },
  { id: "glyphs", ico: "▦", label: "Glyph library", short: "글리프" },
  { id: "check", ico: "✓", label: "Quality check", short: "검수" },
  { id: "build", ico: "↗", label: "Font export", short: "빌드" },
  { id: "settings", ico: "⚙", label: "Settings", short: "설정" },
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
