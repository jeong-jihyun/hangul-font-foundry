"""연습용 기본 글꼴 5종 도안 만들기 (개발자용, 한 번만 실행).

OFL(SIL Open Font License 1.1) 글꼴의 윤곽을 앱 규칙(1000칸, 기준선 800, M L C Z)의 SVG로 바꿔
web/public/templates/{key}.zip 로 저장한다. zip 안에 OFL.txt 와 출처 안내를 함께 넣는다.
이 도안으로 만든 폰트는 OFL 을 따라야 하며 폰트 파일만 따로 팔 수 없다.

사용: python -I tools/make_templates.py <OFL 글꼴 폴더> <출력 폴더>
 - <OFL 글꼴 폴더> 안: gulim/ (googlefonts/gulim), batang/ (googlefonts/batang), nanumgothic/ (google/fonts ofl/nanumgothic)
"""
import io
import json
import os
import sys
import zipfile

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from hangul_font_kit.charset import required_chars  # noqa: E402

TEMPLATES = [
    # key, 화면 이름, 글꼴 파일, OFL 파일, 예약 이름(파생 폰트 이름에 쓰면 안 됨), 원본 저장소
    ("gulim", "굴림체", "gulim/fonts/ttf/unhinted/gulimche-Regular.ttf", "gulim/OFL.txt", [], "https://github.com/googlefonts/gulim"),
    ("dotum", "돋움체", "gulim/fonts/ttf/unhinted/dotumche-Regular.ttf", "gulim/OFL.txt", [], "https://github.com/googlefonts/gulim"),
    ("gungsuh", "궁서체", "batang/fonts/ttf/unhinted/gungsuhche-Regular.ttf", "batang/OFL.txt", [], "https://github.com/googlefonts/batang"),
    ("myeongjo", "명조체 (바탕)", "batang/fonts/ttf/unhinted/batangche-Regular.ttf", "batang/OFL.txt", [], "https://github.com/googlefonts/batang"),
    ("gothic", "고딕체 (나눔고딕)", "nanumgothic/NanumGothic-Regular.ttf", "nanumgothic/OFL.txt",
     ["Nanum", "Naver Nanum", "NanumGothic", "Naver NanumGothic", "나눔", "나눔고딕"], "https://github.com/google/fonts/tree/main/ofl/nanumgothic"),
]
BASE, OTHER = 800, 600
PREVIEW = "다람쥐 헌 쳇바퀴"


class SvgPen(BasePen):
    """윤곽을 SVG 좌표(아래로 y 증가)로 바꾸고, 2차 곡선(Q)은 3차(C)로 바꾼다."""

    def __init__(self, glyphset, s, dx, fit=(1, 0, 0), sx=1):
        super().__init__(glyphset)
        self.s, self.dx, self.fit, self.sx, self.out, self.pts = s, dx, fit, sx, [], []

    def p(self, pt):
        k, u, t = self.fit  # 칸 안에 들어오게 줄이고 옮기기 (가운데 500 / 기준선 800 기준)
        x = pt[0] * self.s * self.sx + self.dx
        y = BASE - pt[1] * self.s
        x, y = 500 + (x - 500) * k + u, BASE + (y - BASE) * k + t
        self.pts.append((x, y))
        return f"{round(x)} {round(y)}"

    def _moveTo(self, pt): self.out.append("M" + self.p(pt))
    def _lineTo(self, pt): self.out.append("L" + self.p(pt))
    def _curveToOne(self, a, b, c): self.out.append(f"C{self.p(a)} {self.p(b)} {self.p(c)}")
    def _closePath(self): self.out.append("Z")
    def _endPath(self): self.out.append("Z")

    def _qCurveToOne(self, q, end):
        st = self._getCurrentPoint()
        c1 = (st[0] + 2 / 3 * (q[0] - st[0]), st[1] + 2 / 3 * (q[1] - st[1]))
        c2 = (end[0] + 2 / 3 * (q[0] - end[0]), end[1] + 2 / 3 * (q[1] - end[1]))
        self._curveToOne(c1, c2, end)


def glyph_d(font, gs, cp, s, fit=(1, 0, 0), pts=None):
    name = font.getBestCmap().get(cp)
    if not name:
        return None
    adv = font["hmtx"][name][0] * s
    hangul = 0xAC00 <= cp <= 0xD7A3
    dx = 0 if hangul else round((OTHER - adv) / 2)  # 한글 외 글자는 600 너비 가운데에 놓는다
    pen = SvgPen(gs, s, dx, fit)
    gs[name].draw(pen)
    if not hangul and pen.pts:
        xs = [q[0] for q in pen.pts]
        wide = (max(xs) - min(xs)) / fit[0]
        if wide > OTHER - 16:  # 600 칸보다 넓은 영문·기호(W, m, %, @)는 가로만 좁혀 칸에 맞춘다 (고정폭 글꼴과 같은 방식)
            sx = (OTHER - 16) / wide
            pen = SvgPen(gs, s, 0, fit, sx)
            gs[name].draw(pen)
            xs = [q[0] for q in pen.pts]
            left0 = (min(xs) - 500 - fit[1]) / fit[0] + 500  # 맞춤 전 왼쪽 끝
            pen = SvgPen(gs, s, (OTHER - (max(xs) - min(xs)) / fit[0]) / 2 - left0, fit, sx)
            gs[name].draw(pen)
    if not hangul and pen.pts and fit != (1, 0, 0):
        # 넓은 영문(W, %, @ 등)이 칸 밖으로 나가면 그 글자만 안쪽으로 민다
        xs = [q[0] for q in pen.pts]
        move = (6 - min(xs)) if min(xs) < 6 else (994 - max(xs)) if max(xs) > 994 else 0
        if move:
            pen = SvgPen(gs, s, dx + move / fit[0], fit)
            gs[name].draw(pen)
    if pts is not None:
        pts.extend(pen.pts)
    return "".join(pen.out)


