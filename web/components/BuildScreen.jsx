"use client";
// 빌드 화면 (6단계): 실제 엔진으로 TTF·견본·초안을 만들고 진행 상태를 실시간으로 보여 준다.
import { useEffect, useRef, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { zipMemory, ensureGlyphSet } from "./CheckScreen";
import { PageHead, Card, Button, Field, Result, Notice, StatusChip, ArtifactRow } from "./ui";

const fmtSize = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");
const STEP_ICON = { waiting: "○", running: "◌", done: "✓", failed: "✕", cancelled: "–" };
const TYPE_LABEL = { ttf: "TTF", png: "PNG", pdf: "PDF", draft: "TXT" };
const DESC = {
  "glyph_sheet.png": "글자 견본표 — 글자별 모양 확인",
  "sentence.png": "문장 미리보기",
  "specimen.pdf": "폰트 견본 PDF — 인쇄·공유용",
  "license_draft.md": "라이선스 사용범위 초안 (전문가 확인 필요)",
  "product_draft.md": "상품 설명 초안",
};

const dl = (a, inline) => `${API_BASE}/api/v1/artifacts/${a.artifactId}/download${inline ? "?inline=1" : ""}`;

// 만든 TTF 를 브라우저에 불러와 직접 문장을 써 본다. 폰트에 없는 글자는 점선 네모로 표시
// (그냥 두면 기본 글꼴로 대신 보여서 '있는 것처럼' 착각하게 됨)
function FontPreview({ build, defaultText }) {
  const ttf = build.artifacts.find((a) => a.type === "ttf");
  const [state, setState] = useState("loading");
  const [text, setText] = useState(defaultText || "다람쥐 헌 쳇바퀴에 타고파");
  const [size, setSize] = useState(48);
  const fam = "GR_" + build.buildId;
  const have = new Set(build.chars || "");
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const res = await fetch(dl(ttf));
        if (!res.ok) throw new Error();
        const face = new FontFace(fam, await res.arrayBuffer());
        await face.load();
        document.fonts.add(face);
        if (!off) setState("ready");
      } catch { if (!off) setState("error"); }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.buildId]);
  const missing = [...new Set([...text].filter((c) => c.trim() && !have.has(c)))];
  return (
    <Card title="만든 폰트로 써 보기" aside={state === "ready" ? <StatusChip status="success">폰트 불러옴</StatusChip> : state === "error" ? <StatusChip status="error">불러오기 실패</StatusChip> : <StatusChip status="running">불러오는 중</StatusChip>}>
      <Field id="pvText" label="미리보기 문장 (직접 바꿔 보세요)">
        <textarea id="pvText" value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      </Field>
      <div className="rangerow"><span className="muted">크기</span><input type="range" min={16} max={120} value={size} onChange={(e) => setSize(+e.target.value)} aria-label="글자 크기" /><b className="mono">{size}px</b></div>
      <div className="fontpreview" style={{ fontFamily: state === "ready" ? `"${fam}"` : "inherit", fontSize: size }}>
        {[...text].map((c, i) => (c === " " || c === "\n" || have.has(c)) ? <span key={i}>{c}</span> : <span key={i} className="miss" title={`${c} — 폰트에 없음`} />)}
      </div>
      <p className="muted" style={{ margin: "8px 0 0" }}>{missing.length ? `점선 네모 = 이 폰트에 없는 글자: ${missing.join(" ")}` : "입력한 글자가 모두 폰트에 들어 있습니다."}</p>
      {state === "error" && <Notice>폰트 파일을 불러오지 못했습니다. 서버 보관(6시간)이 끝났다면 다시 빌드해 주세요.</Notice>}
    </Card>
  );
}

// 화면을 옮겨 다녀도 진행 중인 빌드를 잃지 않도록 기억
let lastBuild = null;

