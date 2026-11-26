"""손글씨 종이 → 자모 조각 → 2,350자 조합 (글꼴 없이 동작하는 부분: 칸 배치·사진에서 글씨 따내기)

종이 한 칸 = 글자 칸 1000×1000 (바닥선 800). 칸마다 '써야 할 자모 자리'만 비워 두고,
나머지 자모 자리는 연한 파란 점선 + 작은 이름으로 알려 준다. 파란색은 사진에서 걸러지고
검은 펜 글씨만 남는다(서류 양식의 '드롭아웃 색' 방식). 다른 폰트의 글자 모양은 인쇄하지 않는다.

자모 모양은 놓이는 자리에 따라 달라서 이렇게 나눈다 (모두 237칸)
- 초성 19 × 6형: 모음 모양(세로 ㅏ류 · 가로 ㅗ류 · 섞임 ㅘ류) × 받침 있음/없음
- 중성 21 × 2형: 받침 있음/없음
- 종성 27 × 3형: 모음 모양
"""
from __future__ import annotations

L = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
V = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
T = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"  # 받침 27 (없음 제외)
VTYPE = {}
for _v in "ㅏㅐㅑㅒㅓㅔㅕㅖㅣ": VTYPE[_v] = "V"   # 세로
for _v in "ㅗㅛㅜㅠㅡ": VTYPE[_v] = "H"            # 가로
for _v in "ㅘㅙㅚㅝㅞㅟㅢ": VTYPE[_v] = "M"        # 섞임
REP_V = {"V": "ㅏ", "H": "ㅗ", "M": "ㅘ"}
REP_T = "ㄴ"
TYPE_NAME = {"V": "ㅏ류", "H": "ㅗ류", "M": "ㅘ류"}

# 자리(1000 칸 기준, x1 y1 x2 y2): (모음 모양, 받침 있음) → {초성, 중성, 종성}
ZONES = {
    ("V", 0): {"L": (80, 160, 520, 780), "V": (520, 100, 920, 860)},
    ("V", 1): {"L": (80, 110, 520, 500), "V": (520, 80, 920, 560), "T": (140, 570, 860, 870)},
    ("H", 0): {"L": (200, 100, 800, 440), "V": (90, 440, 910, 800)},
    ("H", 1): {"L": (220, 80, 780, 320), "V": (90, 320, 910, 560), "T": (200, 580, 800, 870)},
    ("M", 0): {"L": (100, 100, 600, 440), "V": (90, 100, 920, 860)},
    ("M", 1): {"L": (100, 80, 560, 320), "V": (90, 80, 920, 580), "T": (200, 600, 800, 870)},
}


def syllable(l, v, t=""):
    """초성·중성·종성 글자 → 완성형 한 글자"""
    return chr(0xAC00 + (L.index(l) * 21 + V.index(v)) * 28 + (T.index(t) + 1 if t else 0))


def split(ch):
    """완성형 한 글자 → (초성, 중성, 종성 또는 '')"""
    n = ord(ch) - 0xAC00
    if not 0 <= n < 11172:
        return None
    l, rest = divmod(n, 588)
    v, t = divmod(rest, 28)
    return L[l], V[v], (T[t - 1] if t else "")


def _all_cells():
    out = []
    for i, l in enumerate(L):
        for vt in "VHM":
            for b in (0, 1):
                out.append({"key": f"L{i:02d}{vt}{b}", "part": "L", "jamo": l, "vt": vt, "b": b,
                            "sample": syllable(l, REP_V[vt], REP_T if b else "")})
    for i, v in enumerate(V):
        vt = VTYPE[v]
        for b in (0, 1):
            out.append({"key": f"V{i:02d}{b}", "part": "V", "jamo": v, "vt": vt, "b": b,
                        "sample": syllable("ㅇ", v, REP_T if b else "")})
    for i, t in enumerate(T):
        for vt in "VHM":
            out.append({"key": f"T{i:02d}{vt}", "part": "T", "jamo": t, "vt": vt, "b": 1,
                        "sample": syllable("ㅇ", REP_V[vt], t)})
    return out


def _rank(c):
    """쓰는 순서: 1장만 써도 '가 개 거 기 나…'(받침 없는 ㅏ류 171자)가 바로 만들어지게,
    그다음 ㅗ류 → 받침 있는 ㅏ류 → 받침 있는 ㅗ류 → ㅘ류"""
    p, vt, b = c["part"], c["vt"], c["b"]
    if p == "L" and vt == "V" and b == 0: return 0
    if p == "V" and vt == "V" and b == 0: return 1
    if p == "V" and vt == "H" and b == 0: return 2
    if p == "L" and vt == "H" and b == 0: return 3
    if vt == "V" and b == 1: return 4 + "LVT".index(p) * 0.1
    if vt == "H" and b == 1: return 5 + "LVT".index(p) * 0.1
    return 6 + b + "LVT".index(p) * 0.1


