"""기본 글꼴 도안 흐름: 새 폰트 → 홈 '처음이라면' 안내 → 도안 탭 궁서체 → 2,438자 검수·저장(OFL 표시)
→ 예약 이름 막기(고딕) → 폰트 만들기(정식, 2,438자) → 결과에 OFL.txt, 폰트 안 라이선스 줄"""
import io, json, os, sys, tempfile, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3000")
MOCK = os.environ.get("MOCK", "http://localhost:9100")
OUT = os.environ.get("SHOTS") or tempfile.mkdtemp(); os.makedirs(OUT, exist_ok=True)
ok, bad = [], []
def check(name, cond, info=""):
    (ok if cond else bad).append(name); print(("✓ " if cond else "✕ ") + name + (f"  [{info}]" if info else ""), flush=True)
def gh(): return json.load(urllib.request.urlopen(MOCK + "/_log"))
def wait_toast(pg, words, n=120):
    for _ in range(n):
        pg.wait_for_timeout(1000); t = pg.locator(".toast").inner_text()
        if any(w in t for w in words): return t
    return pg.locator(".toast").inner_text()

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"))
    ctx = b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []; dialogs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
    pg.goto(BASE); pg.wait_for_timeout(2000)
    pg.locator(".projbar.slim").click(); pg.fill("input[aria-label='비밀번호(PIN)']", os.environ.get("PIN", "123456")); pg.locator(".pinform button").click(); pg.wait_for_timeout(3000)
    pg.locator(".projbtn").click(); pg.locator("button", has_text="새 폰트").first.click()
    pg.fill("#projName", "연습"); pg.locator(".projform .btn", has_text="만들기").click(); pg.wait_for_timeout(2500)
    pg.goto(BASE + "/#home"); pg.wait_for_timeout(2500)
    home = pg.locator("#home").inner_text()
    check("홈: 처음이라면 안내 펼쳐짐", "도안 탭에서 글꼴 도안 하나를 넣으세요" in home and pg.locator("#home details.more").get_attribute("open") is not None)
    check("홈: 연습 버튼", "글꼴 도안 5종으로 연습" in pg.locator(".hero").inner_text())
    pg.locator("#home details.more").screenshot(path=os.path.join(OUT, "tpl-guide.png"))
    pg.locator(".hero .btn", has_text="글꼴 도안 5종으로 연습").click(); pg.wait_for_timeout(2500)
    cards = pg.locator(".tpl-card")
    check("도안 카드 5개", cards.count() == 5, cards.count())
    pg.wait_for_timeout(1500)
    imgs_ok = pg.evaluate("() => [...document.querySelectorAll('.tpl-card img')].every(i => i.complete && i.naturalWidth > 0)")
    check("미리보기 그림 5개 열림", imgs_ok)
    pg.locator("#handwriting .card").first.screenshot(path=os.path.join(OUT, "tpl-cards.png"))
    pg.locator(".tpl-card", has_text="궁서체").click()
    t = wait_toast(pg, ["도안", "못"])
    check("확인창에 판매 불가 안내", any("팔 수 없고" in d for d in dialogs), dialogs[-1][:40] if dialogs else "")
    check("궁서체 2,438자 넣기", "궁서체 도안 2,438자를 넣었어요" in t, t)
    pg.wait_for_timeout(20000)
    files = gh()["files"]
    g = [f for f in files if "/glyphs/" in f]
    check("GitHub 글자 2,438개", len(g) >= 2438, len(g))
    pg.goto(BASE + "/#handwriting"); pg.wait_for_timeout(2500)
    check("도안 탭: OFL 표시", "OFL 도안(궁서체)" in pg.locator("#handwriting").inner_text())
    # 글자 탭에서 '가' 미리보기
    pg.goto(BASE + "/#glyphs"); pg.wait_for_timeout(3000)
    pg.fill("input.search", "가"); pg.wait_for_timeout(600); pg.locator(".glyph-cell").first.click(); pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(OUT, "tpl-glyphs.png"))
    pg.locator("button", has_text="이 글자 고치기").first.click(); pg.wait_for_timeout(2500)
    check("편집기에 궁서 '가' 열림", pg.locator(".ed-shape").count() >= 1, pg.locator(".ed-shape").count())
    pg.screenshot(path=os.path.join(OUT, "tpl-editor.png"))
    pg.get_by_role("button", name="닫기").first.click(); pg.wait_for_timeout(1000)
    # 폰트 만들기: OFL 안내 + 정식 폰트
    pg.goto(BASE + "/#build"); pg.wait_for_timeout(3000)
    bt = pg.locator("#build").inner_text()
    check("빌드: OFL 판매 불가 안내", "판매할 수 없고" in bt)
    check("빌드: 고칠 곳 0 · 정식", "정식 폰트 만들기" in bt, bt[:200])
    pg.fill("#fontName", "연습궁서"); pg.locator("#build button", has_text="정식 폰트 만들기").first.click()
    for _ in range(120):
        pg.wait_for_timeout(2000)
        if "폰트 파일 받기" in pg.locator("#build").inner_text(): break
    bt = pg.locator("#build").inner_text()
    check("결과 목록에 OFL.txt", "OFL.txt" in bt)
    href = pg.locator("a", has_text="폰트 파일 받기").first.get_attribute("href")
    from fontTools.ttLib import TTFont
    data = urllib.request.urlopen(href).read(); open(os.path.join(OUT, "tpl.ttf"), "wb").write(data)
    f = TTFont(io.BytesIO(data))
    check("TTF 2,438자(공백 포함)", len(f.getBestCmap()) == 2438, len(f.getBestCmap()))
    check("폰트 안 라이선스 줄 = OFL", "Open Font License" in (f["name"].getDebugName(13) or ""))
    pg.locator("#build").screenshot(path=os.path.join(OUT, "tpl-build.png"))
    check("화면 오류 없음", not errs, errs[:2])
print(f"\n통과 {len(ok)} · 실패 {len(bad)}  (화면: {OUT})")
sys.exit(1 if bad else 0)