export function BuildScreen({ toast, settings, engine, check, go }) {
  const [file, setFile] = useState(zipMemory.file);
  const [name, setName] = useState(settings.name);
  const [allow, setAllow] = useState(false);
  const [errors, setErrors] = useState({});
  const [build, setBuild] = useState(lastBuild);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef();
  const active = build && (build.status === "queued" || build.status === "running");

  // 1초마다 상태 묻기 (진행 중일 때만)
  useEffect(() => {
    if (!active) return;
    let stop = false;
    const tick = async () => {
      try {
        const b = await api("/builds/" + build.buildId, { timeout: 20000 });
        if (!stop) { lastBuild = b; setBuild(b); if (b.status === "succeeded") toast(`폰트가 만들어졌어요 · ${b.glyphCount}자`); }
      } catch (e) {
        if (!stop && e.status === 404) { const b = { ...build, status: "failed", error: { message: e.message } }; lastBuild = b; setBuild(b); }
      }
    };
    const id = setInterval(tick, 1000);
    const clock = setInterval(() => setNow(Date.now()), 500);
    return () => { stop = true; clearInterval(id); clearInterval(clock); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, build?.buildId]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (f && /\.zip$/i.test(f.name)) { setFile(f); setErrors({}); }
    else if (f) setErrors({ file: "zip 파일을 골라 주세요." });
  };

  const start = async () => {
    const e = {};
    if (!file) e.file = "글리프 zip을 골라 주세요. (검수 탭에서 쓴 파일이면 그대로 쓰입니다)";
    if (!name.trim()) e.name = "글꼴 이름을 입력해 주세요.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setStarting(true);
    try {
      const body = (gid) => ({ projectId: "prj_0009", glyphSetId: gid, allowMissing: allow, familyName: name.trim(), previewText: settings.preview });
      let gid = await ensureGlyphSet(file);
      let r;
      try { r = await api("/builds", { method: "POST", body: body(gid) }); }
      catch (err) {
        if (err.status !== 404) throw err;
        zipMemory.glyphSetId = null; gid = await ensureGlyphSet(file);
        r = await api("/builds", { method: "POST", body: body(gid) });
      }
      const b = { buildId: r.buildId, status: "queued", progress: 0, steps: [], artifacts: [], createdAt: new Date().toISOString(), familyName: name.trim(), allowMissing: allow };
      lastBuild = b; setBuild(b);
    } catch (err) {
      setErrors({ run: err.message + (err.requestId ? ` (요청 번호 ${err.requestId})` : "") });
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    try { await api("/builds/" + build.buildId, { method: "DELETE" }); toast("취소를 요청했습니다."); }
    catch (e) { toast(e.message); }
  };

  const startedMs = build?.startedAt ? Date.parse(build.startedAt) : build ? Date.parse(build.createdAt) : 0;
  const secs = build ? Math.max(0, Math.round(((active ? now : build.finishedAt ? Date.parse(build.finishedAt) : now) - startedMs) / 1000)) : 0;
  const s = check?.summary;
  const missingNow = s ? s.required - s.passed : null;

  return (
    <section className="screen active" id="build">
      <PageHead eyebrow="FONT EXPORT" title="폰트 빌드" desc="검수한 글리프로 TTF 폰트와 견본을 만듭니다." badge="엔진 · build" />

      <Card title="빌드 설정" aside={<span className="badge">CONFIG</span>}>
        <input ref={inputRef} type="file" accept=".zip,application/zip" onChange={pick} hidden id="buildZip" />
        <button className={"dropzone" + (file ? " has-file" : "")} onClick={() => inputRef.current?.click()} disabled={active || starting}>
          {file ? (<><b>🗜 {file.name}</b><small>{fmtSize(file.size)} · 눌러서 다른 파일 고르기</small></>)
            : (<><b>＋ 글리프 zip 고르기</b><small>검수 탭에서 올린 파일이 있으면 자동으로 쓰입니다</small></>)}
        </button>
        {errors.file && <div className="help error-text" role="alert" style={{ marginTop: 8 }}>✕ {errors.file}</div>}
        {s && file && check.fileName === file.name && (
          <p className="muted" style={{ margin: "8px 0 0" }}>마지막 검수: 통과 {s.passed}자 · 오류 {s.errors}건 · 누락 {missingNow.toLocaleString()}자</p>
        )}
        <Field id="fontName" label="글꼴 패밀리 이름" help="한글도 됩니다. 파일 이름은 영문·숫자만 남겨 만듭니다." error={errors.name}>
          <input id="fontName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <label className="checkrow"><input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} /> 누락 글리프 허용 <span className="muted">(시험용 빌드)</span></label>
        <Notice>누락 글리프가 있으면 기본 빌드는 중단됩니다. 시험용 빌드에서만 누락 허용을 켜세요.</Notice>
        {errors.run && <Result show tone="error"><strong>✕ 빌드를 시작하지 못했습니다.</strong>{errors.run}</Result>}
        <Button onClick={start} loading={starting} disabled={active || engine.status === "offline"}>
          {starting ? "준비 중…" : active ? "빌드 진행 중" : "폰트 빌드 시작 ↗"}
        </Button>
        {engine.status === "waking" && <Notice>무료 서버를 깨우는 중입니다. 30초~1분 뒤 눌러 주세요.</Notice>}
      </Card>

      {build && (
        <Card title="빌드 진행" aside={
          build.status === "succeeded" ? <StatusChip status="success">완료</StatusChip>
            : build.status === "failed" ? <StatusChip status="error">실패</StatusChip>
              : build.status === "cancelled" ? <StatusChip>취소됨</StatusChip>
                : <StatusChip status="running">{build.status === "queued" ? "대기 중" : "진행 중"}</StatusChip>}>
          <p className="muted" style={{ marginTop: 0 }}>
            {build.familyName} · 작업 번호 <span className="mono">{build.buildId}</span> · {secs}초{build.allowMissing ? " · △ 누락 허용(시험용)" : ""}
          </p>
          <div className="progress" role="progressbar" aria-valuenow={build.progress || 0} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: (build.progress || 0) + "%" }} className={build.status === "failed" ? "bad" : ""} />
          </div>
          <ol className="stepper">
            {(build.steps?.length ? build.steps : [{ key: "q", label: "작업 대기", state: "running" }]).map((st) => (
              <li key={st.key} className={"st-" + st.state}>
                <span className="dot" aria-hidden="true">{STEP_ICON[st.state]}</span>
                <span className="grow"><b>{st.label}</b>{st.note && <small>{st.note}</small>}</span>
                <span className="sr-only">{{ waiting: "대기", running: "진행 중", done: "완료", failed: "실패", cancelled: "취소" }[st.state]}</span>
              </li>
            ))}
          </ol>
          {active && <Button variant="light" onClick={cancel}>빌드 취소</Button>}
          {build.status === "failed" && (
            <Result show tone="error">
              <strong>✕ {build.error?.message || "빌드에 실패했습니다."}</strong>
              {build.error?.code === "GLYPH_VALIDATION_FAILED" && <button className="linkbtn" onClick={() => go("check")}>검수 탭에서 확인하기 →</button>}
            </Result>
          )}
          {build.status === "succeeded" && (
            <Result show><strong>✓ 폰트를 만들었어요 · {build.glyphCount}자 · {secs}초</strong>
              {build.sentence?.missing ? `미리보기 문장에서 빠진 글자(□로 표시): ${build.sentence.missing}` : "미리보기 문장의 모든 글자가 들어 있습니다."}
            </Result>
          )}
        </Card>
      )}

      {build?.status === "succeeded" && build.artifacts?.some((a) => a.type === "ttf") && <FontPreview build={build} defaultText={settings.preview} />}

      <Card title={build?.status === "succeeded" ? "만들어진 파일" : "생성 예정 산출물"} aside="OUTPUT FILES">
        {build?.status === "succeeded" ? (
          <>
            {build.artifacts.map((a) => (
              <ArtifactRow key={a.artifactId} type={TYPE_LABEL[a.type] || "FILE"} name={a.name} desc={(DESC[a.name] || "설치 및 배포용 폰트 파일") + " · " + fmtSize(a.size)}
                right={<span className="acts">
                  {(a.type === "pdf" || a.type === "png") && <a className="btn light" href={dl(a, true)} target="_blank" rel="noopener">보기</a>}
                  <a className="btn light" href={dl(a)} download={a.name} aria-label={`${a.name} 내려받기`}>⇩ 받기</a>
                </span>} />
            ))}
            {build.artifacts.find((a) => a.name === "glyph_sheet.png") && (
              <img className="sheetimg" alt="글자 견본표" loading="lazy" src={dl(build.artifacts.find((a) => a.name === "glyph_sheet.png"), true)} />
            )}
            <p className="muted" style={{ margin: "10px 0 0" }}>서버에 6시간 보관됩니다. 꼭 필요한 파일은 지금 받아 두세요. 라이선스·상품 문안은 초안입니다(공개 전 전문가 확인).</p>
          </>
        ) : (
          [["TTF", "TrueType Font", "설치 및 배포용 폰트 파일"], ["PNG", "글자 견본표 · 문장 미리보기", "글자별 모양 확인"], ["PDF", "폰트 견본 PDF", "인쇄 및 공유용"], ["TXT", "상품 설명 · 라이선스 초안", "판매 등록 전 검토용"]]
            .map(([t, b, d]) => <ArtifactRow key={t} type={t} name={b} desc={d} />)
        )}
        <p className="muted" style={{ margin: "10px 0 0" }}>TTF만 만듭니다(OTF·힌팅·커닝 없음). 윈도우·맥에서 보이는 모양과 마켓 심사는 이 도구로 확인할 수 없습니다.</p>
      </Card>
    </section>
  );
}
