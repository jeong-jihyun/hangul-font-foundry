"use client";
// 글리프 화면 (4단계): 서버가 만든 실제 필수 글자 목록을 보여 준다.
import { useEffect, useMemo, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { SAMPLE_GLYPHS } from "./data";
import { PageHead, Card, Button, Result, StatusChip } from "./ui";

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

export function GlyphsScreen({ engine, toast }) {
  const cs = useCharset(engine.status);
  const live = cs.status === "ready";
  const items = useMemo(
    () => (live ? cs.items : cs.status === "error" ? SAMPLE_GLYPHS.map(([c, cp]) => ({ char: c, codepoint: cp, filename: cp + ".svg", group: "hangul" })) : []),
    [live, cs.status, cs.items]
  );
  const [group, setGroup] = useState("all");
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState(null);
  const [sheet, setSheet] = useState(false); // 폰: 아래에서 올라오는 상세 창

  const m = useMemo(() => matcher(q), [q]);
  const list = useMemo(
    () => items.filter((i) => (group === "all" || i.group === group || (group === "latin" && i.group === "digit")) && m.test(i)),
    [items, group, m]
  );
  const notInSet = m.chars ? m.chars.filter((c) => !items.some((i) => i.char === c)) : [];
  useEffect(() => setShown(PAGE), [group, q, live]);
  useEffect(() => setSheet(false), [group, q]);
  const sel = selected || items[0];
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
        <p className="muted" style={{ margin: "8px 0 0" }}>완료·누락 표시는 5단계에서 글리프 파일을 올리면 나타납니다.</p>
      </Card>

      <div className="glyph-layout">
        <Card title="문자 미리보기" aside="선택하여 상세 확인">
          <div className="glyph-grid">
            {list.length === 0 && <p className="muted">{cs.status === "loading" ? "글자 목록을 불러오는 중입니다…" : "검색 결과가 없습니다."}</p>}
            {list.slice(0, shown).map((g) => (
              <button key={g.codepoint} className={"glyph-cell nomark" + (sel?.codepoint === g.codepoint ? " selected" : "")}
                onClick={() => { setSelected(g); setSheet(true); }}
                aria-label={`${g.char === " " ? "공백" : g.char} ${g.codepoint}`} aria-pressed={sel?.codepoint === g.codepoint}>
                <span className="char">{g.char === " " ? "␠" : g.char}</span><small>{g.codepoint}</small>
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
              <div className="bigchar">{sel.char === " " ? "␠" : sel.char}</div>
              <div>
                <div className="code">{sel.codepoint}</div>
                <div className="preview-meta">
                  <div><small>파일명</small><b className="mono">{sel.filename}</b></div>
                  <div><small>캔버스</small><b>1000 × 1000</b></div>
                </div>
              </div>
            </div>
            <p className="muted" style={{ margin: "13px 0 0" }}>기준선 y=800 · SVG 절대좌표(M L H V C Q Z)와 &lt;rect&gt;만 사용합니다.</p>
          </Card>
        )}
      </div>
    </section>
  );
}
