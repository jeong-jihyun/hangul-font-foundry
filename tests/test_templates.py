"""연습용 OFL 도안 5종: zip 내용, 검수 통과, OFL 빌드(라이선스 파일·예약 이름)."""
import io
import json
import os
import zipfile

from fastapi.testclient import TestClient

from hangul_font_kit import checker, templates
from hangul_font_kit.cli import _cfg
from server.api.main import app

ROOT = os.path.join(os.path.dirname(__file__), "..")
TPL = os.path.join(ROOT, "web", "public", "templates")
c = TestClient(app)


def test_index_matches_templates_and_full_charset():
    idx = json.load(open(os.path.join(TPL, "index.json"), encoding="utf-8"))
    assert [i["key"] for i in idx] == list(templates.TEMPLATES)
    for i in idx:
        assert i["count"] == 2438 and i["missing"] == "" and i["license"] == "OFL-1.1"
        z = zipfile.ZipFile(os.path.join(TPL, i["key"] + ".zip"))
        names = set(z.namelist())
        assert "OFL.txt" in names and "U+AC00.svg" in names and "U+0020.svg" in names
        assert len([n for n in names if n.endswith(".svg")]) == 2438


def test_template_zip_passes_checker(tmp_path):
    zipfile.ZipFile(os.path.join(TPL, "dotum.zip")).extractall(tmp_path)
    r = checker.check_folder(str(tmp_path), _cfg(None))
    assert r["problems"] == [] and r["missing"] == [] and len(r["found"]) == 2438


def _gid_from(zbytes):
    return c.post("/api/v1/glyphsets", files={"file": ("t.zip", zbytes, "application/zip")}).json()["glyphSetId"]


def _small_template_zip():
    src = zipfile.ZipFile(os.path.join(TPL, "gungsuh.zip"))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for n in ["U+AC00.svg", "U+B098.svg", "U+0041.svg", "U+0020.svg"]:
            z.writestr(n, src.read(n))
    return buf.getvalue()


def test_ofl_build_adds_license_and_name_fields():
    from fontTools.ttLib import TTFont
    from tests.test_api import _wait
    b = _wait(c.post("/api/v1/builds", json={"glyphSetId": _gid_from(_small_template_zip()), "allowMissing": True,
                                             "familyName": "연습궁서", "oflBases": ["gungsuh"]}).json()["buildId"])
    assert b["status"] == "succeeded"
    arts = {a["name"]: a for a in b["artifacts"]}
    assert "OFL.txt" in arts
    lic = c.get(f"/api/v1/artifacts/{arts['OFL.txt']['artifactId']}/download").text
    assert "Batang and Gungsuh Project Authors" in lic and "SIL Open Font License" in lic
    draft = c.get(f"/api/v1/artifacts/{arts['license_draft.md']['artifactId']}/download").text
    assert "불가" in draft and "OFL" in draft
    ttf = [a for a in b["artifacts"] if a["name"].endswith(".ttf")][0]
    f = TTFont(io.BytesIO(c.get(f"/api/v1/artifacts/{ttf['artifactId']}/download").content))
    assert "Open Font License" in f["name"].getDebugName(13)


def test_ofl_reserved_name_and_unknown_template_rejected():
    gid = _gid_from(_small_template_zip())
    r = c.post("/api/v1/builds", json={"glyphSetId": gid, "allowMissing": True, "familyName": "My Nanum 2", "oflBases": ["gothic"]})
    assert r.status_code == 400 and "Nanum" in r.json()["error"]["message"]
    r = c.post("/api/v1/builds", json={"glyphSetId": gid, "allowMissing": True, "oflBases": ["comic"]})
    assert r.status_code == 400
