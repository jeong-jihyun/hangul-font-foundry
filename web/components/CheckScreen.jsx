"use client";
// 검수 화면: 글리프 zip 을 올려 실제 엔진으로 검사한다. (11단계) 올리기 전에 zip 안 SVG 를 자동 정리한다.
import { useMemo, useRef, useState } from "react";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { normalizeSvg } from "../lib/glyph/normalize";

// zip 안의 글자 SVG 를 규칙 모양으로 정리해 새 zip 으로 (정리 못 한 파일은 그대로 두어 검수에서 이유를 알려 줌)
// 새 zip 을 기존 글자(이 기기 zip·고친 글자·GitHub 저장분)에 합치기: 같은 이름만 새 것으로, 나머지는 그대로
export async function mergeWithExisting(newFile) {
  let base = zipMemory.file;
  if (!base && zipMemory.loader) base = await zipMemory.loader();
  const out = {};
  const NAME = /^U\+[0-9A-F]{4,6}\.svg$/;
  if (base) {
    for (const [path, data] of Object.entries(unzipSync(new Uint8Array(await base.arrayBuffer())))) {
      const n = path.split("/").pop();
      if (NAME.test(n) && !path.includes("__MACOSX")) out[n] = data;
    }
  }
  for (const [n, f] of Object.entries(zipMemory.replacements)) out[n] = new Uint8Array(await f.arrayBuffer());
  const before = Object.keys(out).length;
  let added = 0;
  for (const [path, data] of Object.entries(unzipSync(new Uint8Array(await newFile.arrayBuffer())))) {
    if (path.endsWith("/") || path.includes("__MACOSX")) continue;
    const n = path.split("/").pop();
    if (NAME.test(n)) { if (!out[n]) added++; out[n] = data; } else out[path] = data; // 이름이 틀린 파일은 검수에서 알려 주도록 그대로
  }
  return { file: new File([zipSync(out, { level: 6 })], newFile.name, { type: "application/zip" }), before, added };
}

export async function tidyZip(f) {
  // 압축을 풀면 크기가 터무니없이 커지는 파일(압축 폭탄) 막기: 파일당 1MB, 합계 80MB
  let total = 0;
  const files = unzipSync(new Uint8Array(await f.arrayBuffer()), {
    filter: (x) => { total += x.originalSize; if (total > 80 * 1024 * 1024) throw new Error("too big"); return x.originalSize <= 1_000_000; },
  });
  const out = {};
  let tidied = 0, kept = 0;
  const kinds = new Set();
  for (const [path, data] of Object.entries(files)) {
    if (path.endsWith("/") || path.includes("__MACOSX")) continue;
    const base = path.split("/").pop();
    if (!/\.svg$/i.test(base) || data.length > 1_000_000) { out[path] = data; continue; }
    const text = strFromU8(data);
    const r = normalizeSvg(text);
    if (r.svg && !r.problems.length) {
      out[path] = strToU8(r.svg);
      if (r.notes.length) { tidied++; r.notes.forEach((n) => kinds.add(n.replace(/\(.*?\)/g, "").slice(0, 24))); }
    } else { out[path] = data; kept++; }
  }
  const z = zipSync(out, { level: 6 });
  return { file: new File([z], f.name, { type: "application/zip" }), tidied, kept, kinds: [...kinds].slice(0, 3) };
}
import { API_BASE, api } from "../lib/api";
import { PageHead, Card, Button, Result, Notice, StatusChip, IssueRow } from "./ui";

const fmtSize = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");

// 같은 zip 을 기억해 두고, 서버가 잊어버렸으면(무료 서버 재시작) 다시 올린다
// replacements: 글자 교체로 올린 파일들 — zip 을 다시 올릴 때 함께 다시 적용한다
// loader: 저장된 프로젝트에서 zip 을 다시 만드는 함수 (8단계, 로그인 시)
export const zipMemory = { file: null, glyphSetId: null, replacements: {}, removed: [], loader: null };
export const hasGlyphSource = () => !!(zipMemory.file || zipMemory.loader);

async function postReplacement(gid, name, file) {
  const fd = new FormData();
  fd.append("files", file);
  fd.append("target", name);
  return api(`/glyphsets/${gid}/files`, { method: "POST", body: fd });
}

export async function ensureGlyphSet(file) {
  if (!file && zipMemory.loader) {
    // 이 기기에 zip 이 없으면 저장된 글자로 다시 만든다
    file = await zipMemory.loader();
    if (!file) throw new Error("저장된 글자가 없습니다. 검수 탭에서 글리프 zip을 올려 주세요.");
    zipMemory.file = file; zipMemory.replacements = {}; zipMemory.removed = [];
  }
  if (!file) throw new Error("먼저 검수 탭에서 글리프 zip을 올려 주세요.");
  if (zipMemory.file === file && zipMemory.glyphSetId) return zipMemory.glyphSetId;
  if (zipMemory.file !== file) { zipMemory.replacements = {}; zipMemory.removed = []; }
  const fd = new FormData();
  fd.append("file", file);
  const up = await api("/glyphsets", { method: "POST", body: fd, timeout: 120000 });
  zipMemory.file = file;
  zipMemory.glyphSetId = up.glyphSetId;
  for (const [name, f] of Object.entries(zipMemory.replacements)) await postReplacement(up.glyphSetId, name, f);
  for (const name of zipMemory.removed) { try { await api(`/glyphsets/${up.glyphSetId}/files/${encodeURIComponent(name)}`, { method: "DELETE" }); } catch {} }
  return up.glyphSetId;
}