def cells():
    """종이에 들어갈 칸 목록 (순서 = 인쇄 순서). key 는 저장 파일 이름에 쓴다."""
    return sorted(_all_cells(), key=_rank)


def parts_for(ch):
    """한 글자를 만들 때 쓸 칸 key 들 (초성·중성·종성 순)"""
    s = split(ch)
    if not s:
        return None
    l, v, t = s
    vt, b = VTYPE[v], 1 if t else 0
    keys = [f"L{L.index(l):02d}{vt}{b}", f"V{V.index(v):02d}{b}"]
    if t:
        keys.append(f"T{T.index(t):02d}{vt}")
    return keys


# ---------- 종이 배치 (A4 세로, 밀리미터) ----------
PAGE_W, PAGE_H = 210.0, 297.0
COLS, ROWS = 6, 7
CELL = 28.0                     # 칸 한 변
GAP_X, GAP_Y = 2.0, 6.0         # 칸 사이 (아래에 이름 쓸 자리)
MARK = 8.0                      # 귀퉁이 표시(검은 네모) 한 변
MARK_IN = 8.0                   # 종이 끝에서 표시까지
GRID_X0 = (PAGE_W - (COLS * CELL + (COLS - 1) * GAP_X)) / 2
GRID_Y0 = 40.0
PER_PAGE = COLS * ROWS
CODE_BITS = 5                   # 장 번호(0~31)를 위쪽 작은 네모로


def pages():
    cs = cells()
    return [cs[i:i + PER_PAGE] for i in range(0, len(cs), PER_PAGE)]


def cell_box(i):
    """장 안 i 번째 칸의 왼쪽 위 (mm)"""
    r, c = divmod(i, COLS)
    return GRID_X0 + c * (CELL + GAP_X), GRID_Y0 + r * (CELL + GAP_Y)


def marker_centers():
    """귀퉁이 표시 4개의 중심 (왼위, 오위, 오아래, 왼아래) mm"""
    a = MARK_IN + MARK / 2
    return [(a, a), (PAGE_W - a, a), (PAGE_W - a, PAGE_H - a), (a, PAGE_H - a)]


def code_boxes():
    """장 번호 네모 자리 (왼위 표시 오른쪽에 나란히) mm, 크기 MARK/2"""
    s = MARK / 2
    x0 = MARK_IN + MARK + 6
    return [(x0 + k * (s + 3), MARK_IN + MARK / 4, s) for k in range(CODE_BITS)]


# ---------- 사진에서 글씨 따내기 ----------
class PhotoError(Exception):
    pass


def _cv():
    import cv2  # 무거워서 필요할 때만
    import numpy as np
    return cv2, np


