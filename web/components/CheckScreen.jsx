"use client";
// 검수 화면 (5단계): 글리프 zip 을 올려 실제 엔진으로 검사한다.
import { useMemo, useRef, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { PageHead, Card, Button, Result, Notice, StatusChip, IssueRow } from "./ui";

const fmtSize = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");

// 같은 zip 을 기억해 두고, 서버가 잊어버렸으면(무료 서버 재시작) 다시 올린다
// replacements: 글자 교체로 올린 파일들 — zip 을 다시 올릴 때 함께 다시 적용한다
export const zipMemory = { file: null, glyphSetId: null, replacements: {} };

async function postReplacement(gid, name, file) {
  const fd = new FormData();
  fd.append("files", file);
  fd.append("target", name);
  return api(`/glyphsets/${gid}/files`, { method: "POST", body: fd });
}

export async function ensureGlyphSet(file) {
  if (zipMemory.file === file && zipMemory.glyphSetId) return zipMemory.glyphSetId;
  if (zipMemory.file !== file) zipMemory.replacements = {};
  const fd = new FormData();
  fd.append("file", file);
  const up = await api("/glyphsets", { method: "POST", body: fd, timeout: 120000 });
  zipMemory.file = file;
  zipMemory.glyphSetId = up.glyphSetId;
  for (const [name, f] of Object.entries(zipMemory.replacements)) await postReplacement(up.glyphSetId, name, f);
  return up.glyphSetId;
}

// 글자 1개 교체: 서버에 저장하고 기억해 둔다 (서버가 잊어도 다시 적용되도록)
export async function replaceGlyph(name, file) {
  if (!zipMemory.file) throw new Error("먼저 검수 탭에서 글리프 zip을 올려 주세요.");
  let gid = await ensureGlyphSet(zipMemory.file);
  try { await postReplacement(gid, name, file); }
  catch (e) {
    if (e.status !== 404) throw e;
    zipMemory.glyphSetId = null; gid = await ensureGlyphSet(zipMemory.file); await postReplacement(gid, name, file);
  }
  zipMemory.replacements[name] = file;
  return api("/checks", { method: "POST", body: { projectId: "prj_0009", glyphSetId: gid } });
}

export function GuideCard({ open = false }) {
  return (
    <Card title="글리프 만드는 법" aside={<span className="badge">처음이라면</span>}>
      <details className="guide" open={open}>
        <summary>펼쳐서 보기 · 6단계</summary>
        <ol className="guide-steps">
          <li><b>만들 글자 확인</b><span>글리프 탭의 "글자 목록 CSV"에 필수 글자 2,438자와 파일 이름이 있습니다. 처음엔 몇 글자만 시험해도 됩니다.</span></li>
          <li><b>빈 템플릿 받기</b><span>글리프 탭에서 글자를 누르고 "빈 템플릿 받기" → 1000×1000 크기, 바닥선(y=800) 안내선이 들어 있습니다. 안내선(guide 레이어)은 글자로 읽히지 않습니다.</span></li>
          <li><b>그리기</b><span>무료 Inkscape, Figma, 일러스트레이터 등에서 <b>속이 채워진 도형</b>으로 그립니다. 선(stroke)으로 그렸다면 '윤곽선으로 변환'하세요.</span></li>
          <li><b>저장 전 정리</b><span>그룹 해제 · 변형 적용(Apply transform) · 원/다각형은 '패스로 변환'. Inkscape는 환경설정 → SVG 출력 → 경로 데이터를 <b>절대좌표</b>로.</span></li>
          <li><b>이름 붙여 모으기</b><span>파일 이름은 글자 번호: 가 → <code>U+AC00.svg</code>. 한 폴더에 모아 <b>zip으로 압축</b>합니다.</span></li>
          <li><b>올리고 검수</b><span>이 화면에서 zip을 올리면 규칙 위반을 찾아 고치는 법을 알려 줍니다.</span></li>
        </ol>
        <p className="muted">다른 폰트의 글자 모양을 따라 그리거나 변환하면 안 됩니다. 글자 디자인의 아름다움은 이 도구가 판단할 수 없습니다.</p>
      </details>
      <div className="dl-row">
        <a className="btn light" href={`${API_BASE}/api/v1/samples/good.zip`} download>⇩ 연습용 zip (정상 20자)</a>
        <a className="btn light" href={`${API_BASE}/api/v1/samples/mixed.zip`} download>⇩ 연습용 zip (틀린 파일 포함)</a>
      </div>
      <p className="muted" style={{ margin: "8px 0 0" }}>연습용은 단순 도형입니다. 받은 zip을 그대로 아래에 올려 검수를 체험해 보세요.</p>
    </Card>
  );
}

export function CheckScreen({ toast, engine, check, setCheck, go }) {
  const [file, setFile] = useState(zipMemory.file);
  const [phase, setPhase] = useState("idle"); // idle → uploading → checking
  const [err, setErr] = useState("");
  const [sev, setSev] = useState("error");
  const [shown, setShown] = useState(30);
  const inputRef = useRef();

  const pick = (e) => {
    const f = e.target.files?.[0];
    setErr("");
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) { setErr("zip 파일을 골라 주세요. (폴더를 압축한 파일)"); return; }
    if (f.size > 15 * 1024 * 1024) { setErr("15MB 이하 zip만 올릴 수 있습니다."); return; }
    setFile(f);
  };

  const run = async () => {
    if (!file) { setErr("먼저 글리프 zip 파일을 골라 주세요."); return; }
    setErr("");
    try {
      setPhase("uploading");
      let gid = await ensureGlyphSet(file);
      setPhase("checking");
      let r;
      try {
        r = await api("/checks", { method: "POST", body: { projectId: "prj_0009", glyphSetId: gid } });
      } catch (e) {
        if (e.status !== 404) throw e;
        zipMemory.glyphSetId = null; // 서버가 잊었으면 한 번 더 올림
        setPhase("uploading");
        gid = await ensureGlyphSet(file);
        setPhase("checking");
        r = await api("/checks", { method: "POST", body: { projectId: "prj_0009", glyphSetId: gid } });
      }
      setCheck({ ...r, fileName: file.name, checkedAt: new Date().toISOString() });
      setSev(r.summary.errors ? "error" : "warning");
      setShown(30);
      toast(r.summary.errors ? `검수 완료 · 고칠 곳 ${r.summary.errors}건` : "검수가 완료됐어요. 오류 0건을 확인했습니다.");
    } catch (e) {
      setErr(e.message + (e.requestId ? ` (요청 번호 ${e.requestId})` : ""));
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  const s = check?.summary;
  const issues = useMemo(() => (check?.issues || []).filter((i) => i.severity === sev), [check, sev]);
  const pct = s ? Math.round((s.passed / s.required) * 1000) / 10 : 0;

  return (
    <section className="screen active" id="check">
      <PageHead eyebrow="QUALITY CONTROL" title="SVG 규격 검수" desc="글리프 zip을 올리면 엔진이 규격을 검사합니다." badge="엔진 · check" />

      <Card title="글리프 zip 올리기" aside={<span className="badge">INPUT</span>}>
        <input ref={inputRef} type="file" accept=".zip,application/zip" onChange={pick} hidden id="zipInput" />
        <button className={"dropzone" + (file ? " has-file" : "")} onClick={() => inputRef.current?.click()} disabled={busy}>
          {file ? (<><b>🗜 {file.name}</b><small>{fmtSize(file.size)} · 눌러서 다른 파일 고르기</small></>)
            : (<><b>＋ zip 파일 고르기</b><small>U+AC00.svg 같은 SVG들을 압축한 파일 · 최대 15MB</small></>)}
        </button>
        {err && <div className="help error-text" role="alert" style={{ marginTop: 8 }}>✕ {err}</div>}
        <div className="checks">
          <label className="checkrow"><input type="checkbox" checked disabled readOnly /> 필수 글자 누락 · 파일명 U+XXXX.svg 규칙</label>
          <label className="checkrow"><input type="checkbox" checked disabled readOnly /> 크기 1000×1000 · 캔버스 밖으로 나간 점</label>
          <label className="checkrow"><input type="checkbox" checked disabled readOnly /> 열린 경로 · 상대좌표 · 변형 · 지원 안 하는 도형</label>
        </div>
        <Button onClick={run} loading={busy} disabled={engine.status === "offline"}>
          {phase === "uploading" ? "올리는 중…" : phase === "checking" ? "검사 중…" : "검수 실행 ↗"}
        </Button>
        {engine.status === "waking" && <Notice>무료 서버를 깨우는 중입니다. 30초~1분 뒤 눌러 주세요.</Notice>}
        {engine.status === "offline" && <Notice>엔진에 연결되지 않아 검수할 수 없습니다. 설정 탭에서 "다시 확인"을 눌러 주세요.</Notice>}
      </Card>

      {s && (
        <Card title="검수 결과" aside={s.errors ? <StatusChip status="error">고칠 곳 {s.errors}</StatusChip> : <StatusChip status="success">오류 0</StatusChip>}>
          <p className="muted" style={{ marginTop: 0 }}>{check.fileName} · {new Date(check.checkedAt).toLocaleString("ko-KR")}</p>
          <div className="countrow">
            <div><strong>{s.total}</strong><small>올린 SVG</small></div>
            <div className="ok"><strong>{s.passed}</strong><small>✓ 통과</small></div>
            <div className="bad"><strong>{s.errors}</strong><small>✕ 오류</small></div>
            <div className="warn"><strong>{s.warnings}</strong><small>△ 주의</small></div>
          </div>
          <div className="progress" aria-label={`필수 글자 ${s.required}자 중 ${s.passed}자 준비`}><span style={{ width: Math.min(100, pct) + "%" }} /></div>
          <p className="muted" style={{ margin: "6px 0 0" }}>필수 {s.required.toLocaleString()}자 중 <b>{s.passed.toLocaleString()}자 준비</b> ({pct}%) · 남은 글자 {s.missing.toLocaleString()}자</p>
          {s.errors === 0 && s.missing === 0 && <Result show><strong>✓ 검수가 완료됐어요. 오류 0건을 확인했습니다.</strong>빌드 탭에서 폰트를 만들 수 있습니다.</Result>}
          {s.errors === 0 && s.missing > 0 && <Result show tone="warning"><strong>△ 올린 파일에는 오류가 없습니다.</strong>아직 그리지 않은 필수 글자가 {s.missing.toLocaleString()}자 있어 정식 빌드는 멈춥니다. 시험용 빌드(누락 허용)는 가능합니다.</Result>}
          <button className="linkbtn" onClick={() => go("glyphs")}>글리프 탭에서 완료·누락 글자 보기 →</button>
        </Card>
      )}

      {s && (s.errors > 0 || s.warnings > 0) && (
        <Card title="문제 목록" aside={`${issues.length}건`}>
          <div className="filters" role="group" aria-label="심각도">
            <button className={"filter" + (sev === "error" ? " active" : "")} aria-pressed={sev === "error"} onClick={() => { setSev("error"); setShown(30); }}>✕ 오류 {s.errors}</button>
            <button className={"filter" + (sev === "warning" ? " active" : "")} aria-pressed={sev === "warning"} onClick={() => { setSev("warning"); setShown(30); }}>△ 주의 {s.warnings}</button>
          </div>
          <div style={{ marginTop: 6 }}>
            {issues.length === 0 && <p className="muted">해당하는 문제가 없습니다.</p>}
            {issues.slice(0, shown).map((i, k) => <IssueRow key={k} severity={i.severity} file={i.fileName} message={i.message} suggestion={i.suggestion} />)}
          </div>
          {issues.length > shown && <Button variant="light" onClick={() => setShown(shown + 50)}>더 보기 · 남은 {issues.length - shown}건</Button>}
        </Card>
      )}

      <GuideCard open={!s} />
    </section>
  );
}
