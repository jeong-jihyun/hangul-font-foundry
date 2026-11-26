"use client";
// 손글씨 화면: ① 종이 받기 ② 쓴 종이 사진 올리기 ③ 따낸 글씨 확인·고치기 ④ 2,350자 조합해 폰트 글자로
import { useEffect, useMemo, useRef, useState } from "react";
import { zipSync, strToU8 } from "fflate";
import { api } from "../lib/api";
import { PageHead, Card, Button, Result, Notice, StatusChip } from "./ui";
import { GlyphEditor } from "./GlyphEditor";
import { composeD, partsFor, fileName } from "../lib/glyph/hangul";
import { glyphSvg } from "../lib/glyph/geom";
import { loadJamo, saveJamo } from "../lib/store";
import { useCharset } from "./GlyphsScreen";

const PDF = "/handwriting/glyphroom-handwriting.pdf";
const ST = { ok: ["success", "따냄"], faint: ["warning", "흐림"], messy: ["warning", "넘침"], empty: ["neutral", "빈칸"] };
let layoutCache = null;

// 폰 사진은 크고(HEIC 포함) 느리므로, 브라우저에서 2400px JPG 로 줄여 보낸다
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(new File([b], "page.jpg", { type: "image/jpeg" })), "image/jpeg", 0.88));
}

function Piece({ d, size = 44 }) {
  return d
    ? <svg viewBox="0 0 1000 1000" width={size} height={size} className="hw-piece" aria-hidden="true"><path d={d} fillRule="evenodd" /></svg>
    : <span className="hw-blank" style={{ width: size, height: size }} />;
}

