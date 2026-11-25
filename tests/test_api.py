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


def _upload(content, name="g.zip"):
    return c.post("/api/v1/glyphsets", files={"file": (name, content, "application/zip")})


def test_sample_upload_and_check_mixed():
    z = c.get("/api/v1/samples/mixed.zip")
    assert z.status_code == 200
    up = _upload(z.content).json()
    assert up["svgCount"] == 27 and up["skipped"] == 1  # README.txt 건너뜀
    r = c.post("/api/v1/checks", json={"glyphSetId": up["glyphSetId"]}).json()
    s = r["summary"]
    assert s["passed"] == 20 and s["errors"] == 8 and s["required"] == 2438
    codes = {i["code"] for i in r["issues"] if i["severity"] == "error"}
    assert {"FILENAME", "OUT_OF_CANVAS", "OPEN_PATH", "COMMAND", "TRANSFORM", "SHAPE", "VIEWBOX"} <= codes
    assert all(i["suggestion"] for i in r["issues"])
    assert "가" in r["ready"] and "힝" in r["missing"]
    assert c.get(f"/api/v1/checks/{r['checkId']}").json()["summary"] == s


def test_upload_rejects_bad_input():
    assert _upload(b"not a zip").json()["error"]["code"] == "VALIDATION_ERROR"
    import io, zipfile
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("../../evil.txt", "x")
    assert _upload(b.getvalue()).status_code == 400  # SVG 없음 + 경로 탈출 파일은 무시
    assert c.post("/api/v1/checks", json={"glyphSetId": "gs_0000000000000000"}).status_code == 404


def test_template_is_valid_empty_glyph():
    r = c.get("/api/v1/templates/U+AC00.svg")
    assert r.status_code == 200 and 'id="guide"' in r.text
    import tempfile, os
    from hangul_font_kit import svgread
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False, encoding="utf-8") as f:
        f.write(r.text)
    g = svgread.read_svg(f.name); os.unlink(f.name)
    assert g["subpaths"] == [] and g["unsupported"] == []  # 안내선은 글자로 읽히지 않음


def _wait(bid, until=("succeeded", "failed", "cancelled"), limit=60):
    import time
    for _ in range(limit * 10):
        b = c.get(f"/api/v1/builds/{bid}").json()
        if b["status"] in until:
            return b
        time.sleep(0.1)
    raise AssertionError("빌드가 끝나지 않음")


def _gid(kind):
    return _upload(c.get(f"/api/v1/samples/{kind}.zip").content).json()["glyphSetId"]


def test_build_good_sample_with_allow_missing():
    g = _gid("good")
    r = c.post("/api/v1/builds", json={"glyphSetId": g, "allowMissing": True, "familyName": "나의 글꼴"})
    assert r.status_code == 200 and r.json()["status"] == "queued"
    b = _wait(r.json()["buildId"])
    assert b["status"] == "succeeded" and b["progress"] == 100 and b["glyphCount"] == 20
    names = [a["name"] for a in b["artifacts"]]
    assert names[0].endswith(".ttf") and {"glyph_sheet.png", "specimen.pdf", "license_draft.md", "product_draft.md"} <= set(names)
    assert all(s["state"] == "done" for s in b["steps"]) and "_dir" not in b  # 서버 경로 숨김


def test_build_stops_on_missing_and_problems():  # TC-06
    b = _wait(c.post("/api/v1/builds", json={"glyphSetId": _gid("good")}).json()["buildId"])
    assert b["status"] == "failed" and b["error"]["code"] == "GLYPH_VALIDATION_FAILED" and "누락" in b["error"]["message"]
    b = _wait(c.post("/api/v1/builds", json={"glyphSetId": _gid("mixed"), "allowMissing": True}).json()["buildId"])
    assert b["status"] == "failed" and "고칠 곳" in b["error"]["message"]


def test_build_not_found_and_validation():
    assert c.post("/api/v1/builds", json={"glyphSetId": "gs_0000000000000000"}).status_code == 404
    assert c.post("/api/v1/builds", json={"glyphSetId": _gid("good"), "familyName": "  "}).status_code == 400
    assert c.get("/api/v1/builds/bld_nope").status_code == 404


def test_build_artifact_download_and_pdf_pages():
    from pypdf import PdfReader
    import io
    g = _gid("good")
    b = _wait(c.post("/api/v1/builds", json={"glyphSetId": g, "allowMissing": True}).json()["buildId"])
    arts = {a["name"]: a for a in b["artifacts"]}
    ttf = c.get(f"/api/v1/artifacts/{arts['MyHangulFont.ttf']['artifactId']}/download")
    assert ttf.status_code == 200 and ttf.headers["content-type"] == "font/ttf" and ttf.content[:4] == b"\x00\x01\x00\x00"
    pdf = c.get(f"/api/v1/artifacts/{arts['specimen.pdf']['artifactId']}/download?inline=1")
    assert pdf.headers["content-disposition"].startswith("inline") and len(PdfReader(io.BytesIO(pdf.content)).pages) == 2
    assert c.get("/api/v1/artifacts/art_bld_000000000000_0/download").status_code == 404


def test_glyph_preview_original_and_replace():
    g = _gid("mixed")
    p = c.get(f"/api/v1/glyphsets/{g}/preview/U+AC00.svg")
    assert p.status_code == 200 and p.text.startswith("<svg") and "<script" not in p.text
    o = c.get(f"/api/v1/glyphsets/{g}/files/U+AC01.svg")
    assert "attachment" in o.headers["content-disposition"] and "default-src 'none'" in o.headers["content-security-policy"]
    # 캔버스 밖 글자를 고친 파일로 교체 (파일 이름이 달라도 target 으로 맞춤)
    fixed = RECT_OK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="M100 100 H900 V700 H100 Z"/></svg>'
    r = c.post(f"/api/v1/glyphsets/{g}/files", files=[("files", ("내가고친것.svg", fixed, "image/svg+xml"))], data={"target": "U+AC01.svg"}).json()
    assert r["saved"] == [{"file": "U+AC01.svg", "action": "replaced"}]
    chk = c.post("/api/v1/checks", json={"glyphSetId": g}).json()
    assert chk["summary"]["errors"] == 7 and "각" in chk["ready"]
    bad = c.post(f"/api/v1/glyphsets/{g}/files", files=[("files", ("a.txt", "x", "text/plain"))]).json()
    assert bad["rejected"] and not bad["saved"]
