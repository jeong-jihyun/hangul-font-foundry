"""손글씨 종이 사진 → 칸별 자모 모양 (POST /api/v1/handwriting/extract), 칸 배치 (GET /api/v1/handwriting/layout)
사진은 저장하지 않고 처리 후 바로 버린다."""
from fastapi import APIRouter, File, Form, Request, UploadFile

from hangul_font_kit import handwrite as hw

router = APIRouter(prefix="/api/v1")
MAX = 12 * 1024 * 1024


def _err(request, status, code, message, details=None, retryable=False):
    from .main import error
    return error(request, status, code, message, details, retryable)


@router.get("/handwriting/layout")
def layout():
    """칸 목록과 장 나눔 (화면에서 어떤 칸이 몇 번째 장에 있는지 보여 줄 때)"""
    return {"pages": [[{k: c[k] for k in ("key", "part", "jamo", "vt", "b", "sample")} for c in p] for p in hw.pages()],
            "count": len(hw.cells())}


@router.post("/handwriting/extract")
async def extract(request: Request, file: UploadFile = File(...)):
    data = await file.read(MAX + 1)
    if len(data) > MAX:
        return _err(request, 413, "FILE_TOO_LARGE", "사진은 12MB 이하로 올려 주세요.")
    try:
        import cv2
        import numpy as np
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        img = None
    if img is None:
        return _err(request, 400, "VALIDATION_ERROR", "사진을 읽을 수 없습니다. JPG·PNG 사진으로 올려 주세요.")
    if max(img.shape[:2]) < 900:
        return _err(request, 400, "VALIDATION_ERROR", "사진이 너무 작습니다. 종이 전체가 크게 나오게 찍어 주세요.")
    try:
        r = hw.extract_page(img)
    except hw.PhotoError as e:
        return _err(request, 422, "PHOTO_NOT_READABLE", str(e))
    counts = {s: sum(1 for c in r["cells"] if c["status"] == s) for s in ("ok", "faint", "messy", "empty")}
    return {**r, "counts": counts}


@router.post("/trace")
async def trace(request: Request, file: UploadFile = File(...), threshold: int = Form(default=140)):
    """편집기 밑그림(도안) → 자동 패스. 그림은 저장하지 않는다."""
    data = await file.read(MAX + 1)
    if len(data) > MAX:
        return _err(request, 413, "FILE_TOO_LARGE", "그림은 12MB 이하로 올려 주세요.")
    if not 40 <= threshold <= 240:
        return _err(request, 400, "VALIDATION_ERROR", "진하기 기준은 40~240 사이입니다.")
    try:
        import cv2
        import numpy as np
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        img = None
    if img is None:
        return _err(request, 400, "VALIDATION_ERROR", "그림을 읽을 수 없습니다. JPG·PNG로 올려 주세요.")
    d, w, h, cover = hw.trace_image(img, threshold)
    if not d:
        return _err(request, 422, "NOTHING_TRACED", "따낼 검은 부분을 찾지 못했습니다. '진하기 기준'을 높여 보세요.")
    return {"d": d, "width": w, "height": h, "cover": round(cover, 4)}
