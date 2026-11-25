"""시험지: 글자 견본표 PNG, 문장 미리보기, 견본 PDF."""
import math
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


def glyph_sheet(ttf_path, chars, out_png, cell=96, cols=10):
    font = ImageFont.truetype(ttf_path, int(cell * 0.7))
    rows = max(1, math.ceil(len(chars) / cols))
    im = Image.new("RGB", (cols * cell, rows * cell), "white")
    d = ImageDraw.Draw(im)
    for i, ch in enumerate(chars):
        r, c = divmod(i, cols)
        d.rectangle((c * cell, r * cell, (c + 1) * cell - 1, (r + 1) * cell - 1), outline=(220, 220, 220))
        d.text((c * cell + cell * 0.15, r * cell + cell * 0.1), ch, font=font, fill="black")
    im.save(out_png)
    return im.size


def sentence_preview(ttf_path, sentence, available, out_png, size=64):
    shown = "".join(ch if (ch == " " or ch in available) else "□" for ch in sentence)
    missing = sorted({ch for ch in sentence if ch != " " and ch not in available})
    font = ImageFont.truetype(ttf_path, size)
    box = font.getbbox(shown)
    im = Image.new("RGB", (max(box[2] + 40, 200), size * 2), "white")
    ImageDraw.Draw(im).text((20, size // 2), shown, font=font, fill="black")
    im.save(out_png)
    return {"shown": shown, "missing": missing}


def specimen_pdf(out_pdf, sheet_png, sentence_png):
    W, H = A4
    c = canvas.Canvas(out_pdf, pagesize=A4)
    for png in (sheet_png, sentence_png):
        with Image.open(png) as im:
            iw, ih = im.size
            s = min((W - 80) / iw, (H - 80) / ih)
            c.drawImage(ImageReader(im.convert("RGB")), 40, H - 40 - ih * s, iw * s, ih * s)
        c.showPage()
    c.save()
    return 2


def specimen_pdf_pages(out_pdf, ttf_path, chars, sentence, family="Font", cols=8):
    """여러 쪽 견본 PDF (벡터). 1쪽: 이름·문장 미리보기, 2쪽부터: 글자 격자 (쪽당 cols×9자).

    글자를 그림으로 붙이지 않고 만든 폰트로 직접 써서, 2,000자가 넘어도 확대하면 선명하다.
    """
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    name = "GlyphroomSpecimen"
    pdfmetrics.registerFont(TTFont(name, ttf_path))
    have = set(chars)
    W, H = A4
    m = 40
    c = canvas.Canvas(out_pdf, pagesize=A4)
    c.setTitle(f"{family} specimen")

    def header(page_label):
        # 머리말 기본 글꼴(Helvetica)에는 한글이 없으므로, 글꼴 이름은 만든 폰트에 있으면 그것으로, 없으면 영문 이름으로
        c.setFillGray(0.45)
        x = m
        if all(ch in have or ch == " " for ch in family):
            c.setFont(name, 9); c.drawString(x, H - 24, family); x += pdfmetrics.stringWidth(family, name, 9)
        else:
            import re as _re
            label = _re.sub(r"[^A-Za-z0-9 -]", "", family).strip() or "Hangul Font"
            c.setFont("Helvetica", 8); c.drawString(x, H - 24, label); x += pdfmetrics.stringWidth(label, "Helvetica", 8)
        c.setFont("Helvetica", 8)
        c.drawString(x, H - 24, f"  ·  {len(chars)} glyphs  ·  {page_label}")
        c.setFillGray(0)

    def draw_text(x, y, text, size):
        """만든 폰트에 없는 글자는 빈 네모(□)로 표시"""
        for ch in text:
            if ch == " ":
                x += size * 0.3
                continue
            if ch in have:
                c.setFont(name, size)
                c.drawString(x, y, ch)
                x += pdfmetrics.stringWidth(ch, name, size)
            else:
                c.setStrokeGray(0.6)
                c.rect(x + size * 0.08, y - size * 0.05, size * 0.8, size * 0.8, stroke=1, fill=0)
                x += size
            if x > W - m - size:
                break

    # 1쪽: 문장 미리보기
    header("preview")
    y = H - 90
    for size in (48, 32, 20, 12):
        draw_text(m, y, sentence, size)
        c.setFont("Helvetica", 7); c.setFillGray(0.5); c.drawString(m, y - 12, f"{size} pt"); c.setFillGray(0)
        y -= size + 40
    c.showPage()

    # 2쪽~: 글자 격자
    cell = (W - 2 * m) / cols
    rows = int((H - 2 * m - 20) // (cell + 10))
    per = cols * rows
    pages = max(1, math.ceil(len(chars) / per))
    for p in range(pages):
        header(f"glyphs {p + 1}/{pages}")
        for i, ch in enumerate(chars[p * per:(p + 1) * per]):
            r, col = divmod(i, cols)
            x = m + col * cell
            yb = H - m - 20 - (r + 1) * (cell + 10)
            c.setStrokeGray(0.85)
            c.rect(x, yb, cell - 4, cell + 6, stroke=1, fill=0)
            c.setFont(name, cell * 0.6)
            c.drawCentredString(x + (cell - 4) / 2, yb + cell * 0.32, ch)
            c.setFont("Helvetica", 6); c.setFillGray(0.5)
            c.drawCentredString(x + (cell - 4) / 2, yb + 4, f"U+{ord(ch):04X}"); c.setFillGray(0)
        c.showPage()
    c.save()
    return pages + 1
