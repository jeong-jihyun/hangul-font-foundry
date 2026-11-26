"use client";
// 빌드 화면: 검수에서 올린 글자로 폰트를 만든다. zip 을 다시 고를 필요 없음.
import { useEffect, useState } from "react";
import { API_BASE } from "../lib/api";
import { PageHead, Card, Button, Field, Result, Notice, StatusChip } from "./ui";

const fmtSize = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1024)) + "KB");
const STEP_ICON = { waiting: "○", running: "◌", done: "✓", failed: "✕", cancelled: "–" };
// 영어 파일 이름 대신 무엇인지 한글로
const FILES = {
  ttf: { t: "TTF", label: "폰트 파일", desc: "폰·PC에 설치해서 쓰는 파일" },
  "specimen.pdf": { t: "PDF", label: "견본 PDF", desc: "모든 글자와 문장 견본 · 인쇄·공유용" },
  "glyph_sheet.png": { t: "PNG", label: "글자 견본 그림", desc: "글자를 한눈에 보는 그림" },
  "sentence.png": { t: "PNG", label: "문장 미리보기 그림", desc: "미리보기 문장을 쓴 그림" },
  "product_draft.md": { t: "TXT", label: "상품 설명 초안", desc: "판매 페이지에 쓸 글 초안" },
  "license_draft.md": { t: "TXT", label: "라이선스 표 초안", desc: "사용 범위 표 · 공개 전 전문가 확인" },
};
const info = (a) => (a.type === "ttf" ? FILES.ttf : FILES[a.name] || { t: "FILE", label: a.name, desc: "" });
export const dl = (a, inline) => `${API_BASE}/api/v1/artifacts/${a.artifactId}/download${inline ? "?inline=1" : ""}`;

// 만든 TTF 를 불러와 직접 문장을 써 본다. 폰트에 없는 글자는 점선 네모로 표시
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
      <div className="fontpreview" style={{ fontFamily: state === "ready" ? `"${fam}"` : "inherit", fontSize: size }}>
        {[...text].map((c, i) => (c === " " || c === "\n" || have.has(c)) ? <span key={i}>{c}</span> : <span key={i} className="miss" title={`${c} — 폰트에 없음`} />)}
      </div>
      <p className="muted" style={{ margin: "8px 0 0" }}>{missing.length ? `점선 네모 = 아직 폰트에 없는 글자: ${missing.join(" ")}` : "입력한 글자가 모두 폰트에 들어 있습니다."}</p>
      <Field id="pvText" label="문장을 바꿔 써 보세요">
        <textarea id="pvText" value={text} onChange={(e) => setText(e.target.value)} rows={2} />
      </Field>
      <div className="rangerow"><span className="muted">크기</span><input type="range" min={16} max={120} value={size} onChange={(e) => setSize(+e.target.value)} aria-label="글자 크기" /><b className="mono">{size}px</b></div>
      {state === "error" && <Notice>폰트 파일을 불러오지 못했습니다. 서버 보관(6시간)이 끝났다면 다시 만들어 주세요.</Notice>}
    </Card>
  );
}

function Progress({ build, secs, onCancel, go }) {
  const active = build.status === "queued" || build.status === "running";
  const steps = build.steps?.length ? build.steps : [{ key: "q", label: "작업 대기", state: "running" }];
  const list = (
    <ol className="stepper">
      {steps.map((st) => (
        <li key={st.key} className={"st-" + st.state}>
          <span className="dot" aria-hidden="true">{STEP_ICON[st.state]}</span>
          <span className="grow"><b>{st.label}</b>{st.note && <small>{st.note}</small>}</span>
          <span className="sr-only">{{ waiting: "대기", running: "진행 중", done: "완료", failed: "실패", cancelled: "취소" }[st.state]}</span>
        </li>
      ))}
    </ol>
  );
  return (
    <Card title={active ? "폰트 만드는 중" : build.status === "succeeded" ? "만든 과정" : build.status === "failed" ? "만들지 못했어요" : "취소됨"}
      aside={build.status === "succeeded" ? <StatusChip status="success">완료</StatusChip>
        : build.status === "failed" ? <StatusChip status="error">실패</StatusChip>
          : build.status === "cancelled" ? <StatusChip>취소됨</StatusChip>
            : <StatusChip status="running">{build.status === "queued" ? "대기 중" : `${build.progress || 0}%`}</StatusChip>}>
      <p className="muted" style={{ marginTop: 0 }}>{build.familyName} · {secs}초{build.allowMissing ? " · 시험용(있는 글자만)" : ""}{build.glyphCount ? ` · ${build.glyphCount}자` : ""}</p>
      <div className="progress" role="progressbar" aria-valuenow={build.progress || 0} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: (build.progress || 0) + "%" }} className={build.status === "failed" ? "bad" : ""} />
      </div>
      {build.status === "succeeded" ? <details className="log"><summary>단계별 기록 보기</summary>{list}</details> : list}
      {active && <Button variant="light" onClick={onCancel}>만들기 취소</Button>}
      {build.status === "failed" && (
        <Result show tone="error">
          <strong>✕ {build.error?.message || "만들지 못했습니다."}</strong>
          {build.error?.code === "GLYPH_VALIDATION_FAILED" && <button className="linkbtn" onClick={() => go("check")}>검수 탭에서 확인하기 →</button>}
        </Result>
      )}
    </Card>
  );
}