def best_fit(font, gs, s, chars, lo=6, hi=994):
    """모든 글자의 점이 0~1000 칸 안(여유 6)에 들어오도록 한 번에 줄이고 옮길 값을 정한다.
    줄이는 비율 k 는 모든 글자에 같게, 옮기는 값은 0 에 가장 가깝게 (기준선 800 을 되도록 지킴)."""
    pts, hpts = [], []
    for ch in chars:
        if ch != " ":
            glyph_d(font, gs, ord(ch), s, pts=hpts if "가" <= ch <= "힣" else pts)
    xs, ys = [p[0] for p in hpts], [p[1] for p in pts + hpts]  # 가로 맞춤은 한글 기준 (영문은 글자별로 민다)
    k = min(1, (hi - lo) / (max(xs) - min(xs)), (hi - lo) / (max(ys) - min(ys)))
    def shift(vmin, vmax, c):
        a, b = c + (vmin - c) * k, c + (vmax - c) * k  # 줄인 뒤 범위
        lo_t, hi_t = lo - a, hi - b                    # 가능한 이동 범위
        return min(max(0, lo_t), hi_t)
    return (k, shift(min(xs), max(xs), 500), shift(min(ys), max(ys), BASE))


def svg(d):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="{d}"/></svg>\n'


def main(src, out):
    os.makedirs(out, exist_ok=True)
    chars = required_chars()
    index = []
    for key, label, fpath, ofl, rfn, repo in TEMPLATES:
        font = TTFont(os.path.join(src, fpath))
        s = 1000 / font["head"].unitsPerEm
        gs = font.getGlyphSet()
        fit = best_fit(font, gs, s, chars)
        ofl_text = open(os.path.join(src, ofl), encoding="utf-8").read()
        copyright_line = ofl_text.strip().split("\n\n")[0].replace("\n", " ")
        buf, missing, ymin, ymax = io.BytesIO(), [], 1e9, -1e9
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for ch in chars:
                cp = ord(ch)
                if ch == " ":  # 공백: 그릴 것 없이 칸만 (빌드에서 너비만 씀)
                    z.writestr("U+0020.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"></svg>\n')
                    continue
                d = glyph_d(font, gs, cp, s, fit)
                if d is None:
                    missing.append(ch)
                    continue
                nums = [int(v) for v in d.replace("M", " ").replace("L", " ").replace("C", " ").replace("Z", " ").split()]
                ys = nums[1::2]
                if ys:
                    ymin, ymax = min(ymin, min(ys)), max(ymax, max(ys))
                z.writestr(f"U+{cp:04X}.svg", svg(d))
            z.writestr("OFL.txt", ofl_text)
            z.writestr("출처_및_라이선스.txt",
                       f"이 도안은 '{label}' 원본 글꼴({repo})의 윤곽을 글리프룸 규칙(1000칸, 기준선 800)의 SVG로 바꾼 것입니다.\n"
                       f"원본 저작권: {copyright_line}\n"
                       "라이선스: SIL Open Font License 1.1 (OFL.txt)\n\n"
                       "꼭 지킬 것\n"
                       "- 이 도안으로 만든 폰트도 OFL 로만 배포할 수 있습니다.\n"
                       "- 폰트 파일만 따로 유료로 팔 수 없습니다 (마켓 판매 불가).\n"
                       "- 배포할 때 OFL.txt 와 위 저작권 줄을 함께 넣어야 합니다.\n"
                       + (f"- 새 폰트 이름에 다음 예약 이름을 쓰면 안 됩니다: {', '.join(rfn)}\n" if rfn else "")
                       + "- 이 안내는 초안입니다. 배포 전에 OFL 원문을 직접 확인하세요.\n")
        data = buf.getvalue()
        open(os.path.join(out, f"{key}.zip"), "wb").write(data)
        # 고르기 화면용 짧은 미리보기 그림
        x, parts = 0, []
        for ch in PREVIEW:
            if ch == " ":
                x += 300
                continue
            d = glyph_d(font, gs, ord(ch), s, fit)
            parts.append(f'<path transform="translate({x} 0)" d="{d}"/>')
            x += 1000
        open(os.path.join(out, f"{key}-preview.svg"), "w", encoding="utf-8").write(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {x} 1000">{"".join(parts)}</svg>\n')
        index.append({"key": key, "label": label, "count": len(chars) - len(missing), "fit": [round(v, 4) for v in fit], "missing": "".join(missing),
                      "size": len(data), "repo": repo, "copyright": copyright_line, "reserved": rfn, "license": "OFL-1.1"})
        print(key, label, "글자", len(chars) - len(missing), "빠짐", "".join(missing), "zip", len(data) // 1024, "KB",
              "y범위", ymin, ymax, "맞춤", [round(v, 3) for v in fit])
    json.dump(index, open(os.path.join(out, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
