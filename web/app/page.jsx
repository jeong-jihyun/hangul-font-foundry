"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TABS, SETTINGS_KEY, DEFAULT_SETTINGS } from "../components/data";
import { DemoBadge } from "../components/ui";
import { useEngine, api } from "../lib/api";
import { GlyphsScreen } from "../components/GlyphsScreen";
import { CheckScreen, zipMemory, ensureGlyphSet } from "../components/CheckScreen";
import { HomeScreen } from "../components/HomeScreen";
import { BuildScreen } from "../components/BuildScreen";
import { SettingsScreen } from "../components/Screens";

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
  // 마지막 빌드: 어느 탭에 있어도 진행 상황을 계속 확인하고, 홈에서도 보이게 앱 전체에서 공유
  const [build, setBuildState] = useState(null);
  const setBuild = (b) => { setBuildState(b); try { localStorage.setItem("glyphroom-build", JSON.stringify(b)); } catch {} };
  const buildActive = build && (build.status === "queued" || build.status === "running");
  useEffect(() => {
    if (!buildActive) return;
    let stop = false;
    const id = setInterval(async () => {
      try {
        const b = await api("/builds/" + build.buildId, { timeout: 20000 });
        if (stop) return;
        setBuild(b);
        if (b.status === "succeeded") toast(`폰트를 만들었어요 · ${b.glyphCount}자`);
        if (b.status === "failed") toast("폰트를 만들지 못했어요 — 이유를 확인해 주세요");
      } catch (e) {
        if (!stop && e.status === 404) setBuild({ ...build, status: "failed", error: { message: e.message } });
      }
    }, 1000);
    return () => { stop = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildActive, build?.buildId]);

  // 검수에 쓴 글자로 바로 만들기 (zip 을 다시 고를 필요 없음)
  const startBuild = async ({ familyName, allowMissing }) => {
    const body = (gid) => ({ projectId: "prj_0009", glyphSetId: gid, allowMissing, familyName, previewText: settings.preview });
    let gid = zipMemory.file ? await ensureGlyphSet(zipMemory.file) : check?.glyphSetId;
    if (!gid) throw new Error("먼저 검수 탭에서 글리프 zip을 올려 주세요.");
    let r;
    try { r = await api("/builds", { method: "POST", body: body(gid) }); }
    catch (e) {
      if (e.status !== 404) throw e;
      if (!zipMemory.file) throw new Error("서버 보관 시간이 지나 글자를 다시 올려야 합니다. 검수 탭에서 같은 zip을 다시 골라 주세요.");
      zipMemory.glyphSetId = null; gid = await ensureGlyphSet(zipMemory.file);
      r = await api("/builds", { method: "POST", body: body(gid) });
    }
    setBuild({ buildId: r.buildId, status: "queued", progress: 0, steps: [], artifacts: [], createdAt: new Date().toISOString(), familyName, allowMissing });
  };
  const cancelBuild = async () => {
    try { await api("/builds/" + build.buildId, { method: "DELETE" }); toast("취소를 요청했습니다."); } catch (e) { toast(e.message); }
  };

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
      const bd = JSON.parse(localStorage.getItem("glyphroom-build") || "null");
      if (bd && bd.buildId) setBuildState(bd);
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
          <div className="side-bottom">HANGUL FONT KIT<br />Glyphroom web · step 7<br />Made for type creators.</div>
        </aside>
        <main className="main">
          {tab === "home" && <HomeScreen go={go} check={check} build={build} engine={engine} />}
          {tab === "glyphs" && <GlyphsScreen toast={toast} engine={engine} check={check} setCheck={setCheck} go={go} />}
          {tab === "check" && <CheckScreen toast={toast} engine={engine} check={check} setCheck={setCheck} go={go} />}
          {tab === "build" && ready && <BuildScreen settings={settings} engine={engine} check={check} go={go} build={build} startBuild={startBuild} cancelBuild={cancelBuild} />}
          {tab === "settings" && ready && <SettingsScreen toast={toast} settings={settings} saveSettings={saveSettings} engine={engine} />}
        </main>
      </div>
      <nav className="mobilebar" aria-label="주요 메뉴 (모바일)">{navButtons(true)}</nav>
      <div className={"toast" + (msg ? " show" : "")} role="status" aria-live="polite">{msg}</div>
    </div>
  );
}
