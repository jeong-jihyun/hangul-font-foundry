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