export function HandwritingScreen({ engine, toast, go, projectId, applyGlyphZip }) {
  const cs = useCharset(engine.status);
  const required = useMemo(() => (cs.items || []).map((i) => i.char), [cs.items]);
  const [layout, setLayout] = useState(layoutCache);
  const [jamo, setJamo] = useState({});
  const [stat, setStat] = useState({}); // 마지막 사진에서의 칸 상태
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState("다람쥐 헌 쳇바퀴에 타고파");
  const [applying, setApplying] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (layout || engine.status !== "online") return;
    api("/handwriting/layout").then((l) => { layoutCache = l; setLayout(l); }).catch((e) => setErr(e.message));
  }, [engine.status, layout]);
  useEffect(() => {
    setLoading(true);
    loadJamo(projectId).then(setJamo).catch((e) => toast(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const store = async (items, next) => {
    setJamo(next);
    try { await saveJamo(projectId, items, next); }
    catch (e) { toast("저장하지 못했습니다: " + e.message); }
  };

  // 사진 올리기 (여러 장 가능)
  const onPhotos = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = "";
    if (!files.length) return;
    setErr("");
    let next = { ...jamo }, st = { ...stat }, lastPage = page;
    const notes = [];
    for (let i = 0; i < files.length; i++) {
      setBusy(`사진 ${i + 1}/${files.length} 읽는 중…`);
      try {
        const fd = new FormData();
        fd.append("file", await shrink(files[i]));
        const r = await api("/handwriting/extract", { method: "POST", body: fd, timeout: 120000 });
        const items = [];
        for (const c of r.cells) {
          st[c.key] = c.status;
          if (c.d && c.status !== "empty") { next[c.key] = c.d; items.push({ key: c.key, d: c.d }); }
        }
        lastPage = r.page;
        notes.push(`${r.page + 1}장: 따낸 칸 ${r.counts.ok}${r.counts.faint ? ` · 흐림 ${r.counts.faint}` : ""}${r.counts.messy ? ` · 넘침 ${r.counts.messy}` : ""}`);
        setBusy(`사진 ${i + 1}/${files.length} 저장 중…`);
        await store(items, { ...next });
      } catch (ex) {
        notes.push(`사진 ${i + 1}: ${ex.message}`);
        setErr((x) => (x ? x + "\n" : "") + `사진 ${i + 1}: ${ex.message}`);
      }
    }
    setStat(st); setPage(lastPage); setBusy("");
    toast(notes.join(" / "));
  };

  const cellsOf = (p) => layout?.pages[p] || [];
  const doneIn = (p) => cellsOf(p).filter((c) => jamo[c.key]).length;
  const total = layout ? layout.count : 237;
  const doneAll = Object.keys(jamo).length;

  // 만들 수 있는 글자 (필수 목록 중 한글)
  const hangul = useMemo(() => required.filter((ch) => partsFor(ch)), [required]);
  const ready = useMemo(() => hangul.filter((ch) => partsFor(ch).every((k) => jamo[k])), [hangul, jamo]);

  const applyAll = async () => {
    if (!ready.length) return;
    setApplying(true);
    try {
      const files = {};
      for (const ch of ready) { const d = composeD(ch, jamo); if (d) files[fileName(ch)] = strToU8(glyphSvg(d)); }
      const zip = new File([zipSync(files, { level: 6 })], "손글씨 조합.zip", { type: "application/zip" });
      await applyGlyphZip(zip, `손글씨 조합 ${Object.keys(files).length}자`);
      toast(`손글씨로 ${Object.keys(files).length}자를 만들어 넣었어요`);
    } catch (e) { toast(e.message || "넣지 못했습니다."); }
    finally { setApplying(false); }
  };

  const cur = sel && cellsOf(page).find((c) => c.key === sel);

  return (
    <section className="screen active" id="handwriting">
      <PageHead eyebrow="HANDWRITING" title="손글씨로 만들기" desc="종이에 자음·모음을 쓰고 사진을 올리면, 2,350자를 자동으로 맞춰 만듭니다." badge={`${doneAll}/${total}칸`} />

      <Card title="1. 종이 받아 쓰기" aside={<span className="badge">A4 · 6장</span>}>
        <p className="muted" style={{ marginTop: 0 }}>인쇄해서 <b>검은 펜</b>으로 진한 점선 칸에만 쓰세요. 파란 글자·선은 사진에서 지워집니다. <b>1장만 써도 192자</b>(가·개·거·기·나…), 3장이면 1,309자, 6장이면 2,350자를 만들 수 있어요.</p>
        <a className="btn fullwidth" href={PDF} target="_blank" rel="noopener" download>⇩ 손글씨 종이 PDF 받기</a>
        <div className="hw-pages" role="group" aria-label="장별 진행">
          {(layout?.pages || Array.from({ length: 6 }, () => [])).map((p, i) => (
            <button key={i} className={"hw-page" + (page === i ? " on" : "") + (layout && doneIn(i) === p.length && p.length ? " done" : "")} onClick={() => { setPage(i); setSel(null); }}>
              <b>{i + 1}장</b><small>{layout ? `${doneIn(i)}/${p.length}` : "…"}</small>
            </button>
          ))}
        </div>
      </Card>

      <Card title="2. 쓴 종이 사진 올리기" aside={busy ? <StatusChip status="running">{busy}</StatusChip> : null}>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPhotos} />
        <Button className="fullwidth" loading={!!busy} disabled={engine.status !== "online" || !layout} onClick={() => fileRef.current?.click()}>📷 사진 고르기·찍기 (여러 장 가능)</Button>
        <p className="muted" style={{ margin: "8px 0 0" }}>종이 <b>네 귀퉁이의 검은 네모</b>가 모두 나오게, 밝은 곳에서 위에서 찍어 주세요. 몇 번째 장인지는 자동으로 알아봅니다. 같은 장을 다시 올리면 새로 쓴 칸만 바뀝니다.</p>
        {engine.status !== "online" && <Notice>엔진을 깨우는 중입니다. 30초~1분 뒤 올려 주세요.</Notice>}
        {err && <Result show tone="error"><strong>✕ 읽지 못한 사진이 있어요</strong><span style={{ whiteSpace: "pre-line" }}>{err}</span></Result>}
        {!projectId && <p className="muted" style={{ margin: "6px 0 0" }}>잠금을 열면 따낸 글씨가 GitHub에 저장됩니다. 지금은 이 기기에만 저장됩니다.</p>}
      </Card>

      <Card title={`3. ${page + 1}장에서 따낸 글씨`} aside={layout ? `${doneIn(page)}/${cellsOf(page).length}칸` : ""}>
        {loading ? <p className="muted">불러오는 중…</p> : !layout ? <p className="muted">{err || "칸 배치를 받는 중…"}</p> : (
          <>
            <div className="hw-grid">
              {cellsOf(page).map((c) => {
                const s = stat[c.key] && stat[c.key] !== "ok" && !jamo[c.key] ? stat[c.key] : jamo[c.key] ? (stat[c.key] === "faint" || stat[c.key] === "messy" ? stat[c.key] : "ok") : "empty";
                return (
                  <button key={c.key} className={"hw-cell st-" + s + (sel === c.key ? " on" : "")} onClick={() => setSel(sel === c.key ? null : c.key)}
                    aria-label={`${c.jamo} (${c.sample}) ${ST[s][1]}`}>
                    <Piece d={jamo[c.key]} />
                    <small>{c.jamo}·{c.sample}</small>
                  </button>
                );
              })}
            </div>
            {cur && (
              <div className="hw-act">
                <b>{cur.jamo} · {cur.sample}</b>
                <Button variant="light" onClick={() => setEditing(cur)}>✎ 편집기로 고치기·그리기</Button>
                {jamo[cur.key] && <Button variant="light" onClick={() => { const n = { ...jamo }; delete n[cur.key]; store([{ key: cur.key, d: null }], n); setSel(null); }}>비우기</Button>}
              </div>
            )}
            <p className="muted" style={{ margin: "8px 0 0" }}>칸을 누르면 고칠 수 있어요. 흐리거나 넘친 칸은 다시 써서 찍거나 편집기로 다듬으세요.</p>
          </>
        )}
      </Card>

      <Card title="4. 2,350자 자동 조합" aside={<StatusChip status={ready.length ? "success" : "neutral"}>{ready.length.toLocaleString()} / {hangul.length.toLocaleString()}자</StatusChip>}>
        <div className="hw-preview" aria-label="내 손글씨로 조합한 문장">
          {[...text].map((ch, i) => {
            if (ch === " ") return <span key={i} className="hw-space" />;
            const d = partsFor(ch) ? composeD(ch, jamo) : null;
            return d ? <Piece key={i} d={d} size={46} /> : <span key={i} className="hw-miss" title="아직 칸이 없음">{ch}</span>;
          })}
        </div>
        <input className="search" style={{ width: "100%", marginTop: 8 }} value={text} onChange={(e) => setText(e.target.value)} maxLength={40} aria-label="미리 볼 문장" />
        <p className="muted" style={{ margin: "8px 0 0" }}>회색 글자는 아직 필요한 칸을 쓰지 않은 글자예요. 조합은 화면에 보이는 그대로 폰트가 됩니다.</p>
        <Button className="fullwidth" loading={applying} disabled={!ready.length} onClick={applyAll}>조합한 {ready.length.toLocaleString()}자를 폰트 글자로 넣기 ↗</Button>
        <p className="muted" style={{ margin: "8px 0 0" }}>넣으면 같은 글자는 새 조합으로 바뀌고, 자동으로 검수됩니다. 그다음 <button className="linkbtn" onClick={() => go("build")}>빌드 탭에서 폰트 만들기 →</button></p>
      </Card>

      {editing && (
        <GlyphEditor glyph={{ char: editing.jamo, codepoint: `${editing.sample} 칸`, filename: editing.key + ".svg" }}
          list={cellsOf(page).map((c) => ({ char: c.jamo, codepoint: `${c.sample} 칸`, filename: c.key + ".svg" }))}
          toast={toast}
          loadSvg={async (fn) => { const d = jamo[fn.slice(0, -4)]; return d ? glyphSvg(d) : null; }}
          onSave={async (fn, svg) => {
            const key = fn.slice(0, -4), d = (/ d="([^"]*)"/.exec(svg) || [])[1];
            if (!d) throw new Error("그린 모양이 없습니다.");
            await store([{ key, d }], { ...jamo, [key]: d });
            toast(`${editing.jamo} 칸 저장`);
          }}
          onClose={() => setEditing(null)}
          onNavigate={(g) => setEditing(cellsOf(page).find((c) => c.key + ".svg" === g.filename))} />
      )}
    </section>
  );
}
