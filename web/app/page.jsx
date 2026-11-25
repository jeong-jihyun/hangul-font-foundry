"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TABS, SETTINGS_KEY, DEFAULT_SETTINGS } from "../components/data";
import { DemoBadge } from "../components/ui";
import { HomeScreen, GlyphsScreen, CheckScreen, BuildScreen, SettingsScreen } from "../components/Screens";

const IDS = TABS.map((t) => t.id);

export default function Page() {
  const [tab, setTab] = useState("home");
  const [msg, setMsg] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const timer = useRef();

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
        <div className="topright"><DemoBadge /><div className="avatar" aria-hidden="true">GF</div></div>
      </header>
      <div className="layout">
        <aside className="sidebar">
          <div className="workspace-label">WORKSPACE</div>
          <nav className="nav" aria-label="주요 메뉴">{navButtons(false)}</nav>
          <div className="side-bottom">HANGUL FONT KIT<br />Glyphroom web · step 2<br />Made for type creators.</div>
        </aside>
        <main className="main">
          {tab === "home" && <HomeScreen go={go} />}
          {tab === "glyphs" && <GlyphsScreen toast={toast} />}
          {tab === "check" && <CheckScreen toast={toast} />}
          {tab === "build" && ready && <BuildScreen toast={toast} settings={settings} />}
          {tab === "settings" && ready && <SettingsScreen toast={toast} settings={settings} saveSettings={saveSettings} />}
        </main>
      </div>
      <nav className="mobilebar" aria-label="주요 메뉴 (모바일)">{navButtons(true)}</nav>
      <div className={"toast" + (msg ? " show" : "")} role="status" aria-live="polite">{msg}</div>
    </div>
  );
}
