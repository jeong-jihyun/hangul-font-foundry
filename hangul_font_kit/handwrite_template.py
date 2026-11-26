"""손글씨 종이(PDF) 그리기. 개발할 때 한 번 만들어 web/public 에 넣는다 (서버에는 한글 글꼴이 없어도 됨).
글자 이름표에만 무료 글꼴(Noto Sans CJK, OFL)을 쓰고, 칸 안에는 다른 폰트의 글자 모양을 그리지 않는다.
실행: python -m hangul_font_kit.handwrite_template web/public/handwriting/glyphroom-handwriting.pdf"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

from . import handwrite as hw

DPI = 200
PX = DPI / 25.4  # mm → px
BLUE = (120, 170, 235)        # 걸러지는 안내선 색
BLUE_DARK = (70, 130, 220)    # 쓸 자리 (조금 진하게, 그래도 파란색)
INK = (0, 0, 0)
LABEL = (90, 90, 90)
FONT_CANDIDATES = ["/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]


def _font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size, index=1)  # 1 = 한국어(KR)
    raise FileNotFoundError("한글 글꼴(Noto Sans CJK)이 필요합니다.")


def _dashed_rect(d, box, color, width, dash):
    x1, y1, x2, y2 = box
    for (a, b, c, e) in [(x1, y1, x2, y1), (x2, y1, x2, y2), (x2, y2, x1, y2), (x1, y2, x1, y1)]:
        length = ((c - a) ** 2 + (e - b) ** 2) ** 0.5
        n = max(1, int(length / (dash * 2)))
        for k in range(n):
            t1, t2 = k / n, (k + 0.5) / n
            d.line([(a + (c - a) * t1, b + (e - b) * t1), (a + (c - a) * t2, b + (e - b) * t2)], fill=color, width=width)


def mm(v):
    return int(round(v * PX))


def render_pages():
    pages = hw.pages()
    f_title, f_small, f_label, f_zone = _font(mm(4.2)), _font(mm(2.6)), _font(mm(2.7)), _font(mm(3.2))
    out = []
    for pi, cells in enumerate(pages):
        img = Image.new("RGB", (mm(hw.PAGE_W), mm(hw.PAGE_H)), "white")
        d = ImageDraw.Draw(img)
        # 귀퉁이 표시
        for cx, cy in hw.marker_centers():
            s = hw.MARK / 2
            d.rectangle([mm(cx - s), mm(cy - s), mm(cx + s), mm(cy + s)], fill=INK)
        # 장 번호 (1부터)
        for k, (x, y, s) in enumerate(hw.code_boxes()):
            if (pi + 1) >> k & 1:
                d.rectangle([mm(x), mm(y), mm(x + s), mm(y + s)], fill=INK)
            else:
                d.rectangle([mm(x), mm(y), mm(x + s), mm(y + s)], outline=BLUE, width=2)
        d.text((mm(hw.MARK_IN + hw.MARK + 6 + hw.CODE_BITS * (hw.MARK / 2 + 3) + 4), mm(hw.MARK_IN + 1)),
               f"Glyphroom 손글씨 종이  {pi + 1} / {len(pages)}", font=f_title, fill=INK)
        d.text((mm(hw.GRID_X0), mm(hw.MARK_IN + hw.MARK + 6)),
               "검은 펜(0.5mm 이상)으로 진한 점선 칸 안에만 쓰세요. 파란 글자·선은 사진에서 지워집니다.\n"
               "흐린 점선 칸은 다른 자모가 들어갈 자리입니다(비워 두세요). 다 쓰면 종이 전체가 나오게 찍어 올리세요.",
               font=f_small, fill=LABEL, spacing=mm(1))
        for i, c in enumerate(cells):
            x, y = hw.cell_box(i)
            box = [mm(x), mm(y), mm(x + hw.CELL), mm(y + hw.CELL)]
            d.rectangle(box, outline=BLUE, width=2)
            k = hw.CELL / 1000
            zones = hw.ZONES[(c["vt"], c["b"])]
            base_y = y + 800 * k
            d.line([(mm(x + 1), mm(base_y)), (mm(x + hw.CELL - 1), mm(base_y))], fill=BLUE, width=1)
            l, v, t = hw.split(c["sample"])
            names = {"L": l, "V": v, "T": t}
            for part, (zx1, zy1, zx2, zy2) in zones.items():
                zb = (mm(x + zx1 * k), mm(y + zy1 * k), mm(x + zx2 * k), mm(y + zy2 * k))
                if part == c["part"]:
                    _dashed_rect(d, zb, BLUE_DARK, 3, mm(1.2))
                    d.text((zb[0] + mm(0.8), zb[1] + mm(0.4)), names[part], font=f_small, fill=BLUE)  # 쓸 자모 이름(파랑, 지워짐)
                else:
                    _dashed_rect(d, zb, BLUE, 1, mm(0.8))
                    tw = d.textlength(names[part], font=f_zone)
                    d.text(((zb[0] + zb[2]) / 2 - tw / 2, (zb[1] + zb[3]) / 2 - mm(1.8)), names[part], font=f_zone, fill=BLUE)
            lab = f"{c['jamo']}  ·  {c['sample']}"
            tw = d.textlength(lab, font=f_label)
            d.text((mm(x + hw.CELL / 2) - tw / 2, mm(y + hw.CELL + 0.6)), lab, font=f_label, fill=LABEL)
        out.append(img)
    return out


def save_pdf(path):
    imgs = render_pages()
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    imgs[0].save(path, save_all=True, append_images=imgs[1:], resolution=DPI)
    return len(imgs)


if __name__ == "__main__":
    print(save_pdf(sys.argv[1] if len(sys.argv) > 1 else "glyphroom-handwriting.pdf"), "장")
