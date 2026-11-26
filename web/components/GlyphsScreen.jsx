"use client";
// 글리프 화면 (4단계): 서버가 만든 실제 필수 글자 목록을 보여 준다.
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { SAMPLE_GLYPHS } from "./data";
import { PageHead, Card, Button, Result, StatusChip } from "./ui";
import { replaceGlyph, zipMemory, hasGlyphSource } from "./CheckScreen";

const PAGE = 60; // 한 번에 그리는 글자 수 (2,438자를 한꺼번에 그리면 폰이 느려짐)
const GROUPS = [["all", "전체"], ["hangul", "한글"], ["latin", "숫자·영문"], ["symbol", "기호"]];
const GROUP_LABEL = { hangul: "한글 완성형", digit: "숫자", latin: "영문", symbol: "기호" };

// 화면을 옮겨 다녀도 다시 받지 않도록 한 번 받은 목록을 기억해 둔다
let cache = null;

function useCharset(engineStatus) {
  const [state, setState] = useState(cache ? { status: "ready", ...cache } : { status: "loading" });
  const load = async () => {
    setState({ status: "loading" });
    try {
      const made = await api("/charsets", { method: "POST", body: { projectId: "prj_0009", format: "csv" } });
      const full = await api("/charsets/" + made.charsetId);
      cache = { items: full.items, counts: full.counts, artifactId: full.artifactId };
      setState({ status: "ready", ...cache });
    } catch (e) {
      setState({ status: "error", error: e.message });
    }
  };
  useEffect(() => {
    if (cache) return;
    if (engineStatus === "online") load();
    else if (engineStatus === "offline") setState({ status: "error", error: "엔진에 연결되지 않았습니다." });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineStatus]);
  return { ...state, reload: load };
}

// 검색어 해석: "U+AC00"·"ac00" → 코드 검색, 여러 글자(예: 다람쥐) → 그 글자들만 모아 보기
function matcher(raw) {
  const q = raw.trim();
  if (!q) return { test: () => true };
  const hex = q.replace(/^u\+/i, "");
  if (/^[0-9a-f]{2,5}$/i.test(hex) && (/^u\+/i.test(q) || hex.length >= 4)) {
    const up = hex.toUpperCase();
    return { test: (i) => i.codepoint.slice(2).includes(up) };
  }
  const chars = [...new Set([...q.replace(/\s+/g, "")])];
  if (chars.length > 1) return { test: (i) => chars.includes(i.char), chars };
  return { test: (i) => i.char === chars[0] || i.filename.toLowerCase().includes(q.toLowerCase()) };
}

const STATUS_LABEL = { ready: "✓ 제작 완료", missing: "△ 누락", problem: "✕ 고칠 곳 있음" };

// 내가 그린 글자 그림 (서버가 다시 그린 안전한 SVG). 못 불러오면 기본 글꼴 글자로 대신 보여 준다.
function MyGlyph({ check, g, ver, fallback }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [ver, check?.glyphSetId]);
  if (!check?.glyphSetId || bad) return fallback;
  return <img className="myglyph" alt={`${g.char} 내가 그린 모양`} loading="lazy"
    src={`${API_BASE}/api/v1/glyphsets/${check.glyphSetId}/preview/${g.filename}?v=${ver}`} onError={() => setBad(true)} />;
}