// 잘못 들어간 파일 빼기 (이름 규칙 위반 등) → 다시 검수
export async function removeFile(name) {
  if (!hasGlyphSource()) throw new Error("먼저 위에서 글리프 zip을 골라 검수해 주세요.");
  const gid = await ensureGlyphSet(zipMemory.file);
  await api(`/glyphsets/${gid}/files/${encodeURIComponent(name)}`, { method: "DELETE" });
  zipMemory.removed.push(name);
  delete zipMemory.replacements[name];
  return api("/checks", { method: "POST", body: { projectId: "prj_0009", glyphSetId: gid } });
}

// 글자 1개 교체: 서버에 저장하고 기억해 둔다 (서버가 잊어도 다시 적용되도록)
export async function replaceGlyph(name, file) {
  if (!hasGlyphSource()) throw new Error("먼저 검수 탭에서 글리프 zip을 올려 주세요.");
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
    <Card title="글자 만드는 두 가지 방법" aside={<span className="badge">처음이라면</span>}>
      <details className="guide" open={open}>
        <summary>펼쳐서 보기</summary>
        <ol className="guide-steps">
          <li><b>앱에서 바로 그리기 (추천)</b><span>글리프 탭 → 글자 누르기 → <b>✎ 이 글자 그리기</b> → 펜·사각형·원으로 그리고 <b>저장</b>. 저장하면 자동으로 검수되고 GitHub에 남습니다. 손글씨 사진을 '밑그림'으로 깔고 따라 그릴 수 있습니다.</span></li>
          <li><b>다른 프로그램에서 그리기</b><span>일러스트레이터·Inkscape·Figma 등에서 <b>속이 채워진 도형</b>으로 그립니다. 선(stroke)으로 그렸다면 '윤곽선으로 변환'만 해 주세요. 그룹·변형·원·상대좌표·크기 차이는 올릴 때 <b>자동 정리</b>됩니다.</span></li>
          <li><b>이름 붙여 zip으로</b><span>파일 이름은 글자 번호: 가 → <code>U+AC00.svg</code> (글리프 탭의 "글자 목록 CSV"에 2,438자 이름이 있음). 한 폴더에 모아 zip으로 압축해 위에 올립니다. 한두 글자는 글리프 탭의 'SVG 파일 올리기'로 바로 넣어도 됩니다.</span></li>
          <li><b>고치기</b><span>검수에서 문제가 나온 글자는 '편집기에서 이 글자 고치기'를 누르면 바로 열립니다.</span></li>
        </ol>
        <p className="muted">다른 폰트의 글자 모양을 따라 그리거나 변환하면 안 됩니다. 글자 디자인의 아름다움은 이 도구가 판단할 수 없습니다.</p>
      </details>
      <div className="dl-row">
        <a className="btn light" href={`${API_BASE}/api/v1/samples/good.zip`} download>⇩ 연습용 zip (정상 20자)</a>
        <a className="btn light" href={`${API_BASE}/api/v1/samples/mixed.zip`} download>⇩ 연습용 zip (틀린 파일 포함)</a>
      </div>
      <p className="muted" style={{ margin: "8px 0 0" }}>연습용은 단순 도형입니다. 받은 zip을 그대로 위에 올려 검수를 체험해 보세요.</p>
    </Card>
  );
}

