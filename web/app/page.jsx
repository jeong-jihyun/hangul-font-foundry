"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TABS, SETTINGS_KEY, DEFAULT_SETTINGS } from "../components/data";
import { DemoBadge } from "../components/ui";
import { useEngine } from "../lib/api";
import { GlyphsScreen } from "../components/GlyphsScreen";
import { CheckScreen } from "../components/CheckScreen";
import { BuildScreen } from "../components/BuildScreen";
import { HomeScreen, SettingsScreen } from "../components/Screens";

const IDS = TABS.map((t) => t.id);

export default function Page() {
  const [tab, setTab] = useState("home");
  const [msg, setMsg] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const timer = useRef();
  const engine = useEngine();
  // 마지막 검수 결과: 글리프 탭의 완료/누락 표시에 쓰고, 새로고침해도 남도록 브라우저에 저장
  const [check, setCheckState] = useState(null);
  const setCheck = (c) => { setCheckState(c); try { localStorage.setItem("glyphroom-check", JSON.stringify(c)); } catch {} };

  // 주소 끝(#glyphs 등)으로 화면을 기억 → 새로고침·폰 뒤로가기 버튼이 자연스럽게 동작
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "");
      setTab(IDS.includes(h) ? h : "home");
    };
    read();
    window.addEventListener("hashchange", read);
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (s && typeof s === "object") setSettings({ ...DEFAULT_SETTINGS, ...s });
      const c = JSON.parse(localStorage.getItem("glyphroom-check") || "null");
      if (c && c.summary) setCheckState(c);
    } catch {}
    setReady(true);
    // 폰에서 글자를 입력하는 동안 하단 탭을 숨겨 키보드 위 입력칸·버튼을 가리지 않게 함
    const isField = (el) => el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "file", "button"].includes(el.type)));
    const onIn = (e) => { if (isField(e.target)) document.body.classList.add("typing"); };
    const onOut = () => setTimeout(() => { if (!isField(document.activeElement)) document.body.classList.remove("typing"); }, 50);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      window.removeEventListener("hashchange", read);
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  const go = useCallback((id) => {
    if (window.location.hash !== "#" + id) window.location.hash = id;
    setTab(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const toast = useCallback((s) => {
    setMsg(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(""), 2300);
  }, []);

  const saveSettings = (s) => {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
  };

  const navButtons = (useShort) =>
    TABS.map((t) => (
      <button key={t.id} className={tab === t.id ? "active" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => go(t.id)}>
        <span className="ico" aria-hidden="true">{t.ico}</span>{useShort ? t.short : t.label}
      </button>
    ));

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand"><div className="brandmark">ㄱ</div>glyphroom <span style={{ fontWeight: 450, color: "#96968d" }}>/ studio</span></div>
        <div className="topright"><button className="badge-btn" onClick={() => go("settings")} aria-label="엔진 연결 상태 보기"><DemoBadge status={engine.status} /></button><div className="avatar" aria-hidden="true">GF</div></div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <div className="workspace-label">WORKSPACE</div>
          <nav className="nav" aria-label="주요 메뉴">{navButtons(false)}</nav>
          <div className="side-bottom">HANGUL FONT KIT<br />Glyphroom web · step 6<br />Made for type creators.</div>
        </aside>
        <main className="main">
          {tab === "home" && <HomeScreen go={go} />}
          {tab === "glyphs" && <GlyphsScreen toast={toast} engine={engine} check={check} go={go} />}
          {tab === "check" && <CheckScreen toast={toast} engine={engine} check={check} setCheck={setCheck} go={go} />}
          {tab === "build" && ready && <BuildScreen toast={toast} settings={settings} engine={engine} check={check} go={go} />}
          {tab === "settings" && ready && <SettingsScreen toast={toast} settings={settings} saveSettings={saveSettings} engine={engine} />}
        </main>
      </div>
      <nav className="mobilebar" aria-label="주요 메뉴 (모바일)">{navButtons(true)}</nav>
      <div className={"toast" + (msg ? " show" : "")} role="status" aria-live="polite">{msg}</div>
    </div>
  );
}
