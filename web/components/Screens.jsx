"use client";
import { useState } from "react";
import { SAMPLE_GLYPHS } from "./data";
import { API_BASE } from "../lib/api";
import { PageHead, Card, Button, Field, Result, Notice, StatusChip, ArtifactRow, IssueRow, DemoBadge } from "./ui";

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
      <PageHead title="설정" desc="미리보기 문장 등 기본값과 엔진 연결 상태를 봅니다." />
      <Card title="기본 정보">
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
          <p className="muted" style={{ margin: "10px 0 0" }}>글자 목록·검수·폰트 만들기는 모두 이 엔진이 실제로 처리합니다.</p>
        </>
      )}
      {status === "waking" && (
        <Notice>무료 서버가 잠들어 있어 깨우는 중입니다. 처음 한 번은 30초~1분 걸릴 수 있어요. 이 화면을 그대로 두세요.</Notice>
      )}
      {status === "checking" && <p className="muted">서버 상태를 확인하고 있습니다…</p>}
      {status === "offline" && (
        <Result show tone="error"><strong>✕ 엔진에 연결하지 못했습니다.</strong>{error} 잠시 뒤 다시 확인해 주세요. 연결되기 전에는 검수·폰트 만들기를 할 수 없습니다.</Result>
      )}
      <div className="row-between" style={{ marginTop: 14 }}>
        <span className="muted mono ellipsis" title={API_BASE}>{API_BASE.replace("https://", "")}</span>
        <Button variant="light" loading={busy} onClick={check}>{busy ? "확인 중" : "다시 확인"}</Button>
      </div>
      {checkedAt && <p className="muted" style={{ margin: "8px 0 0" }}>마지막 확인: {checkedAt.toLocaleTimeString("ko-KR")}</p>}
    </Card>
  );
}
