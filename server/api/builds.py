"""폰트 빌드 작업 API (6단계) — 설계서 5.3·5.4·6장.

POST   /api/v1/builds        빌드 작업 만들기 → buildId (status: queued)
GET    /api/v1/builds/{id}   상태·단계별 진행·기록·산출물 목록
DELETE /api/v1/builds/{id}   취소 (대기 중이거나 단계 사이에서 멈춤)

오래 걸릴 수 있는 일이라 바로 작업 번호를 돌려주고 뒤에서 실행한다.
화면은 1초마다 GET 으로 상태를 묻는다. (queued → running → succeeded / failed / cancelled)
"""
import json
import os
import re
import shutil
import threading
import time
import uuid

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from hangul_font_kit import builder, checker, docs_draft, specimen
from hangul_font_kit.cli import _cfg

from .glyphs import STORE as GLYPH_STORE, _set_dir

router = APIRouter(prefix="/api/v1")

BUILD_STORE = os.environ.get("BUILD_STORE", "/tmp/glyphroom/builds")
TIMEOUT = 180            # 작업 하나 최대 3분 (넘으면 ENGINE_TIMEOUT)
KEEP_SECONDS = 6 * 3600  # 결과 임시 보관
BUILDS = {}
LOCK = threading.Lock()

STEPS = [
    ("check", "글리프 점검"),
    ("ttf", "TTF 폰트 만들기"),
    ("sheet", "글자 견본표 PNG"),
    ("sentence", "문장 미리보기 PNG"),
    ("pdf", "견본 PDF"),
    ("drafts", "상품 설명·라이선스 초안"),
]


class BuildRequest(BaseModel):
    projectId: str = "prj_default"
    glyphSetId: str
    allowMissing: bool = False
    familyName: str | None = Field(default=None, max_length=40)
    previewText: str | None = Field(default=None, max_length=80)


class Cancelled(Exception):
    pass


def _now():
    from .main import now_iso
    return now_iso()


def _err(request, status, code, message, details=None, retryable=False):
    from .main import error
    return error(request, status, code, message, details, retryable)


def _public(b):
    """화면에 보낼 모양 (서버 내부 경로는 숨김)"""
    return {k: v for k, v in b.items() if not k.startswith("_")}


def _cleanup():
    now = time.time()
    for bid, b in list(BUILDS.items()):
        if b["status"] in ("succeeded", "failed", "cancelled") and now - b["_t"] > KEEP_SECONDS:
            shutil.rmtree(b["_dir"], ignore_errors=True)
            BUILDS.pop(bid, None)


def _set_step(b, key, state, note=None):
    for s in b["steps"]:
        if s["key"] == key:
            s["state"] = state
            if note:
                s["note"] = note
    b["progress"] = round(100 * sum(1 for s in b["steps"] if s["state"] == "done") / len(b["steps"]))


def _log(b, text):
    b["log"].append({"t": _now(), "text": text})


