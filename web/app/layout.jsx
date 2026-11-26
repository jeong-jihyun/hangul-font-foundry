import "./globals.css";

export const metadata = {
  title: "글리프룸 — 손글씨 한글 폰트",
  description: "손글씨 종이 사진으로 한글 폰트 2,350자를 만드는 도구",
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