export function GlyphsScreen({ engine, toast, check, setCheck, go, onGlyphReplaced }) {
  const cs = useCharset(engine.status);
  const live = cs.status === "ready";
  const items = useMemo(
    () => (live ? cs.items : cs.status === "error" ? SAMPLE_GLYPHS.map(([c, cp]) => ({ char: c, codepoint: cp, filename: cp + ".svg", group: "hangul" })) : []),
    [live, cs.status, cs.items]
  );
  const [group, setGroup] = useState("all");
  // 검수 결과가 있으면 '내가 그린 글자'부터 보여 준다 (2,438자 중에 흩어져 있어 찾기 어려움)
  const [st, setSt] = useState(check ? "mine" : "all");
  useEffect(() => { if (check) setSt((v) => (v === "all" ? "mine" : v)); }, [check?.checkId]);
  // 마지막 검수 결과로 글자마다 상태를 정한다 (통과 / 아직 없음 / 파일은 있지만 문제)
  const ready = useMemo(() => new Set(check?.ready || ""), [check]);
  const missingSet = useMemo(() => new Set(check?.missing || ""), [check]);
  // 파일이 아예 읽히지 않는 글자(상대좌표·깨진 파일)도 '고칠 곳'으로 잡기 위해 문제 목록의 파일 이름을 함께 본다
  const problemSet = useMemo(() => {
    const out = new Set();
    for (const i of check?.issues || []) {
      const m = /^U\+([0-9A-F]{4,6})\.svg$/.exec(i.fileName);
      if (m && i.severity === "error") out.add(String.fromCodePoint(parseInt(m[1], 16)));
    }
    return out;
  }, [check]);
  const statusOf = (ch) => (!check ? null : ready.has(ch) ? "ready" : problemSet.has(ch) ? "problem" : missingSet.has(ch) ? "missing" : "problem");
  const isMine = (ch) => ready.has(ch) || problemSet.has(ch) || !missingSet.has(ch);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState(null);
  const [sheet, setSheet] = useState(false); // 폰: 아래에서 올라오는 상세 창
  const [ver, setVer] = useState(0);         // 글자 교체 후 그림 새로 고침용
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const m = useMemo(() => matcher(q), [q]);
  const list = useMemo(
    () => items.filter((i) => (group === "all" || i.group === group || (group === "latin" && i.group === "digit")) && m.test(i)
      && (st === "all" || !check || (st === "mine" ? isMine(i.char) : !isMine(i.char)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, group, m, st, check]
  );
  const notInSet = m.chars ? m.chars.filter((c) => !items.some((i) => i.char === c)) : [];
  useEffect(() => setShown(PAGE), [group, q, live, st]);
  useEffect(() => setSheet(false), [group, q, st]);
  const sel = selected || list[0] || items[0];
  const counts = cs.counts;

  return (
    <section className="screen active" id="glyphs">
      <PageHead eyebrow="GLYPH LIBRARY" title="글리프 라이브러리" desc="제작할 글자를 찾고 준비 상태를 관리합니다." badge="KS X 1001 · 2,350자" />

      <Card title="문자 세트" aside={live ? <StatusChip status="success">엔진 생성</StatusChip> : <StatusChip status={cs.status === "loading" ? "running" : "warning"}>{cs.status === "loading" ? "불러오는 중" : "데모"}</StatusChip>}>
        {live ? (
          <>
            <div className="countrow">
              <div><strong>{counts.total.toLocaleString()}</strong><small>전체 필수 글자</small></div>
              <div><strong>{counts.hangul.toLocaleString()}</strong><small>한글 완성형</small></div>
              <div><strong>{counts.digit + counts.latin}</strong><small>숫자·영문</small></div>
              <div><strong>{counts.symbol}</strong><small>기호</small></div>
            </div>
            <a className="btn light fullwidth" href={`${API_BASE}/api/v1/artifacts/${cs.artifactId}/download`} download="required_chars.csv"
              onClick={() => toast("CSV 내려받기를 시작했습니다.")}>⇩&nbsp; 글자 목록 CSV 내려받기</a>
            <p className="muted" style={{ margin: "8px 0 0" }}>열: character · codepoint · filename (엑셀에서 바로 열림)</p>
          </>
        ) : cs.status === "loading" ? (
          <p className="muted">{engine.status === "waking" ? "무료 서버를 깨우는 중입니다. 30초~1분 걸릴 수 있어요." : "서버에서 글자 목록을 받는 중입니다…"}</p>
        ) : (
          <Result show tone="warning">
            <strong>△ 실제 목록을 받지 못해 샘플 12자를 보여 줍니다.</strong>{cs.error}
            <div style={{ marginTop: 10 }}><Button variant="light" onClick={cs.reload}>다시 받기</Button></div>
          </Result>
        )}
      </Card>

      <Card title="글리프 탐색" aside={`${list.length.toLocaleString()}자`}>
        <div className="toolbar">
          <input className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="글자·문장 또는 코드 · 가, 다람쥐, U+AC00" aria-label="글리프 검색" />
          <div className="filters" role="group" aria-label="글자 종류">
            {GROUPS.map(([k, l]) => (
              <button key={k} className={"filter" + (group === k ? " active" : "")} aria-pressed={group === k} onClick={() => setGroup(k)}>{l}</button>
            ))}
          </div>
        </div>
        {notInSet.length > 0 && (
          <p className="muted warn-line">△ 필수 목록에 없는 글자: <b>{notInSet.join(" ")}</b> — 넣으려면 따로 그려야 합니다.</p>
        )}
        {check ? (
          <div className="filters" role="group" aria-label="제작 상태" style={{ marginTop: 8 }}>
            {[["mine", `내가 그린 글자 ${items.filter((i) => isMine(i.char)).length.toLocaleString()}`], ["missing", `아직 없음 ${items.filter((i) => !isMine(i.char)).length.toLocaleString()}`], ["all", "전체"]].map(([k, l]) => (
              <button key={k} className={"filter" + (st === k ? " active" : "")} aria-pressed={st === k} onClick={() => setSt(k)}>{l}</button>
            ))}
          </div>
        ) : (
          <button className="linkbtn" onClick={() => go("check")}>검수 탭에서 글리프 zip을 올리면 완료·누락이 표시됩니다 →</button>
        )}
      </Card>

      <div className="glyph-layout">
        <Card title="문자 미리보기" aside="선택하여 상세 확인">
          <div className="glyph-grid">
            {list.length === 0 && <p className="muted">{cs.status === "loading" ? "글자 목록을 불러오는 중입니다…" : "검색 결과가 없습니다."}</p>}
            {list.slice(0, shown).map((g) => (
              <button key={g.codepoint} className={"glyph-cell" + (check ? " st-" + statusOf(g.char) : " nomark") + (sel?.codepoint === g.codepoint ? " selected" : "")}
                onClick={() => { setSelected(g); setSheet(true); }}
                aria-label={`${g.char === " " ? "공백" : g.char} ${g.codepoint}${check ? " " + STATUS_LABEL[statusOf(g.char)] : ""}`} aria-pressed={sel?.codepoint === g.codepoint}>
                <i className="mark" />
                {check && statusOf(g.char) !== "missing"
                  ? <span className="char"><MyGlyph check={check} g={g} ver={ver} fallback={g.char === " " ? "␠" : g.char} /></span>
                  : <span className="char">{g.char === " " ? "␠" : g.char}</span>}
                <small>{g.codepoint}</small>
              </button>
            ))}
          </div>
          {list.length > shown && (
            <Button variant="light" onClick={() => setShown(shown + PAGE * 2)}>더 보기 · 남은 {(list.length - shown).toLocaleString()}자</Button>
          )}
        </Card>
        {sel && (
          <Card title="글리프 상세" className={"detail-card" + (sheet ? " open" : "")}
            aside={<div className="row-gap"><span className="badge">{GROUP_LABEL[sel.group]}</span><button className="sheet-close" onClick={() => setSheet(false)} aria-label="상세 닫기">✕</button></div>}>
            <div id="glyph-detail" className="preview">
              {check && statusOf(sel.char) !== "missing" ? (
                <div className="canvasbox" title="1000×1000 캔버스 · 빨간 선 = 기준선 y=800">
                  <MyGlyph check={check} g={sel} ver={ver} fallback={<span className="bigchar">{sel.char}</span>} />
                  <i className="baseline" aria-hidden="true" />
                </div>
              ) : (
                <div className="bigchar">{sel.char === " " ? "␠" : sel.char}</div>
              )}
              <div>
                <div className="code">{sel.codepoint}</div>
                <div className="preview-meta">
                  <div><small>파일명</small><b className="mono">{sel.filename}</b></div>
                  <div><small>캔버스</small><b>1000 × 1000</b></div>
                </div>
              </div>
            </div>
            {check && <p className={"st-line st-" + statusOf(sel.char)}>{STATUS_LABEL[statusOf(sel.char)]}{statusOf(sel.char) === "problem" ? " — 검수 탭의 문제 목록을 확인하세요" : ""}</p>}
            <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              setBusy(true);
              try {
                const r = await replaceGlyph(sel.filename, f);
                onGlyphReplaced?.(sel.filename, f);
                setCheck({ ...r, fileName: zipMemory.file?.name || check?.fileName, checkedAt: new Date().toISOString() });
                setVer((v) => v + 1);
                const st = new Set(r.ready).has(sel.char) ? "통과" : "고칠 곳 있음";
                toast(`${sel.char} 교체 완료 · 다시 검수: ${st}`);
              } catch (err) { toast(err.message); }
              finally { setBusy(false); }
            }} />
            {(() => {
              const mine = check && statusOf(sel.char) !== "missing" && check.glyphSetId;
              return (
                <>
                  <div className="action-grid">
                    {mine
                      ? <a className="btn light" href={`${API_BASE}/api/v1/glyphsets/${check.glyphSetId}/files/${sel.filename}`} download={sel.filename}>⇩ 고치기용으로 받기</a>
                      : <a className="btn light" href={`${API_BASE}/api/v1/templates/${sel.codepoint}.svg`} download={sel.filename}>⇩ 빈 바탕 받기</a>}
                    <Button loading={busy} onClick={() => {
                      if (!hasGlyphSource()) { toast("먼저 검수 탭에서 글리프 zip을 골라 검수해 주세요."); return; }
                      fileRef.current?.click();
                    }}>⇧ {mine ? "고친 파일 올리기" : "그린 파일 올리기"}</Button>
                  </div>
                  <p className="muted" style={{ margin: "8px 0 0" }}>{mine ? "받은 파일을 그리기 도구에서 고친 뒤 올리세요." : "빈 바탕에 그려 저장한 뒤 올리세요."} 파일 이름은 달라도 {sel.filename} 으로 저장하고 자동으로 다시 검수합니다.</p>
                  <details className="more">
                    <summary>더 보기</summary>
                    {mine && (
                      <div className="compare">
                        <div><small>내 글자</small><MyGlyph check={check} g={sel} ver={ver} fallback={sel.char} /></div>
                        <div><small>기본 글꼴(참고)</small><span className="basechar">{sel.char}</span></div>
                      </div>
                    )}
                    {mine && <a className="btn light fullwidth" style={{ marginTop: 8 }} href={`${API_BASE}/api/v1/templates/${sel.codepoint}.svg`} download={sel.filename}>⇩ 새로 그릴 빈 바탕 받기</a>}
                    <p className="muted" style={{ margin: "8px 0 0" }}>규칙: 1000×1000 · 바닥선 y=800 · 속이 채워진 도형(path) · 절대좌표(M L H V C Q Z)와 &lt;rect&gt;만</p>
                  </details>
                </>
              );
            })()}
          </Card>
        )}
      </div>
    </section>
  );
}
