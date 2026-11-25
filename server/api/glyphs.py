"""글리프 올리기·검수 API (5단계).

POST /api/v1/glyphsets          zip 1개 올리기 → glyphSetId
POST /api/v1/checks             검수 실행 → 결과(요약·문제 목록·누락 글자)
GET  /api/v1/checks/{id}        검수 결과 다시 보기
GET  /api/v1/samples/{name}.zip 연습용 글리프 zip (good: 정상 20자, mixed: 일부러 틀린 파일 포함)
GET  /api/v1/templates/{cp}.svg 글자 1개용 빈 템플릿 (안내선은 guide 레이어라 글자로 읽히지 않음)

무료 서버 디스크는 잠들면 지워지므로, 올린 글리프는 임시 보관(6시간)이다.
화면은 같은 zip 을 기억해 두었다가 서버가 잊어버렸으면(404) 다시 올린다.
"""
import io
import os
import re
import shutil
import time
import uuid
import zipfile

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from hangul_font_kit import charset, checker
from hangul_font_kit.cli import _cfg

router = APIRouter(prefix="/api/v1")

STORE = os.environ.get("GLYPH_STORE", "/tmp/glyphroom/glyphsets")
KEEP_SECONDS = 6 * 3600
MAX_ZIP = 15 * 1024 * 1024          # 올리는 zip 최대 15MB
MAX_FILES = 3000                     # SVG 최대 3,000개 (필수 2,438자 + 여유)
MAX_TOTAL = 80 * 1024 * 1024         # 압축 푼 전체 크기 최대 80MB (압축 폭탄 방지)
MAX_SVG = 1_000_000                  # SVG 1개 최대 1MB (엔진과 같음)
SAFE_NAME = re.compile(r"^[^/\\\x00]{1,120}$")
CHECKS = {}                          # 검수 결과 (메모리, 서버 재시작 시 사라짐)


def _err(request, status, code, message, details=None, retryable=False):
    from .main import error
    return error(request, status, code, message, details, retryable)


def _cleanup():
    if not os.path.isdir(STORE):
        return
    now = time.time()
    for d in os.listdir(STORE):
        p = os.path.join(STORE, d)
        try:
            if now - os.path.getmtime(p) > KEEP_SECONDS:
                shutil.rmtree(p, ignore_errors=True)
        except OSError:
            pass


def _set_dir(gid):
    if not re.fullmatch(r"gs_[0-9a-f]{16}", gid or ""):
        return None
    p = os.path.join(STORE, gid)
    return p if os.path.isdir(p) else None


