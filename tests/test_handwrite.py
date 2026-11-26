"""손글씨 종이: 기울여 찍은 '가짜 손글씨 사진'에서 글씨를 따내는 시험 (한글 글꼴이 있는 곳에서만)"""
import os
import pytest

cv2 = pytest.importorskip("cv2")
import numpy as np
from hangul_font_kit import handwrite as hw

FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
needs_font = pytest.mark.skipif(not os.path.exists(FONT), reason="한글 글꼴 없음")


def test_cells_and_parts():
    cs = hw.cells()
    assert len(cs) == 237 and len({c["key"] for c in cs}) == 237
    keys = {c["key"] for c in cs}
    # 완성형 2,350자 전부 칸 조합으로 만들 수 있어야 함
    from hangul_font_kit.charset import required_chars
    for ch in required_chars():
        p = hw.parts_for(ch)
        if p:
            assert set(p) <= keys, ch


def _fake_photo(page_index, write_cells, tilt=True):
    """종이 그림에 검은 '손글씨'(굵은 글꼴의 자모를 쓸 자리 크기로)를 쓰고, 기울여 찍은 것처럼 만든다"""
    from PIL import ImageDraw, ImageFont
    from hangul_font_kit.handwrite_template import render_pages, mm
    img = render_pages()[page_index]
    d = ImageDraw.Draw(img)
    cells = hw.pages()[page_index]
    for i in write_cells:
        c = cells[i]
        x, y = hw.cell_box(i)
        k = hw.CELL / 1000
        zx1, zy1, zx2, zy2 = hw.ZONES[(c["vt"], c["b"])][c["part"]]
        size = mm(min(zx2 - zx1, zy2 - zy1) * k * 0.95)
        f = ImageFont.truetype(FONT, size, index=1)
        d.text((mm(x + zx1 * k), mm(y + zy1 * k) - size * 0.15), c["jamo"], font=f, fill=(20, 20, 25))
    a = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    h, w = a.shape[:2]
    if tilt:  # 책상 위에 놓고 비스듬히 찍은 것처럼 + 그림자
        canvas = np.full((int(h * 1.25), int(w * 1.25), 3), (90, 100, 110), np.uint8)
        src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        dst = np.float32([[w * .08, h * .05], [w * 1.15, h * .10], [w * 1.12, h * 1.20], [w * .12, h * 1.14]])
        M = cv2.getPerspectiveTransform(src, dst)
        cv2.warpPerspective(a, M, (canvas.shape[1], canvas.shape[0]), dst=canvas, borderMode=cv2.BORDER_TRANSPARENT)
        grad = np.linspace(0.75, 1.0, canvas.shape[1])[None, :, None]
        a = np.clip(canvas * grad, 0, 255).astype(np.uint8)
        a = cv2.GaussianBlur(a, (3, 3), 0)
    return a


@needs_font
def test_extract_tilted_photo():
    write = [0, 1, 2, 7, 13, 20, 41]
    photo = _fake_photo(1, write)
    r = hw.extract_page(photo)
    assert r["page"] == 1
    st = {i: c["status"] for i, c in enumerate(r["cells"])}
    for i in write:
        assert st[i] == "ok", (i, r["cells"][i]["jamo"], st[i])
    others = [i for i in st if i not in write]
    assert all(st[i] == "empty" for i in others), [(i, st[i]) for i in others if st[i] != "empty"]
    # 따낸 모양이 쓸 자리 근처에 있는지 (자리 밖으로 크게 벗어나지 않음)
    import re
    c = r["cells"][0]
    xs = [float(v) for v in re.findall(r"[ML](-?[\d.]+) ", c["d"])]
    zx1, _, zx2, _ = hw.ZONES[(hw.pages()[1][0]["vt"], hw.pages()[1][0]["b"])][hw.pages()[1][0]["part"]]
    assert min(xs) > zx1 - 60 and max(xs) < zx2 + 60


@needs_font
def test_blank_page_and_not_a_page():
    r = hw.extract_page(_fake_photo(0, [], tilt=False))
    assert r["page"] == 0 and all(c["status"] == "empty" for c in r["cells"])
    with pytest.raises(hw.PhotoError):
        hw.extract_page(np.full((800, 600, 3), 255, np.uint8))


@needs_font
def test_api_extract():
    from fastapi.testclient import TestClient
    from server.api.main import app
    c = TestClient(app)
    assert c.get("/api/v1/handwriting/layout").json()["count"] == 237
    ok, buf = cv2.imencode(".jpg", _fake_photo(0, [0, 5, 20]), [cv2.IMWRITE_JPEG_QUALITY, 85])
    r = c.post("/api/v1/handwriting/extract", files={"file": ("p.jpg", buf.tobytes(), "image/jpeg")})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["page"] == 0 and j["counts"]["ok"] == 3
    bad = c.post("/api/v1/handwriting/extract", files={"file": ("x.jpg", b"not an image", "image/jpeg")})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "VALIDATION_ERROR"