def _run(bid):
    b = BUILDS[bid]
    start = time.time()

    def guard():
        if b["_cancel"]:
            raise Cancelled()
        if time.time() - start > TIMEOUT:
            raise TimeoutError()

    try:
        b["status"], b["startedAt"] = "running", _now()
        cfg = dict(_cfg(None))
        if b["_req"]["familyName"]:
            cfg["family_name"] = b["_req"]["familyName"]
        if b["_req"]["previewText"]:
            cfg["sample_sentence"] = b["_req"]["previewText"]
        out = b["_dir"]
        os.makedirs(out, exist_ok=True)

        guard(); _set_step(b, "check", "running")
        r = checker.check_folder(b["_glyphs"], cfg)
        if r["problems"]:
            _set_step(b, "check", "failed", f"고칠 곳 {len(r['problems'])}건")
            raise ValueError(("GLYPH_VALIDATION_FAILED", f"검수에서 고칠 곳 {len(r['problems'])}건이 있어 빌드를 멈췄습니다. 검수 탭에서 고친 뒤 다시 올려 주세요."))
        if r["missing"] and not b["_req"]["allowMissing"]:
            _set_step(b, "check", "failed", f"누락 {len(r['missing'])}자")
            raise ValueError(("GLYPH_VALIDATION_FAILED", f"아직 없는 필수 글자가 {len(r['missing']):,}자 있어 정식 빌드를 멈췄습니다. 시험용으로 만들려면 '누락 글리프 허용'을 켜세요."))
        _set_step(b, "check", "done", f"{len(r['found'])}자 사용" + (f" · 누락 {len(r['missing']):,}자 허용(시험용)" if r["missing"] else ""))
        _log(b, f"점검 통과: {len(r['found'])}자")

        guard(); _set_step(b, "ttf", "running")
        safe = builder.ps_name(cfg["family_name"])
        ttf = os.path.join(out, f"{safe}.ttf")
        n = builder.build_ttf(r["found"], cfg, ttf)
        _set_step(b, "ttf", "done", f"{n}자")
        _log(b, f"TTF 완성: {n}자")

        chars = [chr(cp) for cp in sorted(r["found"])]
        guard(); _set_step(b, "sheet", "running")
        sheet = os.path.join(out, "glyph_sheet.png")
        specimen.glyph_sheet(ttf, chars, sheet)
        _set_step(b, "sheet", "done")

        guard(); _set_step(b, "sentence", "running")
        sen_png = os.path.join(out, "sentence.png")
        sen = specimen.sentence_preview(ttf, cfg["sample_sentence"], set(chars), sen_png)
        _set_step(b, "sentence", "done", ("빠진 글자 □: " + "".join(sen["missing"])) if sen["missing"] else "모든 글자 있음")
        b["sentence"] = {"text": cfg["sample_sentence"], "missing": "".join(sen["missing"])}

        guard(); _set_step(b, "pdf", "running")
        pages = specimen.specimen_pdf_pages(os.path.join(out, "specimen.pdf"), ttf, chars, cfg["sample_sentence"], family=cfg["family_name"])
        _set_step(b, "pdf", "done", f"{pages}쪽")

        guard(); _set_step(b, "drafts", "running")
        with open(os.path.join(out, "license_draft.md"), "w", encoding="utf-8") as f:
            f.write(docs_draft.license_table())
        with open(os.path.join(out, "product_draft.md"), "w", encoding="utf-8") as f:
            f.write(docs_draft.product_draft(cfg["family_name"], n, r["required"], cfg["sample_sentence"]))
        _set_step(b, "drafts", "done", "초안 — 공개 전 전문가 확인 필요")

        kinds = {".ttf": "ttf", ".png": "png", ".pdf": "pdf", ".md": "draft"}
        b["artifacts"] = [{"type": kinds.get(os.path.splitext(fn)[1], "file"), "name": fn,
                           "size": os.path.getsize(os.path.join(out, fn)), "artifactId": f"art_{bid}_{i}"}
                          for i, fn in enumerate(sorted(os.listdir(out), key=lambda x: (not x.endswith(".ttf"), x)))]
        b["glyphCount"] = n
        b["chars"] = "".join(chars)  # 화면 미리보기에서 폰트에 없는 글자를 □로 표시하는 데 씀
        b["status"] = "succeeded"
        _log(b, "빌드 완료")
    except Cancelled:
        b["status"] = "cancelled"
        for s in b["steps"]:
            if s["state"] in ("running", "waiting"):
                s["state"] = "cancelled"
        _log(b, "사용자가 취소함")
    except TimeoutError:
        b["status"] = "failed"
        b["error"] = {"code": "ENGINE_TIMEOUT", "message": f"작업 시간이 {TIMEOUT}초를 넘어 멈췄습니다. 잠시 뒤 다시 시도해 주세요.", "retryable": True}
    except ValueError as e:
        b["status"] = "failed"
        if e.args and isinstance(e.args[0], tuple):
            code, msg = e.args[0]
            b["error"] = {"code": code, "message": msg, "retryable": False}
        else:
            b["error"] = {"code": "ENGINE_ERROR", "message": f"엔진 처리 중 오류: {e}", "retryable": True}
    except Exception as e:  # 예상 못한 오류: 내부 내용은 기록만, 화면엔 짧게
        b["status"] = "failed"
        b["error"] = {"code": "ENGINE_ERROR", "message": "엔진 처리 중 오류가 났습니다.", "retryable": True}
        _log(b, f"오류: {type(e).__name__}")
    finally:
        for s in b["steps"]:
            if b["status"] == "failed" and s["state"] in ("running",):
                s["state"] = "failed"
        b["finishedAt"] = _now()
        b["durationMs"] = int((time.time() - start) * 1000)
        b["_t"] = time.time()


