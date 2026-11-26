"""손글씨 흐름 시험: 가짜 손글씨 사진(기울임·그림자) 1장 → 따내기 → 192자 조합 → 폰트 글자로 넣기 → TTF
실행 방법은 README.md (서버 3개를 띄운 뒤). 한글 글꼴(Noto Sans CJK)이 있어야 가짜 사진을 만들 수 있음."""
import io, json, os, sys, tempfile, urllib.request
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "tests"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
import cv2
from test_handwrite import _fake_photo
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3000")
MOCK = os.environ.get("MOCK", "http://localhost:9100")
OUT = os.environ.get("SHOTS") or tempfile.mkdtemp(); os.makedirs(OUT, exist_ok=True)
ok, bad = [], []
def check(name, cond, info=""):
    (ok if cond else bad).append(name); print(("✓ " if cond else "✕ ") + name + (f"  [{info}]" if info else ""), flush=True)

photo = os.path.join(OUT, "page1.jpg")
cv2.imwrite(photo, _fake_photo(0, list(range(42))), [cv2.IMWRITE_JPEG_QUALITY, 85])

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"))
    ctx = b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_timeout(2000)
    pg.locator(".projbar.slim").click(); pg.fill("input[aria-label='비밀번호(PIN)']", os.environ.get("PIN", "123456")); pg.locator(".pinform button").click(); pg.wait_for_timeout(2500)
    pg.locator(".mobilebar button", has_text="도안").click(); pg.wait_for_timeout(3500)
    check("도안·손글씨 탭 열림", "도안·손글씨" in pg.locator("#handwriting").inner_text())
    check("종이 PDF 링크", urllib.request.urlopen(BASE + "/handwriting/glyphroom-handwriting.pdf").status == 200)
    pg.locator("#handwriting input[type=file]").set_input_files(photo)
    for _ in range(40):
        pg.wait_for_timeout(1500)
        if "읽는 중" not in pg.locator("#handwriting").inner_text() and "저장 중" not in pg.locator("#handwriting").inner_text(): break
    pg.wait_for_timeout(1000)
    t = pg.locator("#handwriting").inner_text()
    check("1장 42칸 따냄", "42/42" in t, t[t.find("조각 보기"):t.find("조각 보기") + 40].replace("\n", " "))
    jam = [f for f in json.load(urllib.request.urlopen(MOCK + "/_log"))["files"] if "/jamo/" in f]
    check("GitHub에 조각 저장", len(jam) == 42, len(jam))
    comp = pg.locator("#handwriting .card", has_text="2,350자 조합"); chip = comp.locator(".chip").inner_text()
    check("조합 가능 192자", "192" in chip, chip)
    comp.screenshot(path=os.path.join(OUT, "hw-compose.png"))
    pg.locator("#handwriting .card", has_text="조각 보기").screenshot(path=os.path.join(OUT, "hw-cells.png"))
    pg.locator("button", has_text="폰트 글자로 넣기").click()
    for _ in range(60):
        pg.wait_for_timeout(1500)
        if "만들어 넣었어요" in pg.locator(".toast").inner_text() or "못" in pg.locator(".toast").inner_text(): break
    check("조합 글자 넣기", "만들어 넣었어요" in pg.locator(".toast").inner_text(), pg.locator(".toast").inner_text())
    pg.wait_for_timeout(6000)
    pg.locator(".mobilebar button", has_text="빌드").click(); pg.wait_for_timeout(2000)
    pg.locator("button", has_text="시험용 폰트 만들기").first.click()
    for _ in range(60):
        pg.wait_for_timeout(1500)
        if "폰트 파일 받기" in pg.locator("#build").inner_text(): break
    href = pg.locator("a", has_text="폰트 파일 받기").first.get_attribute("href")
    from fontTools.ttLib import TTFont
    data = urllib.request.urlopen(href).read(); open(os.path.join(OUT, "hand.ttf"), "wb").write(data)
    f = TTFont(io.BytesIO(data)); n = len([c for c in f.getBestCmap() if 0xAC00 <= c <= 0xD7A3])
    check("TTF 한글 192자", n == 192, n)
    pg.locator("#build").screenshot(path=os.path.join(OUT, "hw-build.png"))
    check("화면 오류 없음", not errs, errs[:2])
print(f"\n통과 {len(ok)} · 실패 {len(bad)}  (화면: {OUT})")
sys.exit(1 if bad else 0)
