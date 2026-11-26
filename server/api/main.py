"""Glyphroom API 서버 (설계서: /api/v1).

화면(웹앱)과 기존 파이썬 엔진(hangul_font_kit)을 잇는 서버 계층.
3단계: 서버 뼈대 — 상태 확인, 공통 오류 형식, 요청 번호(requestId).
실제 charset/check/build 실행은 4~7단계에서 붙인다.
"""
import os
import platform
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

import hangul_font_kit

API_VERSION = "1.0.0"
STARTED_AT = datetime.now(timezone.utc)

app = FastAPI(title="Glyphroom API", version=API_VERSION, docs_url="/api/v1/docs", openapi_url="/api/v1/openapi.json")

# 웹앱 주소에서만 부르도록 허용 (Vercel 운영·미리보기 주소, 로컬 개발)
ALLOWED = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "https://hangul-font-foundry.vercel.app,http://localhost:3000,http://localhost:3100").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED,
    allow_origin_regex=r"https://hangul-font-foundry-[a-z0-9-]+-jeong-jihyuns-projects\.vercel\.app",
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
    expose_headers=["X-Request-Id", "Content-Disposition"],
    max_age=600,
)


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@app.middleware("http")
async def request_id(request: Request, call_next):
    rid = "req_" + uuid.uuid4().hex[:12]
    request.state.rid = rid
    resp = await call_next(request)
    resp.headers["X-Request-Id"] = rid
    return resp


def error(request: Request, status: int, code: str, message: str, details=None, retryable=False):
    """설계서 7장 오류 형식: code, message, details, retryable + requestId. 내부 스택은 노출하지 않는다."""
    body = {"error": {"code": code, "message": message, "details": details or {}, "retryable": retryable,
                      "requestId": getattr(request.state, "rid", None)}}
    return JSONResponse(body, status_code=status)


CODE_BY_STATUS = {400: "VALIDATION_ERROR", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "RESOURCE_NOT_FOUND",
                  405: "VALIDATION_ERROR", 409: "JOB_CONFLICT", 413: "PAYLOAD_TOO_LARGE"}


@app.exception_handler(StarletteHTTPException)
async def http_err(request: Request, exc: StarletteHTTPException):
    code = CODE_BY_STATUS.get(exc.status_code, "ENGINE_ERROR")
    msg = "요청한 주소를 찾을 수 없습니다." if exc.status_code == 404 else str(exc.detail)
    return error(request, exc.status_code, code, msg)


@app.exception_handler(RequestValidationError)
async def validation_err(request: Request, exc: RequestValidationError):
    fields = [{"field": ".".join(str(x) for x in e.get("loc", [])[1:]), "reason": e.get("msg")} for e in exc.errors()]
    return error(request, 400, "VALIDATION_ERROR", "입력값을 확인해 주세요.", {"fields": fields})


@app.exception_handler(Exception)
async def unknown_err(request: Request, exc: Exception):
    return error(request, 500, "ENGINE_ERROR", "서버 처리 중 오류가 났습니다. 잠시 뒤 다시 시도해 주세요.", retryable=True)


@app.get("/")
def root():
    return {"service": "glyphroom-api", "docs": "/api/v1/docs", "health": "/api/v1/health"}


@app.get("/api/v1/health")
def health():
    """엔진 연결 상태. 화면의 'ENGINE ONLINE' 표시와 설정 화면 엔진 카드가 이 응답을 쓴다."""
    libs = {}
    for name in ("fontTools", "PIL", "reportlab", "pypdf"):
        try:
            mod = __import__(name)
            libs[name] = getattr(mod, "__version__", "ok")
        except Exception:
            libs[name] = None
    return {
        "status": "ok",
        "apiVersion": API_VERSION,
        "engineVersion": hangul_font_kit.__version__,
        "python": platform.python_version(),
        "libraries": libs,
        "startedAt": STARTED_AT.isoformat().replace("+00:00", "Z"),
        "time": now_iso(),
    }


# 기능별 API (단계마다 추가)
from .charsets import router as charsets_router  # noqa: E402

app.include_router(charsets_router)

from .glyphs import router as glyphs_router  # noqa: E402

app.include_router(glyphs_router)

from .builds import router as builds_router  # noqa: E402

app.include_router(builds_router)
