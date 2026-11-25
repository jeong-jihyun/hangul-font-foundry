"""문자 세트 API (4단계) — 설계서 5.1 POST /charsets, GET /charsets/{id}, GET /artifacts/{id}/download.

글자 목록은 늘 같은 결과가 나오므로(KS X 1001 고정) 저장소 없이 바로 계산한다.
charsetId 에 선택 옵션을 담아 두어 서버가 다시 켜져도 같은 id 로 같은 목록을 돌려준다.
  cs_h1_b1 = 한글 2,350자 포함 + 숫자·영문·기호 포함
"""
import csv
import io
import string
from functools import lru_cache

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import BaseModel

from hangul_font_kit import charset

router = APIRouter(prefix="/api/v1")


class CharsetRequest(BaseModel):
    projectId: str = "prj_default"
    format: str = "csv"
    includeHangul2350: bool = True
    includeLatinDigitsSymbols: bool = True


def group_of(ch: str) -> str:
    if "가" <= ch <= "힣":
        return "hangul"
    if ch in string.digits:
        return "digit"
    if ch in string.ascii_letters:
        return "latin"
    return "symbol"


@lru_cache(maxsize=4)
def build(h: bool, b: bool):
    chars = (charset.ksx1001_hangul() if h else []) + (charset.basic_chars() if b else [])
    items = [{"char": c, "codepoint": f"U+{ord(c):04X}", "filename": f"U+{ord(c):04X}.svg", "group": group_of(c)} for c in chars]
    counts = {"total": len(items)}
    for g in ("hangul", "digit", "latin", "symbol"):
        counts[g] = sum(1 for i in items if i["group"] == g)
    return items, counts


def make_id(h: bool, b: bool) -> str:
    return f"cs_h{int(h)}_b{int(b)}"


def parse_id(cid: str):
    try:
        _, h, b = cid.split("_")
        assert h in ("h0", "h1") and b in ("b0", "b1")
        return h == "h1", b == "b1"
    except Exception:
        return None


def not_found(request: Request, what: str):
    from .main import error
    return error(request, 404, "RESOURCE_NOT_FOUND", f"{what}을(를) 찾을 수 없습니다.")


@router.post("/charsets")
def create_charset(req: CharsetRequest, request: Request):
    from .main import error, now_iso
    if req.format != "csv":
        return error(request, 400, "VALIDATION_ERROR", "지금은 CSV 형식만 지원합니다.", {"fields": [{"field": "format", "reason": "csv 만 가능"}]})
    if not (req.includeHangul2350 or req.includeLatinDigitsSymbols):
        return error(request, 400, "VALIDATION_ERROR", "한글 또는 숫자·영문·기호 중 하나는 포함해야 합니다.")
    cid = make_id(req.includeHangul2350, req.includeLatinDigitsSymbols)
    _, counts = build(req.includeHangul2350, req.includeLatinDigitsSymbols)
    # 바로 끝나는 작업이라 상태는 곧장 succeeded (설계서의 작업 상태 모델과 같은 값을 쓴다)
    return {"jobId": "job_" + cid, "status": "succeeded", "charsetId": cid, "counts": counts,
            "artifactId": f"art_{cid}_csv", "finishedAt": now_iso()}


@router.get("/charsets/{cid}")
def get_charset(cid: str, request: Request):
    opt = parse_id(cid)
    if not opt:
        return not_found(request, "문자 세트")
    items, counts = build(*opt)
    return {"charsetId": cid, "status": "succeeded", "counts": counts, "artifactId": f"art_{cid}_csv", "items": items}


@router.get("/artifacts/{aid}/download")
def download(aid: str, request: Request):
    # 4단계에서는 문자 세트 CSV 만. 빌드 산출물(TTF·PNG·PDF)은 7단계에서 추가.
    if not (aid.startswith("art_cs_") and aid.endswith("_csv")):
        return not_found(request, "산출물")
    opt = parse_id(aid[4:-4])
    if not opt:
        return not_found(request, "산출물")
    items, _ = build(*opt)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["character", "codepoint", "filename"])  # 엔진 CLI(charset --out)와 같은 열
    for i in items:
        w.writerow([i["char"], i["codepoint"], i["filename"]])
    data = "﻿" + buf.getvalue()  # 엑셀에서 한글이 깨지지 않게 BOM 포함
    return Response(data.encode("utf-8"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="required_chars.csv"', "Cache-Control": "public, max-age=86400"})
