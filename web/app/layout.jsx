import "./globals.css";

export const metadata = {
  title: "Glyphroom — Hangul Font Studio",
  description: "한글 폰트 제작 보조 도구 — 문자 세트, SVG 검수, 폰트 빌드",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f3ef",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