def find_page(img_bgr, px_per_mm=8.0):
    """사진 → (반듯하게 편 종이 그림, 장 번호). 귀퉁이 검은 네모 4개를 찾아 기울어짐을 바로잡는다."""
    cv2, np = _cv()
    h, w = img_bgr.shape[:2]
    scale = 1600 / max(h, w) if max(h, w) > 1600 else 1.0
    small = cv2.resize(img_bgr, None, fx=scale, fy=scale) if scale != 1.0 else img_bgr
    # 검은 부분만 (파란 안내선·종이 결·그림자 제외) — 그림자는 주변 밝기로 나눠 고르게
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    kk = max(31, (max(small.shape[:2]) // 18) | 1)  # 귀퉁이 네모보다 넉넉히 큰 창으로 종이 밝기 추정
    bg = cv2.dilate(gray, np.ones((kk, kk), np.uint8))
    bg = cv2.blur(bg, (kk, kk))
    norm = cv2.divide(gray, bg, scale=255)
    b, g_, r = cv2.split(small.astype(np.int16))
    blue = (b - r > 35)
    bw = ((norm < 75) & ~blue).astype(np.uint8) * 255  # 아주 검은 것만 (책상·그림자는 이보다 밝음)
    cnts, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    area_img = small.shape[0] * small.shape[1]
    cand = []
    for c in cnts:
        x, y, bw_, bh_ = cv2.boundingRect(c)
        a = bw_ * bh_
        if a < area_img * 0.00015 or a > area_img * 0.02:
            continue
        if not 0.6 < bw_ / max(bh_, 1) < 1.6:
            continue
        fill = cv2.countNonZero(bw[y:y + bh_, x:x + bw_]) / a
        if fill < 0.75:  # 속이 꽉 찬 네모만 (칸 테두리·글씨 제외)
            continue
        cand.append((a, x + bw_ / 2, y + bh_ / 2))
    if len(cand) < 4:
        raise PhotoError("종이 네 귀퉁이의 검은 네모를 찾지 못했습니다. 종이 전체가 나오게, 밝은 곳에서 다시 찍어 주세요.")
    # 큰 네모 중에서 사진 네 모서리에 가장 가까운 것
    cand.sort(reverse=True)
    big = cand[:12]
    H, W = small.shape[:2]
    corners_img = [(0, 0), (W, 0), (W, H), (0, H)]
    pick = []
    for cx, cy in corners_img:
        best = min(big, key=lambda t: (t[1] - cx) ** 2 + (t[2] - cy) ** 2)
        pick.append((best[1] / scale, best[2] / scale))
    if len({p for p in pick}) < 4:
        raise PhotoError("귀퉁이 표시를 구분하지 못했습니다. 종이를 반듯하게 놓고 다시 찍어 주세요.")
    dst = np.float32([[x * px_per_mm, y * px_per_mm] for x, y in marker_centers()])
    M = cv2.getPerspectiveTransform(np.float32(pick), dst)
    flat = cv2.warpPerspective(img_bgr, M, (int(PAGE_W * px_per_mm), int(PAGE_H * px_per_mm)), flags=cv2.INTER_LINEAR,
                               borderValue=(255, 255, 255))
    # 장 번호 읽기
    g = cv2.cvtColor(flat, cv2.COLOR_BGR2GRAY)
    bits = 0
    for k, (x, y, s) in enumerate(code_boxes()):
        x1, y1 = int((x + s * 0.25) * px_per_mm), int((y + s * 0.25) * px_per_mm)
        x2, y2 = int((x + s * 0.75) * px_per_mm), int((y + s * 0.75) * px_per_mm)
        if g[y1:y2, x1:x2].mean() < 110:
            bits |= 1 << k
    page = bits - 1  # 1부터 시작 (0 = 표시 없음)
    if not 0 <= page < len(pages()):
        raise PhotoError("몇 번째 장인지 읽지 못했습니다. 종이 위쪽 작은 네모가 잘 보이게 다시 찍어 주세요.")
    return flat, page


def ink_mask(cell_bgr):
    """칸 그림 → 검은 펜 글씨만 (파란 안내선·종이 그림자 제외)"""
    cv2, np = _cv()
    b, g, r = cv2.split(cell_bgr.astype(np.int16))
    gray = cv2.cvtColor(cell_bgr, cv2.COLOR_BGR2GRAY)
    # 종이 밝기를 고르게 (그림자): 굵은 획보다 큰 창의 '가장 밝은 값'을 종이색으로 본다
    bg = cv2.blur(cv2.dilate(gray, np.ones((61, 61), np.uint8)), (41, 41))
    norm = cv2.divide(gray, bg, scale=255)
    dark = norm < 140
    blue = (b - r > 35) & (b - g > 10)  # 파란 안내선
    m = (dark & ~blue).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return m


def mask_to_path(mask, size=1000):
    """흑백 그림 → SVG 경로(절대좌표 M L Z). 바깥선·구멍 모두. 작은 점은 버림."""
    cv2, np = _cv()
    h, w = mask.shape
    sm = cv2.GaussianBlur(mask, (5, 5), 0)
    _, sm = cv2.threshold(sm, 127, 255, cv2.THRESH_BINARY)
    cnts, _ = cv2.findContours(sm, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    k = size / w
    min_area = (w * h) * 0.0006
    parts, ink = [], 0
    for c in cnts:
        a = cv2.contourArea(c)
        if a < min_area:
            continue
        ap = cv2.approxPolyDP(c, 0.9, True)
        if len(ap) < 3:
            continue
        pts = [(round(float(p[0][0]) * k, 1), round(float(p[0][1]) * k, 1)) for p in ap]
        parts.append("M" + " L".join(f"{x} {y}" for x, y in pts) + "Z")
        ink += a
    return "".join(parts), ink / (w * h)


def extract_page(img_bgr, px_per_mm=8.0):
    """사진 한 장 → {page, cells:[{key, jamo, sample, status, d}]}
    status: ok | empty(안 씀) | faint(너무 흐리거나 작음) | messy(칸을 넘치거나 너무 진함)"""
    cv2, np = _cv()
    flat, page = find_page(img_bgr, px_per_mm)
    out = []
    pad = 0.6  # 칸 테두리선 안쪽만 (mm)
    for i, c in enumerate(pages()[page]):
        x, y = cell_box(i)
        x1, y1 = int((x + pad) * px_per_mm), int((y + pad) * px_per_mm)
        x2, y2 = int((x + CELL - pad) * px_per_mm), int((y + CELL - pad) * px_per_mm)
        crop = flat[y1:y2, x1:x2]
        crop = cv2.resize(crop, (400, 400), interpolation=cv2.INTER_CUBIC)
        m = ink_mask(crop)
        d, cover = mask_to_path(m, 1000)
        status = "ok"
        if not d or cover < 0.004:
            status = "empty" if cover < 0.0015 else "faint"
        elif cover > 0.45:
            status = "messy"
        out.append({"key": c["key"], "jamo": c["jamo"], "sample": c["sample"], "part": c["part"], "status": status,
                    "d": d if status in ("ok", "messy", "faint") else ""})
    return {"page": page, "pages": len(pages()), "cells": out}