const W = { advanceHangul: 1000, advanceOther: 600, advanceSpace: 300 };
const WR = { advanceHangul: [500, 1500, "한글 글자 너비"], advanceOther: [200, 1500, "숫자·영문·기호 너비"], advanceSpace: [100, 1000, "띄어쓰기 너비"] };

export function BuildScreen({ settings, engine, check, go, build, startBuild, cancelBuild, fontSettings = {}, saveFontSettings, fontName, openEditor }) {
  // 폰트마다 이름·글자 너비를 기억 (잠금 열림 → GitHub, 잠김 → 이 기기)
  const [name, setName] = useState(fontSettings.familyName || fontName || settings.name);
  const [widths, setWidths] = useState({ ...W, ...(fontSettings.widths || {}) });
  useEffect(() => { setName(fontSettings.familyName || fontName || settings.name); setWidths({ ...W, ...(fontSettings.widths || {}) }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fontName, JSON.stringify(fontSettings)]);
  const [nameErr, setNameErr] = useState("");
  const [starting, setStarting] = useState(false);
  const [runErr, setRunErr] = useState("");
  const [now, setNow] = useState(Date.now());
  const active = build && (build.status === "queued" || build.status === "running");
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);

  const s = check?.summary;
  const missing = s ? s.required - s.passed : 0;

  const start = async (allowMissing) => {
    if (!name.trim()) { setNameErr("글꼴 이름을 입력해 주세요."); return; }
    for (const [k, [lo, hi, label]] of Object.entries(WR)) {
      const v = Number(widths[k]);
      if (!Number.isFinite(v) || v < lo || v > hi) { setRunErr(`${label}는 ${lo}~${hi} 사이로 넣어 주세요.`); return; }
    }
    setNameErr(""); setRunErr(""); setStarting(true);
    try {
      const w = Object.fromEntries(Object.entries(widths).map(([k, v]) => [k, Math.round(Number(v))]));
      saveFontSettings?.({ ...fontSettings, familyName: name.trim(), widths: w }).catch?.(() => {});
      await startBuild({ familyName: name.trim(), allowMissing, widths: w });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    catch (e) { setRunErr(e.message + (e.requestId ? ` (요청 번호 ${e.requestId})` : "")); }
    finally { setStarting(false); }
  };

  const startedMs = build ? Date.parse(build.startedAt || build.createdAt) : 0;
  const secs = build ? Math.max(0, Math.round(((active ? now : build.finishedAt ? Date.parse(build.finishedAt) : now) - startedMs) / 1000)) : 0;
  const ok = build?.status === "succeeded";
  const ttf = ok && build.artifacts?.find((a) => a.type === "ttf");

  return (
    <section className="screen active" id="build">
      <PageHead eyebrow="FONT EXPORT" title="폰트 만들기" desc="검수한 글자로 TTF 폰트와 견본을 만듭니다." badge="엔진 · build" />

      {/* 1) 결과가 있으면 맨 위: 받기 + 써 보기 */}
      {ok && ttf && (
        <Card title="만든 폰트 받기" aside={<StatusChip status="success">{build.glyphCount}자</StatusChip>}>
          <div className="dl-main">
            <a className="btn" href={dl(ttf)} download={ttf.name}>⇩ 폰트 파일 받기 <small>{ttf.name} · {fmtSize(ttf.size)}</small></a>
            <a className="btn light" href={`${API_BASE}/api/v1/builds/${build.buildId}/bundle.zip`} download>⇩ 모두 받기 (zip)</a>
          </div>
          <p className="muted" style={{ margin: "8px 0 0" }}>{build.familyName}{build.allowMissing ? " · 시험용" : ""} · 서버에 6시간 보관됩니다. 필요한 파일은 지금 받아 두세요.</p>
        </Card>
      )}
      {ok && ttf && <FontPreview build={build} defaultText={settings.preview} />}
      {build && !ok && <Progress build={build} secs={secs} onCancel={cancelBuild} go={go} />}

      {/* 2) 만들기 */}
      <Card title={ok ? "다시 만들기" : "만들기"} aside={<span className="badge">CONFIG</span>}>
        {!s ? (
          <>
            <Result show tone="warning"><strong>△ 먼저 글자를 그리거나 올려 주세요.</strong>글리프 탭에서 글자를 그려 저장하면 자동으로 검수되고, 여기서 바로 만들 수 있습니다. 이미 저장한 글자가 있으면 검수 탭에서 '검수 실행'을 한 번 눌러 주세요.</Result>
            <div className="row-gap">
              <Button onClick={() => openEditor ? openEditor("next") : go("glyphs")}>글자 그리러 가기 →</Button>
              <Button variant="light" onClick={() => go("check")}>검수 탭 (zip·저장된 글자)</Button>
            </div>
          </>
        ) : (
          <>
            <div className="usebox">
              <b>사용할 글자: {check.fileName}</b>
              <small>✓ 준비 {s.passed}자 · {s.errors ? `✕ 고칠 곳 ${s.errors}건 · ` : ""}△ 아직 없는 필수 글자 {missing.toLocaleString()}자</small>
              <button className="linkbtn" onClick={() => go("glyphs")}>글자 더 그리기·고치기 →</button>
            </div>
            <Field id="fontName" label="글꼴 이름" help="한글도 됩니다. 파일 이름은 영문·숫자만 남겨 만듭니다." error={nameErr}>
              <input id="fontName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </Field>
            <details className="more">
              <summary>글자 너비 (이 폰트에 저장)</summary>
              <div className="formgrid">
                {Object.entries(WR).map(([k, [lo, hi, label]]) => (
                  <Field key={k} id={k} label={label} help={`${lo}~${hi} · 기본 ${W[k]}`}>
                    <input id={k} type="number" inputMode="numeric" min={lo} max={hi} value={widths[k]} onChange={(e) => setWidths({ ...widths, [k]: e.target.value })} />
                  </Field>
                ))}
              </div>
              <p className="muted" style={{ margin: 0 }}>글자 칸 1000 기준입니다. 한글 너비를 줄이면 글자 사이가 좁아집니다. 폰트를 만들 때 이 폰트의 설정으로 함께 저장됩니다.</p>
            </details>
            {runErr && <Result show tone="error"><strong>✕ 시작하지 못했습니다.</strong>{runErr}</Result>}
            {s.errors > 0 ? (
              <>
                <Result show tone="error"><strong>✕ 고칠 곳 {s.errors}건을 먼저 고쳐 주세요.</strong>오류가 있는 글자가 있으면 폰트를 만들 수 없습니다.</Result>
                <Button onClick={() => go("check")}>고칠 곳 보러 가기 →</Button>
              </>
            ) : missing > 0 ? (
              <>
                <Notice>필수 글자 {s.required.toLocaleString()}자 중 {missing.toLocaleString()}자가 아직 없어 <b>정식 폰트</b>는 만들 수 없습니다. 지금 있는 {s.passed}자로 <b>시험용 폰트</b>를 만들어 모양을 확인해 보세요.</Notice>
                <Button onClick={() => start(true)} loading={starting} disabled={active || engine.status === "offline"}>
                  {active ? "만드는 중…" : `시험용 폰트 만들기 (${s.passed}자) ↗`}
                </Button>
              </>
            ) : (
              <Button onClick={() => start(false)} loading={starting} disabled={active || engine.status === "offline"}>
                {active ? "만드는 중…" : "정식 폰트 만들기 ↗"}
              </Button>
            )}
            {engine.status === "waking" && <Notice>무료 서버를 깨우는 중입니다. 30초~1분 뒤 눌러 주세요.</Notice>}
          </>
        )}
      </Card>

      {ok && <Progress build={build} secs={secs} onCancel={cancelBuild} go={go} />}

      {/* 3) 다른 파일들 */}
      {ok && (
        <Card title="다른 파일" aside="견본·초안">
          {build.artifacts.filter((a) => a.type !== "ttf").map((a) => {
            const f = info(a);
            return (
              <div className="artifact" key={a.artifactId}>
                <div className="filetype">{f.t}</div>
                <div className="grow"><b>{f.label}</b><small>{f.desc} · {fmtSize(a.size)}</small></div>
                <span className="acts">
                  {(a.type === "pdf" || a.type === "png") && <a className="btn light" href={dl(a, true)} target="_blank" rel="noopener">보기</a>}
                  <a className="btn light" href={dl(a)} download={a.name} aria-label={`${f.label} 받기`}>⇩ 받기</a>
                </span>
              </div>
            );
          })}
        </Card>
      )}
      <p className="muted" style={{ margin: "4px 4px 0" }}>TTF만 만듭니다(OTF·힌팅·커닝 없음). 윈도우·맥에서 보이는 모양과 마켓 심사는 이 도구로 확인할 수 없습니다. 상품·라이선스 문안은 초안입니다.</p>
    </section>
  );
}