export function CheckScreen({ toast, engine, check, setCheck, go, onZipChecked, onFileRemoved, openEditor }) {
  const [file, setFile] = useState(zipMemory.file);
  const [phase, setPhase] = useState("idle"); // idle → uploading → checking
  const [err, setErr] = useState("");
  const [sev, setSev] = useState("error");
  const [shown, setShown] = useState(30);
  const [tidy, setTidy] = useState(null);
  const [picked, setPicked] = useState(false);       // 이번에 새로 고른 zip 인지
  const [replaceAll, setReplaceAll] = useState(false); // 기존 글자 지우고 이 zip 으로만
  const hasExisting = !!(zipMemory.file || zipMemory.loader || Object.keys(zipMemory.replacements).length);
  const inputRef = useRef();

  const pick = (e) => {
    const f = e.target.files?.[0];
    setErr("");
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) { setErr("zip 파일을 골라 주세요. (폴더를 압축한 파일)"); return; }
    if (f.size > 15 * 1024 * 1024) { setErr("15MB 이하 zip만 올릴 수 있습니다."); return; }
    setTidy(null);
    setPicked(true); setReplaceAll(false);
    tidyZip(f).then((t) => { setFile(t.file); setTidy(t); })
      .catch(() => { setFile(f); setTidy({ failed: true }); }); // 정리 못 하면 원래 파일 그대로 검수
  };

  const run = async () => {
    if (!file && !zipMemory.loader) { setErr("먼저 글리프 zip 파일을 골라 주세요."); return; }
    setErr("");
    try {
      setPhase("uploading");
      let use = file;
      let merged = null;
      if (picked && file && file !== zipMemory.file && hasExisting && !replaceAll) {
        merged = await mergeWithExisting(file); // 그려 둔 글자가 사라지지 않게 합치기
        use = merged.file;
      }
      let gid = await ensureGlyphSet(use || null);
      const usedName = merged ? `${file.name} + 기존 글자` : (use || zipMemory.file)?.name || "저장된 글자";
      setPhase("checking");
      let r;
      try {
        r = await api("/checks", { method: "POST", body: { projectId: "prj_0009", glyphSetId: gid } });
      } catch (e) {
        if (e.status !== 404) throw e;
        zipMemory.glyphSetId = null; // 서버가 잊었으면 한 번 더 올림
        setPhase("uploading");
        gid = await ensureGlyphSet(use || zipMemory.file);
        setPhase("checking");
        r = await api("/checks", { method: "POST", body: { projectId: "prj_0009", glyphSetId: gid } });
      }
      setCheck({ ...r, fileName: usedName, checkedAt: new Date().toISOString() });
      if (picked && file) onZipChecked?.(file, { replaceAll }); // 새로 고른 zip 의 글자만 저장(기본: 합치기)
      setPicked(false);
      if (merged) setFile(zipMemory.file);
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
      <PageHead eyebrow="QUALITY CONTROL" title="SVG 규격 검수" desc="앱에서 그린 글자는 저장할 때 자동으로 검수됩니다. 다른 프로그램에서 만든 글자는 zip으로 올리세요." badge="엔진 · check" />

      <Card title="글리프 zip 올리기" aside={<span className="badge">INPUT</span>}>
        <input ref={inputRef} type="file" accept=".zip,application/zip" onChange={pick} hidden id="zipInput" />
        <button className={"dropzone" + (file ? " has-file" : "")} onClick={() => inputRef.current?.click()} disabled={busy}>
          {file ? (<><b>🗜 {file.name}</b><small>{fmtSize(file.size)} · 눌러서 다른 파일 고르기</small></>)
            : zipMemory.loader ? (<><b>☁ 저장된 글자 사용</b><small>그대로 "검수 실행"을 누르거나, 눌러서 새 zip 고르기</small></>)
            : (<><b>＋ zip 파일 고르기</b><small>U+AC00.svg 같은 SVG들을 압축한 파일 · 최대 15MB</small></>)}
        </button>
        {err && <div className="help error-text" role="alert" style={{ marginTop: 8 }}>✕ {err}</div>}
        {tidy && !tidy.failed && (tidy.tidied > 0 || tidy.kept > 0) && (
          <p className="muted" style={{ margin: "8px 0 0" }}>
            {tidy.tidied > 0 && <>✓ 자동 정리 {tidy.tidied}개{tidy.kinds.length ? ` (${tidy.kinds.join(", ")})` : ""}. </>}
            {tidy.kept > 0 && <>△ 정리하지 못한 {tidy.kept}개는 검수에서 이유를 알려 드립니다.</>}
          </p>
        )}
        {picked && hasExisting && (
          <label className="checkrow" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} />
            <span>{replaceAll ? "✕ 지금 폰트의 기존 글자를 모두 지우고 이 zip으로 바꿉니다." : "기존 글자를 지우고 이 zip으로만 바꾸기 (끄면 기존 글자에 합쳐요 · 같은 이름만 새 것으로)"}</span>
          </label>
        )}
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
            {issues.slice(0, shown).map((i, k) => {
              const glyphName = /^U\+[0-9A-F]{4,6}\.svg$/.test(i.fileName);
              return (
                <div key={k} className="issue-wrap">
                  <IssueRow severity={i.severity} file={i.fileName} message={i.message} suggestion={i.suggestion} />
                  <div className="issue-acts">
                    {glyphName
                      ? <button className="linkbtn" onClick={() => (openEditor ? openEditor(String.fromCodePoint(parseInt(i.fileName.slice(2, -4), 16))) : go("glyphs"))}>편집기에서 이 글자 고치기 →</button>
                      : <button className="linkbtn" onClick={async () => {
                          try { const r = await removeFile(i.fileName); setCheck({ ...r, fileName: zipMemory.file.name, checkedAt: new Date().toISOString() }); toast(`${i.fileName} 를 뺐습니다 · 다시 검수 완료`); onFileRemoved?.(); }
                          catch (e) { toast(e.message); }
                        }}>이 파일 빼기 (글자 파일이 아님)</button>}
                  </div>
                </div>
              );
            })}
          </div>
          {issues.length > shown && <Button variant="light" onClick={() => setShown(shown + 50)}>더 보기 · 남은 {issues.length - shown}건</Button>}
        </Card>
      )}

      <GuideCard open={!s} />
    </section>
  );
}
