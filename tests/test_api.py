"""API 서버 시험 (3단계: 뼈대)."""
from fastapi.testclient import TestClient

from server.api.main import app

c = TestClient(app)


def test_health_ok():
    r = c.get("/api/v1/health")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok" and j["engineVersion"]
    assert j["libraries"]["fontTools"]
    assert r.headers["X-Request-Id"].startswith("req_")


def test_not_found_uses_standard_error():
    r = c.get("/api/v1/nope")
    assert r.status_code == 404
    e = r.json()["error"]
    assert e["code"] == "RESOURCE_NOT_FOUND" and e["requestId"].startswith("req_")
    assert set(e) == {"code", "message", "details", "retryable", "requestId"}


def test_cors_allows_web_app_only():
    ok = c.get("/api/v1/health", headers={"Origin": "https://hangul-font-foundry.vercel.app"})
    assert ok.headers.get("access-control-allow-origin") == "https://hangul-font-foundry.vercel.app"
    bad = c.get("/api/v1/health", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in bad.headers


def test_charset_create_and_get_matches_engine():
    from hangul_font_kit import charset
    r = c.post("/api/v1/charsets", json={"projectId": "prj_0009"})
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "succeeded" and j["counts"]["hangul"] == 2350
    assert j["counts"]["total"] == len(charset.required_chars())
    g = c.get(f"/api/v1/charsets/{j['charsetId']}").json()
    assert len(g["items"]) == j["counts"]["total"]
    assert g["items"][0] == {"char": "가", "codepoint": "U+AC00", "filename": "U+AC00.svg", "group": "hangul"}
    assert len({i["codepoint"] for i in g["items"]}) == len(g["items"])  # 중복 없음 (TC-01)


def test_charset_validation_and_not_found():
    r = c.post("/api/v1/charsets", json={"includeHangul2350": False, "includeLatinDigitsSymbols": False})
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert c.get("/api/v1/charsets/cs_bad").status_code == 404


def test_charset_csv_download():
    r = c.get("/api/v1/artifacts/art_cs_h1_b0_csv/download")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    lines = r.content.decode("utf-8-sig").splitlines()
    assert lines[0] == "character,codepoint,filename" and len(lines) == 2351
    assert c.get("/api/v1/artifacts/art_x/download").status_code == 404
