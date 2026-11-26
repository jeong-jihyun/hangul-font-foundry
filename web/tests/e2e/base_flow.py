"""기초 도안 흐름: 새 폰트 → 홈 '기초 도안으로 채우기' → 2,350자 조합·검수·저장 → 폰트 만들기(TTF 2,350자)
→ 글자 탭에서 '가'를 직접 고친 뒤 다시 조합해도 '가'는 그대로"""
import io, json, os, sys, tempfile, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3000")
MOCK = os.environ.get("MOCK", "http://localhost:9100")
OUT = os.environ.get("SHOTS") or tempfile.mkdtemp(); os.makedirs(OUT, exist_ok=True)
ok, bad = [], []
def check(name, cond, info=""):
    (ok if cond else bad).append(name); print(("✓ " if cond else "✕ ") + name + (f"  [{info}]" if info else ""), flush=True)
def gh(): return json.load(urllib.request.urlopen(MOCK + "/_log"))
def wait_toast(pg, words, n=90):
    for _ in range(n):
        pg.wait_for_timeout(1000); t = pg.locator(".toast").inner_text()
        if any(w in t for w in words): return t
    return pg.locator(".toast").inner_text()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"))
    ctx = b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(BASE); pg.wait_for_timeout(2000)
    pg.locator(".projbar.slim").click(); pg.fill("input[aria-label='비밀번호(PIN)']", os.environ.get("PIN", "123456")); pg.locator(".pinform button").click(); pg.wait_for_timeout(3000)
    pg.locator(".projbtn").click(); pg.locator("button", has_text="새 폰트").first.click()
    pg.fill("#projName", "도안체"); pg.locator(".projform .btn", has_text="만들기").click(); pg.wait_for_timeout(2500)
    pg.goto(BASE + "/#home"); pg.wait_for_timeout(2500)
    check("홈 첫 버튼 = 기초 도안", "기초 도안으로 채우기" in pg.locator(".hero").inner_text())
    pg.locator(".hero .btn", has_text="기초 도안으로 채우기").click()
    t = wait_toast(pg, ["만들어 넣었어요", "못"])
    check("기초 도안 2,350자 넣기", "2,350자를 만들어 넣었어요" in t, t)
    pg.wait_for_timeout(15000)  # GitHub 저장(합치기) 끝날 때까지
    files = gh()["files"]
    check("GitHub 조각 237개", len([f for f in files if "/jamo/" in f]) == 237)
    check("GitHub 글자 2,350개", len([f for f in files if "/glyphs/" in f]) >= 2350, len([f for f in files if "/glyphs/" in f]))
    pg.locator("#handwriting .card", has_text="2,350자 조합").screenshot(path=os.path.join(OUT, "base-compose.png"))
    # 글자 탭: 가 를 직접 고치기 (사각형 하나로 바꿈)
    pg.goto(BASE + "/#glyphs"); pg.wait_for_timeout(3000)
    pg.fill("input.search", "가"); pg.wait_for_timeout(500); pg.locator(".glyph-cell").first.click()
    pg.screenshot(path=os.path.join(OUT, "base-glyphs.png"))
    pg.locator("button", has_text="이 글자 고치기").first.click(); pg.wait_for_timeout(2500)
    check("편집기에 기초 도안 '가'", pg.locator(".ed-shape").count() >= 3, pg.locator(".ed-shape").count())
    pg.locator(".ed-actions button", has_text="더 보기").click(); pg.locator(".ed-morelist button", has_text="모두 지우기").click()
    pg.locator(".ed-tools button", has_text="사각형").click()
    G = lambda x, y: pg.evaluate(f"() => {{ const s=document.querySelector('.ed-canvas'); const p=s.createSVGPoint(); p.x={x}; p.y={y}; const q=p.matrixTransform(s.getScreenCTM()); return [q.x,q.y]; }}")
    pg.mouse.move(*G(300, 200)); pg.mouse.down(); pg.mouse.move(*G(700, 700), steps=5); pg.mouse.up()
    pg.locator(".ed-top .btn").click(); t = wait_toast(pg, ["저장"], 20)
    pg.get_by_role("button", name="닫기").first.click(); pg.wait_for_timeout(1500)
    # 다시 조합해도 가 는 그대로
    pg.goto(BASE + "/#handwriting"); pg.wait_for_timeout(3000)
    pg.locator("button", has_text="폰트 글자로 넣기").click()
    t = wait_toast(pg, ["만들어 넣었어요", "못"])
    check("다시 조합: 직접 고친 1자 보존", "직접 고친 1자는 그대로" in t, t)
    pg.wait_for_timeout(12000)
    # 폰트 만들기
    pg.goto(BASE + "/#build"); pg.wait_for_timeout(2500)
    pg.locator("#build button", has_text="폰트 만들기 (").first.click()
    for _ in range(90):
        pg.wait_for_timeout(2000)
        if "폰트 파일 받기" in pg.locator("#build").inner_text(): break
    href = pg.locator("a", has_text="폰트 파일 받기").first.get_attribute("href")
    from fontTools.ttLib import TTFont
    data = urllib.request.urlopen(href).read(); open(os.path.join(OUT, "base.ttf"), "wb").write(data)
    f = TTFont(io.BytesIO(data)); n = len([c for c in f.getBestCmap() if 0xAC00 <= c <= 0xD7A3])
    check("TTF 한글 2,350자", n == 2350, n)
    check("가 = 직접 고친 사각형(윤곽 1개)", f["glyf"]["uniAC00"].numberOfContours == 1, f["glyf"]["uniAC00"].numberOfContours)
    pg.locator("#build").screenshot(path=os.path.join(OUT, "base-build.png"))
    check("화면 오류 없음", not errs, errs[:2])
print(f"\n통과 {len(ok)} · 실패 {len(bad)}  (화면: {OUT})")
sys.exit(1 if bad else 0)
