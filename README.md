# Glyphroom — 한글 폰트 제작 보조 (PRJ-0009, v1.0)

글자 디자인은 사람이 합니다. 이 앱은 그 밖의 반복 작업을 맡습니다.

- **앱**: https://hangul-font-foundry.vercel.app (폰·PC)
- **엔진 API**: https://hangul-font-foundry-api.onrender.com/api/v1/health (Render 무료, 처음 접속 시 30초~1분 깨우는 시간)
- **사용 설명서**: [docs/사용설명서.md](docs/사용설명서.md)

## 무엇을 하나
| 단계 | 하는 일 |
|---|---|
| 글자 그리기 | 앱 안 편집기(펜·곡선·사각형·원·점 추가·숫자 좌표·격자·밑그림·확대·되돌리기). PC는 SVG-Edit로도 열기 |
| 자동 정리 | 일러스트레이터·Inkscape·SVG-Edit 파일의 그룹·변형·상대좌표·호·원·크기 차이를 규칙 모양으로 |
| 저장 | 비밀번호(PIN)로 잠금. 폰트마다 GitHub 비공개 저장소 `hangul-font-glyphs` 폴더에 저장(저장할 때마다 기록) |
| 검수 | 빠진 글자, 파일명(`U+AC00.svg`), 1000×1000 틀 이탈, 열린 경로 등 |
| 폰트 만들기 | TTF + 견본 그림·PDF + 상품·라이선스 초안. 폰트마다 이름·글자 너비 저장 |

마켓 입점·심사·등록은 하지 않습니다. 다른 폰트 윤곽을 변환·복제하는 기능도 없습니다.

## 구조
- `hangul_font_kit/` 엔진(fontTools) · `server/api/` FastAPI(Render, `render.yaml`)
- `web/` Next.js 화면(Vercel) · `web/components/GlyphEditor.jsx` 편집기 · `web/lib/glyph/` 자동 정리 · `web/public/svgedit` SVG-Edit 7.4.2
- 환경 변수(Vercel): `APP_PIN`, `SESSION_SECRET`, `GITHUB_TOKEN`(hangul-font-glyphs 저장소 Contents 읽기·쓰기 전용), 선택 `GLYPH_REPO`

## 시험
```
python -m pytest -q          # 엔진·API 29건
cd web && npm test           # 자동 정리·방향 12건
```
브라우저 전체 흐름 시험(폰 크기): `web/tests/e2e/README.md`

## 엔진만 명령줄로
```
python -m hangul_font_kit charset --out chars.csv
python -m hangul_font_kit check --glyphs ./glyphs
python -m hangul_font_kit build --glyphs ./glyphs --out ./font_out
```
명령줄 엔진은 절대좌표 경로만 읽습니다(앱은 올리기 전에 자동 정리).

## 알려진 한계 (솔직하게)
- 글자 디자인 품질, 윈도우·맥 표시, 마켓 심사 기준은 이 도구가 확인할 수 없습니다.
- TTF만 만듭니다(OTF·힌팅·커닝 없음). 겹친 획은 합치지 않고 그대로 둡니다(대부분의 프로그램에서 정상 표시).
- 무료 서버라 만든 파일은 6시간 보관, 처음 접속 시 깨우는 시간이 있습니다.
- 비밀번호 잠금은 1인용 간단 잠금입니다(10번 틀리면 15분 잠김).
- 라이선스·상품 문구는 초안입니다. 공개 전 전문가 확인이 필요합니다.