@router.post("/glyphsets")
async def upload_glyphset(request: Request, file: UploadFile = File(...)):
    _cleanup()
    data = await file.read(MAX_ZIP + 1)
    if len(data) > MAX_ZIP:
        return _err(request, 413, "PAYLOAD_TOO_LARGE", f"zip 파일이 너무 큽니다 (최대 {MAX_ZIP // 1024 // 1024}MB).")
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        return _err(request, 400, "VALIDATION_ERROR", "zip 파일이 아니거나 손상되었습니다. 폴더를 압축(zip)해서 올려 주세요.")

    svgs, skipped, dup, total = [], 0, [], 0
    seen = set()
    for info in zf.infolist():
        if info.is_dir():
            continue
        parts = info.filename.replace("\\", "/").split("/")
        base = parts[-1]
        # 맥 압축 찌꺼기·숨김 파일은 건너뜀
        if "__MACOSX" in parts or base.startswith(".") or not base:
            continue
        if not base.lower().endswith(".svg"):
            skipped += 1
            continue
        if not SAFE_NAME.match(base):
            skipped += 1
            continue
        if base in seen:
            dup.append(base)
            continue
        if info.file_size > MAX_SVG:
            return _err(request, 413, "PAYLOAD_TOO_LARGE", f"{base} 파일이 1MB를 넘습니다.", {"file": base})
        total += info.file_size
        if total > MAX_TOTAL or len(svgs) >= MAX_FILES:
            return _err(request, 413, "PAYLOAD_TOO_LARGE", f"파일이 너무 많거나 큽니다 (SVG 최대 {MAX_FILES}개).")
        seen.add(base)
        svgs.append((info, base))

    if not svgs:
        return _err(request, 400, "VALIDATION_ERROR", "zip 안에 SVG 파일이 없습니다. U+AC00.svg 같은 파일을 넣어 주세요.")

    gid = "gs_" + uuid.uuid4().hex[:16]
    d = os.path.join(STORE, gid)
    os.makedirs(d, exist_ok=True)
    for info, base in svgs:
        with zf.open(info) as src, open(os.path.join(d, base), "wb") as out:
            out.write(src.read(MAX_SVG + 1))
    return {"glyphSetId": gid, "fileName": file.filename, "svgCount": len(svgs), "skipped": skipped,
            "duplicates": dup[:20], "expiresInHours": KEEP_SECONDS // 3600}


class CheckRequest(BaseModel):
    projectId: str = "prj_default"
    glyphSetId: str


# 엔진 메시지 → 화면용 코드와 고치는 방법
FIX = [
    ("파일명", "FILENAME", "파일 이름을 글자 번호로 바꾸세요. 예: 가 → U+AC00.svg (글자 목록 CSV의 filename 열)"),
    ("transform", "TRANSFORM", "그리기 도구에서 그룹 해제·'변형 적용(Apply transform)' 후 다시 저장하세요"),
    ("지원하지 않는 도형", "SHAPE", "원·다각형 등은 '패스(경로)로 변환(Object to Path)' 후 저장하세요"),
    ("지원하지 않는 경로 명령", "COMMAND", "SVG 저장 옵션에서 경로 좌표를 '절대좌표(absolute)'로 바꾸세요. 호(A)는 곡선으로 변환"),
    ("viewBox", "VIEWBOX", "문서 크기를 1000 × 1000 으로 맞추고 다시 저장하세요"),
    ("밖으로", "OUT_OF_CANVAS", "모든 점이 0~1000 안에 오도록 글자를 옮기거나 줄이세요"),
    ("열린 경로", "OPEN_PATH", "선(stroke)은 '윤곽선으로 변환' 후 닫힌 도형(Z)으로 만드세요"),
    ("그려진 선이 없음", "EMPTY", "글자 모양이 path 또는 rect 로 들어 있는지 확인하세요"),
    ("형식 오류", "BROKEN", "SVG 파일이 깨졌습니다. 다시 내보내 주세요"),
    ("너무 큼", "TOO_BIG", "불필요한 점을 줄여 1MB 아래로 저장하세요"),
]


def _issue(name, msg, severity):
    code, fix = "OTHER", ""
    for key, c, f in FIX:
        if key in msg:
            code, fix = c, f
            break
    if severity == "warning" and "필수 목록에 없는" in msg:
        code, fix = "EXTRA_CHAR", "필수 글자는 아니지만 폰트에는 들어갑니다. 의도한 글자인지 확인하세요"
    return {"code": code, "severity": severity, "fileName": name, "message": msg, "suggestion": fix}


@router.post("/checks")
def run_check(req: CheckRequest, request: Request):
    from .main import now_iso
    d = _set_dir(req.glyphSetId)
    if not d:
        return _err(request, 404, "RESOURCE_NOT_FOUND", "올린 글리프가 서버에 없습니다(임시 보관 만료 또는 서버 재시작). 다시 올려 주세요.",
                    {"glyphSetId": req.glyphSetId}, retryable=True)
    cfg = _cfg(None)
    started = now_iso()
    r = checker.check_folder(d, cfg)
    issues = [_issue(n, m, "error") for n, m in r["problems"]] + [_issue(n, m, "warning") for n, m in r["warnings"]]
    svg_total = len([f for f in os.listdir(d) if f.lower().endswith(".svg")])
    # 엔진은 문제가 있어도 읽은 글자를 found 에 넣으므로, 문제 있는 파일은 '통과'에서 뺀다
    bad = {n for n, _ in r["problems"]}
    found = sorted(cp for cp in r["found"] if f"U+{cp:04X}.svg" not in bad and os.path.basename(r["found"][cp]) not in bad)
    cid = "chk_" + uuid.uuid4().hex[:12]
    result = {
        "checkId": cid, "glyphSetId": req.glyphSetId, "status": "succeeded",
        "startedAt": started, "finishedAt": now_iso(),
        "summary": {"total": svg_total, "passed": len(found), "errors": len(r["problems"]), "warnings": len(r["warnings"]),
                    "missing": len(r["missing"]), "required": r["required"]},
        "issues": issues,
        "ready": "".join(chr(cp) for cp in found),          # 통과한 글자 (문자열 한 줄로 가볍게)
        "missing": "".join(chr(cp) for cp in r["missing"]),  # 아직 없는 필수 글자
    }
    CHECKS[cid] = result
    if len(CHECKS) > 200:
        CHECKS.pop(next(iter(CHECKS)))
    return result


@router.get("/checks/{cid}")
def get_check(cid: str, request: Request):
    if cid not in CHECKS:
        return _err(request, 404, "RESOURCE_NOT_FOUND", "검수 결과를 찾을 수 없습니다. 다시 검수해 주세요.")
    return CHECKS[cid]


# ---- 연습용 파일 ----
GOOD = list("가나다라마바사아자차카타파하거너더러머버")


def _shape(i):
    """연습용 단순 도형 (실제 글자 디자인이 아님). 글자마다 조금씩 다르게."""
    a = 120 + (i % 5) * 30
    b = 880 - (i % 3) * 40
    return (f'<path d="M{a} 120 H{b} V220 H{a} Z"/>'
            f'<path d="M{a} 340 H{a + 110} V780 H{a} Z"/>'
            f'<path d="M{a + 220} 520 Q{(a + b) // 2} 420 {b} 520 V620 Q{(a + b) // 2} 540 {a + 220} 620 Z"/>')


def _svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">{body}</svg>'


def _sample_zip(kind):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for i, ch in enumerate(GOOD):
            z.writestr(f"glyphs/U+{ord(ch):04X}.svg", _svg(_shape(i)))
        if kind == "mixed":
            z.writestr("glyphs/가나.svg", _svg(_shape(0)))                                          # 파일명 규칙 위반
            z.writestr("glyphs/U+AC01.svg", _svg('<path d="M100 100 H1200 V700 H100 Z"/>'))         # 캔버스 밖
            z.writestr("glyphs/U+AC04.svg", _svg('<path d="M100 100 H900 V700 H100"/>'))            # 열린 경로
            z.writestr("glyphs/U+AC07.svg", _svg('<path d="m100 100 h800 v600 h-800 z"/>'))         # 상대좌표
            z.writestr("glyphs/U+AC08.svg", _svg('<g transform="scale(0.5)"><path d="M100 100 H900 V700 H100 Z"/></g>'))  # 변형
            z.writestr("glyphs/U+AC10.svg", _svg('<circle cx="500" cy="500" r="300"/>'))            # 원
            z.writestr("glyphs/U+AC11.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><path d="M10 10 H400 V400 H10 Z"/></svg>')  # 크기 다름
        z.writestr("glyphs/README.txt", "연습용 글리프입니다. 실제 글자 디자인이 아닌 단순 도형입니다.\n"
                                        + ("일부 파일은 일부러 규칙을 어겨 검수 결과를 보여 줍니다.\n" if kind == "mixed" else ""))
    return buf.getvalue()


@router.get("/samples/{name}.zip")
def sample(name: str, request: Request):
    if name not in ("good", "mixed"):
        return _err(request, 404, "RESOURCE_NOT_FOUND", "연습용 파일을 찾을 수 없습니다.")
    return Response(_sample_zip(name), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="glyphs_sample_{name}.zip"'})


@router.get("/templates/{cp}.svg")
def template(cp: str, request: Request):
    m = re.fullmatch(r"U\+([0-9A-F]{4,6})", cp.upper())
    if not m:
        return _err(request, 404, "RESOURCE_NOT_FOUND", "U+AC00 형식으로 요청해 주세요.")
    ch = chr(int(m.group(1), 16))
    code = f"U+{m.group(1)}"
    guide = (
        '<g id="guide" fill="none" stroke="#d85d3f" stroke-width="2" opacity="0.5">'
        '<rect x="0" y="0" width="1000" height="1000" stroke="#999"/>'
        '<line x1="0" y1="800" x2="1000" y2="800"/>'
        '<line x1="0" y1="100" x2="1000" y2="100" stroke-dasharray="12 10"/>'
        '<line x1="100" y1="0" x2="100" y2="1000" stroke-dasharray="12 10" stroke="#999"/>'
        '<line x1="900" y1="0" x2="900" y2="1000" stroke-dasharray="12 10" stroke="#999"/>'
        '<text x="10" y="790" font-size="24" fill="#d85d3f" stroke="none">baseline y=800</text>'
        f'<text x="10" y="990" font-size="24" fill="#999" stroke="none">{code} · 안내선(guide 레이어)은 글자로 읽지 않음</text>'
        '</g>'
    )
    body = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">\n'
            f'<!-- 글자: {ch} ({code}) / 파일 이름: {code}.svg -->\n'
            f'<!-- 글자는 아래 glyph 레이어에 채운 도형(path)으로 그리세요. 바닥선 y=800, 0~1000 안에서. -->\n'
            f'{guide}\n<g id="glyph">\n</g>\n</svg>\n')
    return Response(body, media_type="image/svg+xml; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{code}.svg"'})


# ---- 7단계: 올린 글자 보기 · 내려받기 · 교체 ----
from hangul_font_kit import svgread  # noqa: E402
from typing import List  # noqa: E402
from fastapi import Form  # noqa: E402

NAME_RE = re.compile(r"^U\+([0-9A-F]{4,6})\.svg$")


def _clean_svg(path):
    """사용자 SVG 를 그대로 보내지 않고, 엔진이 읽은 도형만으로 새로 그린 안전한 SVG (스크립트·외부 참조 제거)"""
    g = svgread.read_svg(path)
    parts = []
    for sp in g["subpaths"]:
        d = []
        for seg in sp["segs"]:
            k, v = seg[0], seg[1:]
            d.append(k + " " + " ".join(f"{x:g}" for x in v))
        parts.append(" ".join(d) + (" Z" if sp["closed"] else ""))
    d = " ".join(parts)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path fill="#20221f" fill-rule="nonzero" d="{d}"/></svg>'


@router.get("/glyphsets/{gid}/preview/{name}")
def glyph_preview(gid: str, name: str, request: Request):
    d = _set_dir(gid)
    if not d or not NAME_RE.match(name) or not os.path.isfile(os.path.join(d, name)):
        return _err(request, 404, "RESOURCE_NOT_FOUND", "글자 파일을 찾을 수 없습니다.")
    try:
        body = _clean_svg(os.path.join(d, name))
    except Exception:
        return _err(request, 422, "GLYPH_VALIDATION_FAILED", "이 파일은 읽을 수 없어 모양을 보여 줄 수 없습니다. 검수 결과를 확인하세요.")
    return Response(body, media_type="image/svg+xml", headers={"Cache-Control": "no-store"})


@router.get("/glyphsets/{gid}/files/{name}")
def glyph_original(gid: str, name: str, request: Request):
    d = _set_dir(gid)
    if not d or not SAFE_NAME.match(name) or name.startswith(".") or not os.path.isfile(os.path.join(d, name)):
        return _err(request, 404, "RESOURCE_NOT_FOUND", "글자 파일을 찾을 수 없습니다.")
    with open(os.path.join(d, name), "rb") as f:
        data = f.read()
    # 원본은 내려받기 전용 (브라우저에서 열려도 스크립트가 돌지 않게)
    return Response(data, media_type="image/svg+xml", headers={
        "Content-Disposition": f'attachment; filename="{name}"', "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store"})


@router.post("/glyphsets/{gid}/files")
async def replace_glyphs(gid: str, request: Request, files: List[UploadFile] = File(...), target: str | None = Form(default=None)):
    """고친 SVG 몇 개만 올려 바꾸기. target 을 주면(파일 1개일 때) 그 이름으로 저장 — 파일 이름을 몰라도 됨."""
    d = _set_dir(gid)
    if not d:
        return _err(request, 404, "RESOURCE_NOT_FOUND", "올린 글리프가 서버에 없습니다. zip을 다시 올려 주세요.", retryable=True)
    if len(files) > 50:
        return _err(request, 413, "PAYLOAD_TOO_LARGE", "한 번에 50개까지 바꿀 수 있습니다.")
    if target and (len(files) != 1 or not NAME_RE.match(target)):
        return _err(request, 400, "VALIDATION_ERROR", "이름 지정은 파일 1개, U+AC00.svg 형식일 때만 됩니다.")
    done, rejected = [], []
    for f in files:
        name = target or os.path.basename((f.filename or "").replace("\\", "/"))
        data = await f.read(MAX_SVG + 1)
        if not name.lower().endswith(".svg") or not SAFE_NAME.match(name) or name.startswith("."):
            rejected.append({"file": f.filename, "reason": "SVG 파일이 아님"}); continue
        if len(data) > MAX_SVG:
            rejected.append({"file": name, "reason": "1MB 초과"}); continue
        existed = os.path.isfile(os.path.join(d, name))
        with open(os.path.join(d, name), "wb") as out:
            out.write(data)
        done.append({"file": name, "action": "replaced" if existed else "added"})
    os.utime(d, None)  # 보관 시간 연장
    return {"glyphSetId": gid, "saved": done, "rejected": rejected}
