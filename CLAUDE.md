# PRJ-0009 한글 폰트 제작 보조 — Claude 프로젝트 지침

## 목적
SVG 글리프 폴더를 점검하고 TTF와 견본, 라이선스·상품 설명 초안을 만든다. 글자 디자인은 사람이 한다.

## 작업 규칙
- 한국어, 쉬운 말, 생각의 흐름이 보이게 설명한다.
- 코드를 바꾸면 `python -m pytest -q` 전체 통과(엔진 10건 + API 시험)와 `cd web && npm test`(자동 정리·방향·조합 16건)를 확인한다.
- 마켓 자동 등록·입력은 만들지 않는다. 다른 폰트 윤곽을 변환·복제하는 기능도 만들지 않는다.
- 글자 디자인 품질, OS별 표시, 마켓 심사는 확인할 수 없다고 항상 알린다.
- 라이선스 문구는 초안이다.

## 구조
hangul_font_kit/{charset,svgread,checker,builder,specimen,docs_draft,cli}.py · server/api/main.py(API 서버, Render) · web/(화면, Vercel) · web/components/GlyphEditor.jsx(앱 안 글자 편집기) · web/lib/glyph/{geom,normalize}.js(어떤 SVG든 규칙 모양으로 자동 정리) · web/public/svgedit(SVG-Edit 7.4.2, PC용) · 손글씨: hangul_font_kit/handwrite.py(칸 배치·사진에서 글씨 따내기, OpenCV) + handwrite_template.py(종이 PDF, web/public/handwriting) + web/lib/glyph/hangul.js(자모 조합) + basejamo.js(앱 자체 기초 도안: 고딕 획 뼈대 237조각) + web/components/HandwritingScreen.jsx · 글자 보관: GitHub 비공개 저장소 hangul-font-glyphs · render.yaml · config/font.json · tests/ · docs/ · claude/

## 자주 하는 요청
1. "상대좌표/호 지원" → `svgread.parse_path`
2. "자간 변경" → `config/font.json` 의 advance 값
3. "OTF 추가" → builder 에 CFF 빌드 추가 후 테스트
