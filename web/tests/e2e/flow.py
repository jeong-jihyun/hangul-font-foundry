"""Glyphroom 전체 흐름 시험 (폰 크기 브라우저). README.md 의 방법으로 로컬 서버 3개를 띄운 뒤 실행.
잠금 → 새 폰트 → 홈 '가 그리기' → 편집기로 그려 저장 → 다음 글자 → zip 올리기(자동 정리) → 검수
→ 글자 너비 바꿔 폰트 만들기 → TTF 확인 → 다른 기기에서 저장된 글자로 다시 검수 → 비밀번호 잠금"""
import io, json, os, sys, tempfile, urllib.request, zipfile
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:3000")
MOCK = os.environ.get("MOCK", "http://localhost:9100")
PIN = os.environ.get("PIN", "123456")
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
OUT = os.environ.get("SHOTS") or tempfile.mkdtemp()
os.makedirs(OUT, exist_ok=True)
ok, bad = [], []
def check(name, cond, info=""):
    (ok if cond else bad).append(name); print(("✓ " if cond else "✕ ") + name + (f"  [{info}]" if info else ""), flush=True)
def gh(): return json.load(urllib.request.urlopen(MOCK + "/_log"))
def G(pg, x, y):
    return pg.evaluate(f"() => {{ const s=document.querySelector('.ed-canvas'); const p=s.createSVGPoint(); p.x={x}; p.y={y}; const q=p.matrixTransform(s.getScreenCTM()); return [q.x,q.y]; }}")
def drag(pg, a, b):
    pg.mouse.move(*G(pg, *a)); pg.mouse.down(); pg.mouse.move(*G(pg, *b), steps=6); pg.mouse.up(); pg.wait_for_timeout(200)