@router.post("/builds")
def create_build(req: BuildRequest, request: Request):
    _cleanup()
    d = _set_dir(req.glyphSetId)
    if not d:
        return _err(request, 404, "RESOURCE_NOT_FOUND", "올린 글리프가 서버에 없습니다. 다시 올려 주세요.", {"glyphSetId": req.glyphSetId}, retryable=True)
    if req.familyName is not None and not req.familyName.strip():
        return _err(request, 400, "VALIDATION_ERROR", "글꼴 이름을 입력해 주세요.", {"fields": [{"field": "familyName", "reason": "빈 값"}]})
    with LOCK:
        for b in BUILDS.values():
            if b["glyphSetId"] == req.glyphSetId and b["status"] in ("queued", "running"):
                return _err(request, 409, "JOB_CONFLICT", "같은 글리프로 빌드가 이미 진행 중입니다.", {"buildId": b["buildId"]})
        bid = "bld_" + uuid.uuid4().hex[:12]
        BUILDS[bid] = {
            "buildId": bid, "glyphSetId": req.glyphSetId, "status": "queued", "allowMissing": req.allowMissing,
            "familyName": (req.familyName or "").strip() or _cfg(None)["family_name"],
            "createdAt": _now(), "startedAt": None, "finishedAt": None, "durationMs": None, "progress": 0,
            "steps": [{"key": k, "label": l, "state": "waiting"} for k, l in STEPS],
            "log": [], "artifacts": [], "error": None,
            "_dir": os.path.join(BUILD_STORE, bid), "_glyphs": d, "_cancel": False, "_t": time.time(),
            "_req": {"allowMissing": req.allowMissing, "familyName": (req.familyName or "").strip() or None, "previewText": req.previewText},
        }
    threading.Thread(target=_run, args=(bid,), daemon=True).start()
    return {"buildId": bid, "status": "queued"}


@router.get("/builds/{bid}")
def get_build(bid: str, request: Request):
    b = BUILDS.get(bid)
    if not b:
        return _err(request, 404, "RESOURCE_NOT_FOUND", "빌드 작업을 찾을 수 없습니다(서버 재시작 또는 보관 시간 만료). 다시 빌드해 주세요.", retryable=True)
    return _public(b)


@router.delete("/builds/{bid}")
def cancel_build(bid: str, request: Request):
    b = BUILDS.get(bid)
    if not b:
        return _err(request, 404, "RESOURCE_NOT_FOUND", "빌드 작업을 찾을 수 없습니다.")
    if b["status"] not in ("queued", "running"):
        return _err(request, 409, "JOB_CONFLICT", "이미 끝난 작업이라 취소할 수 없습니다.", {"status": b["status"]})
    b["_cancel"] = True
    return {"buildId": bid, "status": "cancelling"}


MEDIA = {".ttf": "font/ttf", ".png": "image/png", ".pdf": "application/pdf", ".md": "text/markdown; charset=utf-8"}


def artifact_file(aid):
    """art_bld_xxx_N → (경로, 파일 이름, 형식). 없으면 None"""
    m = re.fullmatch(r"art_(bld_[0-9a-f]{12})_(\d+)", aid or "")
    if not m or m.group(1) not in BUILDS:
        return None
    b = BUILDS[m.group(1)]
    for a in b["artifacts"]:
        if a["artifactId"] == aid:
            path = os.path.join(b["_dir"], a["name"])
            if os.path.isfile(path):
                return path, a["name"], MEDIA.get(os.path.splitext(a["name"])[1], "application/octet-stream")
    return None


@router.get("/builds/{bid}/bundle.zip")
def bundle(bid: str, request: Request):
    """빌드 결과를 한 번에 받기 (zip)"""
    import io
    import zipfile
    from fastapi.responses import Response
    b = BUILDS.get(bid)
    if not b or b["status"] != "succeeded":
        return _err(request, 404, "RESOURCE_NOT_FOUND", "받을 결과가 없습니다(보관 6시간 만료 또는 재시작). 다시 만들어 주세요.", retryable=True)
    buf = io.BytesIO()
    safe = builder.ps_name(b["familyName"])
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for a in b["artifacts"]:
            p = os.path.join(b["_dir"], a["name"])
            if os.path.isfile(p):
                z.write(p, f"{safe}/{a['name']}")
        z.writestr(f"{safe}/README.txt", "글꼴: " + b["familyName"] + f"\n글자 수: {b.get('glyphCount')}\n"
                   "- .ttf: 폰트 파일 (설치용)\n- specimen.pdf: 견본\n- glyph_sheet.png / sentence.png: 미리보기 그림\n"
                   "- license_draft.md / product_draft.md: 초안 (공개 전 전문가 확인 필요)\n")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{safe}_font.zip"'})
