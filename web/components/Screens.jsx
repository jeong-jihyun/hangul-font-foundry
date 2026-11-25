"use client";
import { useState } from "react";
import { SAMPLE_GLYPHS } from "./data";
import { API_BASE } from "../lib/api";
import { PageHead, Card, Button, Field, Result, Notice, StatusChip, ArtifactRow, IssueRow, DemoBadge } from "./ui";

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
          <h2>한 글자씩 쌓아가는<br /> 나만의 한글 서체.</h2>
          <p>문자 세트 준비부터 SVG 검수와 폰트 빌드까지<br /> 한 곳에서 관리할 수 있어요.</p>
          <Button onClick={() => go("glyphs")}>글리프 작업 시작하기&nbsp; ↗</Button>
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
          <div className="activity"><div className="activity-icon">▦</div><div className="grow"><b>기본 한글 글리프 세트</b><small>샘플 데이터 · 방금 전</small></div><StatusChip status="warning">검수 필요</StatusChip></div>
          <div className="activity"><div className="activity-icon">⚙</div><div className="grow"><b>폰트 기본 설정</b><small>My Hangul Font</small></div><StatusChip status="success">저장됨</StatusChip></div>
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

export function SettingsScreen({ toast, settings, saveSettings, engine }) {
  const [form, setForm] = useState(settings);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setSaved(false); };
  const save = () => {
    const e = {};
    if (!form.name.trim()) e.name = "글꼴 이름을 입력해 주세요.";
    if (form.spacing === "" || isNaN(Number(form.spacing))) e.spacing = "숫자로 입력해 주세요. (예: 0, -10, 20)";
    if (!form.preview.trim()) e.preview = "미리보기 문장을 입력해 주세요.";
    setErrors(e);
    if (Object.keys(e).length) return;
    saveSettings({ ...form, name: form.name.trim() });
    setSaved(true);
    toast("설정값을 브라우저에 저장했습니다.");
  };
  return (
    <section className="screen active" id="settings">
      <PageHead eyebrow="PROJECT SETTINGS" title="프로젝트 설정" desc="폰트 메타데이터와 미리보기 기본값을 관리합니다." badge="font.json" />
      <Card title="기본 정보" aside="FONT PROFILE">
        <Field id="settingName" label="글꼴 패밀리 이름" error={errors.name}><input id="settingName" value={form.name} onChange={set("name")} /></Field>
        <Field id="spacing" label="자간" error={errors.spacing}><input id="spacing" type="number" step="0.1" inputMode="decimal" value={form.spacing} onChange={set("spacing")} /></Field>
        <Field id="previewText" label="미리보기 문장" error={errors.preview}><textarea id="previewText" value={form.preview} onChange={set("preview")} /></Field>
        <Button onClick={save}>설정 저장</Button>
        <Result show={saved}><strong>✓ 설정값을 이 브라우저에 저장했습니다.</strong>실제 config/font.json 반영은 API 연결 후 지원됩니다.</Result>
      </Card>
      <EngineCard engine={engine} />
    </section>
  );
}

// 엔진 연결 카드: 서버 상태를 실제로 확인해 보여 준다 (3단계)
function EngineCard({ engine }) {
  const { status, info, error, checkedAt, check } = engine;
  const busy = status === "checking" || status === "waking";
  const libs = info?.libraries || {};
  return (
    <Card title="엔진 연결" aside={<DemoBadge status={status} short />}>
      {status === "online" && (
        <>
          <div className="kv">
            <div><small>상태</small><b>✓ 연결됨</b></div>
            <div><small>엔진 버전</small><b className="mono">{info.engineVersion}</b></div>
            <div><small>API 버전</small><b className="mono">{info.apiVersion}</b></div>
            <div><small>Python</small><b className="mono">{info.python}</b></div>
          </div>
          <p className="muted" style={{ margin: "10px 0 0" }}>
            {Object.entries(libs).map(([k, v]) => `${k} ${v || "없음"}`).join(" · ")}
          </p>
          <Notice>서버는 연결됐지만 글자 목록·검수·빌드는 아직 데모 결과입니다. 4~7단계에서 하나씩 실제 엔진으로 바뀝니다.</Notice>
        </>
      )}
      {status === "waking" && (
        <Notice>무료 서버가 잠들어 있어 깨우는 중입니다. 처음 한 번은 30초~1분 걸릴 수 있어요. 이 화면을 그대로 두세요.</Notice>
      )}
      {status === "checking" && <p className="muted">서버 상태를 확인하고 있습니다…</p>}
      {status === "offline" && (
        <Result show tone="error"><strong>✕ 엔진에 연결하지 못했습니다.</strong>{error} 잠시 뒤 다시 확인해 주세요. 지금 보이는 결과는 모두 데모입니다.</Result>
      )}
      <div className="row-between" style={{ marginTop: 14 }}>
        <span className="muted mono ellipsis" title={API_BASE}>{API_BASE.replace("https://", "")}</span>
        <Button variant="light" loading={busy} onClick={check}>{busy ? "확인 중" : "다시 확인"}</Button>
      </div>
      {checkedAt && <p className="muted" style={{ margin: "8px 0 0" }}>마지막 확인: {checkedAt.toLocaleTimeString("ko-KR")}</p>}
    </Card>
  );
}