# 일러스트레이터식 zip (크기 200, 그룹 변형, 상대좌표)
zbuf = io.BytesIO()
with zipfile.ZipFile(zbuf, "w") as z:
    z.writestr("font/U+B098.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g transform="translate(20 20)"><path d="m10 10h40v120h80v20h-120z"/></g></svg>')
    z.writestr("font/U+B2E4.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect x="100" y="100" width="500" height="80"/><circle cx="500" cy="500" r="150"/></svg>')
zpath = os.path.join(OUT, "illust.zip"); open(zpath, "wb").write(zbuf.getvalue())

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE); pg.wait_for_timeout(2500)
    check("잠금 막대 한 줄", pg.locator(".projbar.slim").count() == 1)
    pg.locator(".projbar.slim").click(); pg.fill("input[aria-label='비밀번호(PIN)']", PIN); pg.locator(".pinform button").click(); pg.wait_for_timeout(2500)
    check("비밀번호로 열림", "작업 중인 폰트" in pg.locator(".projbar").first.inner_text())
    # 새 폰트
    pg.locator(".projbtn").click(); pg.locator("button", has_text="새 폰트").first.click()
    pg.fill("#projName", "시험체"); pg.locator(".projform .btn", has_text="만들기").click(); pg.wait_for_timeout(2500)
    check("새 폰트 만들기", "시험체" in pg.locator(".projbar").first.inner_text())
    check("GitHub 폴더 생성", any("새 폰트: 시험체" in m for m in gh()["msgs"]))
    # 홈 → '가' 그리기
    pg.goto(BASE + "/#glyphs"); pg.wait_for_timeout(3000)
    pg.fill("input.search", "가"); pg.wait_for_timeout(400); pg.locator(".glyph-cell").first.click()
    pg.locator("button", has_text="이 글자 그리기").first.click(); pg.wait_for_timeout(3000)
    check("글자 탭에서 편집기 열기", pg.locator(".editor").count() == 1 and "가" in pg.locator(".ed-title").inner_text())
    pg.locator(".ed-tools button", has_text="사각형").click(); drag(pg, (150, 200), (300, 780))
    pg.locator(".ed-tools button", has_text="원").click(); drag(pg, (450, 250), (850, 650)); drag(pg, (570, 370), (730, 530))
    pg.locator(".ed-tools button", has_text="펜").click()
    for x, y in [(400, 700), (900, 700)]: pg.mouse.click(*G(pg, x, y)); pg.wait_for_timeout(120)
    pg.mouse.move(*G(pg, 650, 790)); pg.mouse.down(); pg.mouse.move(*G(pg, 550, 800), steps=4); pg.mouse.up()
    pg.mouse.click(*G(pg, 400, 700)); pg.wait_for_timeout(300)
    check("도형 4개 그리기", pg.locator(".ed-shape").count() == 4, pg.locator(".ed-shape").count())
    pg.screenshot(path=os.path.join(OUT, "1-draw.png"))
    pg.locator(".ed-top .btn").click(); pg.wait_for_timeout(6000)
    check("저장 → GitHub", any(f.endswith("/glyphs/U+AC00.svg") for f in gh()["files"]))
    check("저장됨 표시", "저장됨" in pg.locator(".ed-top").inner_text())
    pg.get_by_role("button", name="다음 글자").click(); pg.wait_for_timeout(1500)
    check("다음 글자(각)", "각" in pg.locator(".ed-title").inner_text())
    pg.locator(".ed-tools button", has_text="사각형").click(); drag(pg, (200, 200), (700, 300)); drag(pg, (600, 200), (700, 780))
    pg.keyboard.press("Control+s"); pg.wait_for_timeout(5000)
    check("Ctrl+S 저장(각)", any(f.endswith("/glyphs/U+AC01.svg") for f in gh()["files"]))
    pg.get_by_role("button", name="닫기").first.click(); pg.wait_for_timeout(500)
    # zip 올리기 (자동 정리)
    pg.goto(BASE + "/#check"); pg.wait_for_timeout(1500)
    pg.set_input_files("#zipInput", zpath); pg.wait_for_timeout(1500)
    tidy = pg.locator("#check").inner_text()
    check("zip 자동 정리 안내", "자동 정리" in tidy)
    pg.locator("#check button", has_text="검수 실행 ↗").click(); pg.wait_for_timeout(9000)
    t = pg.locator("#check").inner_text()
    check("검수 오류 0", "오류 0" in t or "고칠 곳" not in t, t[t.find("검수 결과"):t.find("검수 결과") + 80].replace("\n", " "))
    # 폰트 만들기 (너비 1100)
    pg.goto(BASE + "/#build"); pg.wait_for_timeout(1500)
    pg.locator("summary", has_text="글자 너비").click(); pg.fill("#advanceHangul", "1100")
    pg.locator("button", has_text="시험용 폰트 만들기").first.click()
    for _ in range(40):
        pg.wait_for_timeout(1500)
        if "폰트 파일 받기" in pg.locator("#build").inner_text(): break
    href = pg.locator("a", has_text="폰트 파일 받기").first.get_attribute("href")
    from fontTools.ttLib import TTFont
    f = TTFont(io.BytesIO(urllib.request.urlopen(href).read()))
    chars = sorted(chr(c) for c in f.getBestCmap())
    check("TTF 글자", set("가각나다") <= set(chars), "".join(chars))
    check("글자 너비 1100 반영", f["hmtx"]["uniAC00"][0] == 1100)
    check("가 윤곽 4개", f["glyf"]["uniAC00"].numberOfContours == 4)
    pg.screenshot(path=os.path.join(OUT, "2-build.png"))
    state = ctx.storage_state()
    # 다른 기기: 이 기기 기억 없이 저장된 글자로
    ctx2 = b.new_context(viewport={"width": 412, "height": 915}, is_mobile=True, has_touch=True, storage_state=state)
    p2 = ctx2.new_page(); p2.goto(BASE + "/#check"); p2.wait_for_timeout(800); p2.evaluate("localStorage.clear(); sessionStorage.clear()")
    p2.reload(); p2.wait_for_timeout(3500)
    p2.locator(".projbtn").click(); p2.locator(".projitem", has_text="시험체").click(); p2.wait_for_timeout(1500)
    check("다른 기기: 저장된 글자 사용 표시", "저장된 글자" in p2.locator("#check").inner_text())
    p2.locator("#check button", has_text="검수 실행 ↗").click(); p2.wait_for_timeout(8000)
    t2 = p2.locator("#check").inner_text()
    check("다른 기기: 4자 준비", "4자 준비" in t2, t2[t2.find("필수"):t2.find("필수") + 40].replace("\n", " "))
    # 비밀번호 잠금 (마지막: 이 컴퓨터 IP 를 15분 잠금)
    ctx3 = b.new_context(viewport={"width": 412, "height": 915}); p3 = ctx3.new_page(); p3.goto(BASE); p3.wait_for_timeout(1500)
    codes = [p3.evaluate("async () => (await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'000000'})})).status") for _ in range(11)]
    check("10번 틀리면 잠김(429)", codes[-1] == 429, codes)
    check("화면 오류 없음", not errs, errs[:2])
print(f"\n통과 {len(ok)} · 실패 {len(bad)}  (화면: {OUT})")
sys.exit(1 if bad else 0)
