"use client";
import { useState } from "react";
import { SAMPLE_GLYPHS } from "./data";

function PageHead({ eyebrow, title, desc, badge }) {
  return (
    <div className="pagehead">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      <span className="badge">{badge}</span>
    </div>
  );
}

function Result({ show, children }) {
  return <div className={"result" + (show ? " show" : "")} role="status">{children}</div>;
}

export function HomeScreen({ go }) {
  return (
    <section className="screen active" id="home">
      <div className="welcome">
        <div>
          <div className="eyebrow">YOUR TYPE WORKSPACE</div>
          <h1>좋은 글자는<br />좋은 흐름에서 시작돼요.</h1>
          <p>글리프를 만들고, 기준을 확인하고, 나만의 폰트로 완성하세요.</p>
        </div>
        <div className="date">HANGUL FONT PROJECT&nbsp; / &nbsp;01</div>
      </div>
      <div className="hero">
        <div className="hero-copy">
          <div className="eyebrow">LET’S MAKE TYPE</div>
          <h2>한 글자씩 쌓아가는<br />나만의 한글 서체.</h2>
          <p>문자 세트 준비부터 SVG 검수와 폰트 빌드까지<br />한 곳에서 관리할 수 있어요.</p>
          <button className="btn" onClick={() => go("glyphs")}>글리프 작업 시작하기&nbsp; ↗</button>
        </div>
        <div className="hero-art" aria-hidden="true"><span>한</span></div>
      </div>
      <div className="metrics">
        <div className="metric">
          <div className="metric-top">필수 한글 세트 <span className="metric-icon">ㄱ</span></div>
          <strong>2,350</strong><small>KS X 1001 완성형</small>
        </div>
        <div className="metric">
          <div className="metric-top">샘플 제작 현황 <span className="metric-icon">▦</span></div>
          <strong>08<span style={{ fontSize: 13, color: "#999" }}> / 12</span></strong><small>컨셉 데이터 기준</small>
        </div>
        <div className="metric">
          <div className="metric-top">검수 상태 <span className="metric-icon">✓</span></div>
          <strong style={{ fontSize: 21 }}>확인 필요</strong><small>누락 글리프 샘플 4건</small>
        </div>
      </div>
      <div className="section-title"><h2>빠른 작업</h2><span>QUICK ACTIONS</span></div>
      <div className="quick-grid">
        <button className="quick" onClick={() => go("glyphs")}><div className="qico">▦</div><b>문자 세트</b><small>필수 글자 목록 확인</small></button>
        <button className="quick" onClick={() => go("check")}><div className="qico">✓</div><b>SVG 규격 검수</b><small>오류와 누락 확인</small></button>
        <button className="quick" onClick={() => go("build")}><div className="qico">↗</div><b>폰트 빌드</b><small>산출물 생성 준비</small></button>
      </div>
      <div className="bottom-grid">
        <div className="panel">
          <h3>최근 작업</h3>
          <div className="activity"><div className="activity-icon">▦</div><div><b>기본 한글 글리프 세트</b><small>샘플 데이터 · 방금 전</small></div><span className="state">검수 필요</span></div>
          <div className="activity"><div className="activity-icon">⚙</div><div><b>폰트 기본 설정</b><small>My Hangul Font</small></div><span className="state" style={{ background: "#edf2e8", color: "#54714a" }}>저장됨</span></div>
        </div>
        <div className="panel">
          <h3>제작 파이프라인</h3>
          <div className="pipeline">
            <div className="step"><span className="stepnum">01</span><div><b>문자 세트</b><small>2,350자 목록 준비</small></div></div>
            <div className="step"><span className="stepnum">02</span><div><b>SVG 품질 검수</b><small>규격과 경로 확인</small></div></div>
            <div className="step"><span className="stepnum">03</span><div><b>폰트 내보내기</b><small>TTF · PNG · PDF</small></div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function GlyphsScreen({ toast }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(SAMPLE_GLYPHS[0]);
  const [charsetShown, setCharsetShown] = useState(false);
  const query = q.trim().toLowerCase();
  const list = SAMPLE_GLYPHS.filter(
    (g) => (filter === "all" || (filter === "ready" ? g[2] : !g[2])) &&
      (g[0].includes(query) || g[1].toLowerCase().includes(query))
  );
  return (
    <section className="screen active" id="glyphs">
      <PageHead eyebrow="GLYPH LIBRARY" title="글리프 라이브러리" desc="제작할 글자를 찾고 준비 상태를 관리합니다." badge="KS X 1001 · 2,350자" />
      <div className="card">
        <div className="cardhead"><h3>문자 세트</h3><span className="muted">한글 완성형 + 숫자·영문·기호</span></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div><strong style={{ fontSize: 28, letterSpacing: "-.05em" }}>2,350</strong><div className="muted">필수 한글 글리프</div></div>
          <button className="btn" onClick={() => { setCharsetShown(true); toast("문자 세트 생성 요청을 준비했습니다."); }}>목록 생성&nbsp; ↗</button>
        </div>
        <Result show={charsetShown}><strong>문자 세트 생성 요청 준비 완료</strong>실제 CSV 파일 생성은 Python 엔진 연결 후 실행됩니다.</Result>
      </div>
      <div className="card">
        <div className="cardhead"><h3>글리프 탐색</h3><span className="muted">샘플 12자</span></div>
        <div className="toolbar">
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="문자 또는 코드 포인트 검색 · 가, U+AC00" aria-label="글리프 검색" />
          <div className="filters" role="group" aria-label="상태 필터">
            {[["all", "전체"], ["ready", "완료"], ["missing", "누락"]].map(([k, l]) => (
              <button key={k} className={"filter" + (filter === k ? " active" : "")} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="glyph-layout">
        <div className="card">
          <div className="cardhead"><h3>문자 미리보기</h3><span className="muted">선택하여 상세 확인</span></div>
          <div className="glyph-grid">
            {list.length === 0 && <p className="muted">검색 결과가 없습니다.</p>}
            {list.map((g) => (
              <button key={g[1]} className={"glyph-cell" + (!g[2] ? " missing" : "") + (selected[0] === g[0] ? " selected" : "")}
                onClick={() => setSelected(g)} aria-label={`${g[0]} ${g[1]} ${g[2] ? "제작 완료" : "누락"}`}>
                <i className="mark" /><span className="char">{g[0]}</span><small>{g[1]}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><h3>글리프 상세</h3>
            <span className="badge" style={{ background: selected[2] ? "#edf2e8" : "#f7efdf" }}>{selected[2] ? "✓ 제작 완료" : "△ 누락"}</span>
          </div>
          <div className="preview">
            <div className="bigchar">{selected[0]}</div>
            <div>
              <div className="code">{selected[1]}</div>
              <div className="preview-meta">
                <div><small>파일명</small><b>{selected[1]}.svg</b></div>
                <div><small>캔버스</small><b>1000 × 1000</b></div>
              </div>
            </div>
          </div>
          <p className="muted" style={{ margin: "13px 0 0" }}>기준선 y=800 · SVG 절대좌표 규칙을 사용합니다.</p>
        </div>
      </div>
    </section>
  );
}

export function CheckScreen({ toast }) {
  const [path, setPath] = useState("./glyphs");
  const [done, setDone] = useState(null);
  const run = () => {
    const p = path.trim();
    if (!p) { toast("글리프 폴더 경로를 입력해 주세요."); return; }
    setDone(p);
    toast("데모 검수 결과를 표시했습니다.");
  };
  return (
    <section className="screen active" id="check">
      <PageHead eyebrow="QUALITY CONTROL" title="SVG 규격 검수" desc="폰트 빌드 전에 글리프 파일의 구조와 규격을 확인합니다." badge="CLI · check" />
      <div className="card">
        <div className="cardhead"><h3>검수 대상</h3><span className="badge">INPUT</span></div>
        <div className="field">
          <label htmlFor="glyphPath">글리프 폴더 경로</label>
          <input id="glyphPath" value={path} onChange={(e) => setPath(e.target.value)} />
          <div className="help">예: 프로젝트 루트 기준 ./glyphs (5단계에서 zip 올리기로 바뀝니다)</div>
        </div>
        <div className="checks">
          <label className="checkrow"><input type="checkbox" checked disabled readOnly /> 필수 글자 누락 및 U+XXXX.svg 파일명 규칙</label>
          <label className="checkrow"><input type="checkbox" checked disabled readOnly /> viewBox 0 0 1000 1000 및 기준선 규격</label>
          <label className="checkrow"><input type="checkbox" checked disabled readOnly /> 열린 경로 및 미지원 SVG 명령</label>
        </div>
        <div className="notice">지원 요소: &lt;path&gt; 절대좌표 M L H V C Q Z 및 &lt;rect&gt;. transform, 상대좌표, arc(A)는 지원하지 않습니다.</div>
        <button className="btn" onClick={run}>검수 실행&nbsp; ↗</button>
        <Result show={!!done}>
          <strong>데모 검수 결과 — 실제 파일 검사는 수행하지 않았습니다.</strong>
          검사 대상: {done}<br />샘플 데이터: 누락 글리프 4건 · 파일 규격 확인 필요<br />Python 엔진 연결 후 실제 검사 결과로 대체됩니다.
        </Result>
      </div>
      <div className="card">
        <div className="cardhead"><h3>검수 항목 안내</h3><span className="muted">CHECKLIST</span></div>
        <div className="activity"><div className="activity-icon">!</div><div><b>파일 누락</b><small>문자 세트 대비 SVG 파일이 없는지 확인</small></div></div>
        <div className="activity"><div className="activity-icon">⌗</div><div><b>캔버스 규격</b><small>1000 × 1000 viewBox 기준 확인</small></div></div>
        <div className="activity"><div className="activity-icon">⌁</div><div><b>경로 문법</b><small>열린 경로와 미지원 명령 확인</small></div></div>
      </div>
    </section>
  );
}

export function BuildScreen({ toast, settings }) {
  const [inPath, setInPath] = useState("./glyphs");
  const [outPath, setOutPath] = useState("./font_out");
  const [name, setName] = useState(settings.name);
  const [allow, setAllow] = useState(false);
  const [done, setDone] = useState(null);
  const run = () => {
    const p = inPath.trim(), o = outPath.trim();
    if (!p || !o) { toast("입력·출력 경로를 확인해 주세요."); return; }
    setDone({ p, o, allow });
    toast("빌드 요청 설정을 확인했습니다.");
  };
  const files = [
    ["TTF", "TrueType Font", "설치 및 배포용 폰트 파일", "필수"],
    ["PNG", "글자 견본표", "문자별 디자인 확인"],
    ["PDF", "폰트 견본 PDF", "인쇄 및 공유용"],
    ["TXT", "상품 설명 · 라이선스 초안", "판매 등록 전 검토용"],
  ];
  return (
    <section className="screen active" id="build">
      <PageHead eyebrow="FONT EXPORT" title="폰트 빌드" desc="설정을 확인하고 제작 산출물 생성을 준비합니다." badge="CLI · build" />
      <div className="card">
        <div className="cardhead"><h3>빌드 설정</h3><span className="badge">CONFIG</span></div>
        <div className="formgrid">
          <div className="field"><label htmlFor="buildPath">글리프 폴더</label><input id="buildPath" value={inPath} onChange={(e) => setInPath(e.target.value)} /></div>
          <div className="field"><label htmlFor="outPath">출력 폴더</label><input id="outPath" value={outPath} onChange={(e) => setOutPath(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="fontName">글꼴 패밀리 이름</label><input id="fontName" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <label className="checkrow"><input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} /> 누락 글리프 허용 <span className="muted">(시험용 옵션)</span></label>
        <div className="notice">누락 글리프가 있으면 기본 빌드는 중단됩니다. 시험용 빌드에서만 누락 허용을 켜세요.</div>
        <button className="btn" onClick={run}>빌드 요청 준비&nbsp; ↗</button>
        <Result show={!!done}>
          {done && (<>
            <strong>빌드 요청 설정이 준비되었습니다.</strong>
            입력: {done.p}<br />출력: {done.o}<br />누락 허용: {done.allow ? "시험용 ON" : "OFF"}<br /><br />
            현재는 UI 데모이므로 실제 TTF·PNG·PDF 파일을 생성하지 않습니다.
          </>)}
        </Result>
      </div>
      <div className="card">
        <div className="cardhead"><h3>생성 예정 산출물</h3><span className="muted">OUTPUT FILES</span></div>
        {files.map(([t, b, s, tag]) => (
          <div className="artifact" key={t}><div className="filetype">{t}</div><div><b>{b}</b><small>{s}</small></div>{tag && <span className="badge">{tag}</span>}</div>
        ))}
      </div>
    </section>
  );
}

export function SettingsScreen({ toast, settings, saveSettings }) {
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = () => {
    if (!form.name.trim()) { toast("글꼴 이름을 입력해 주세요."); return; }
    saveSettings({ ...form, name: form.name.trim() });
    setSaved(true);
    toast("설정값을 브라우저에 저장했습니다.");
  };
  return (
    <section className="screen active" id="settings">
      <PageHead eyebrow="PROJECT SETTINGS" title="프로젝트 설정" desc="폰트 메타데이터와 미리보기 기본값을 관리합니다." badge="font.json" />
      <div className="card">
        <div className="cardhead"><h3>기본 정보</h3><span className="muted">FONT PROFILE</span></div>
        <div className="field"><label htmlFor="settingName">글꼴 패밀리 이름</label><input id="settingName" value={form.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="spacing">자간</label><input id="spacing" type="number" step="0.1" inputMode="decimal" value={form.spacing} onChange={set("spacing")} /></div>
        <div className="field"><label htmlFor="previewText">미리보기 문장</label><textarea id="previewText" value={form.preview} onChange={set("preview")} /></div>
        <button className="btn" onClick={save}>설정 저장</button>
        <Result show={saved}><strong>설정값을 이 브라우저에 저장했습니다.</strong>실제 config/font.json 반영은 API 연결 후 지원됩니다.</Result>
      </div>
      <div className="card">
        <div className="cardhead"><h3>엔진 연결</h3><span className="demo">● OFFLINE</span></div>
        <p className="muted">Python 3.10+ · fontTools · Pillow · reportlab · pypdf</p>
        <div className="notice">현재 화면은 컨셉 데모입니다. 실제 SVG 검사와 TTF·PNG·PDF 생성은 Python 엔진/API 연결 전까지 수행하지 않습니다. 마켓 입점·심사·등록은 사용자가 직접 진행합니다.</div>
      </div>
    </section>
  );
}
