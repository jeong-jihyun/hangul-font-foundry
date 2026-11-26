"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TABS, SETTINGS_KEY, DEFAULT_SETTINGS } from "../components/data";
import { DemoBadge } from "../components/ui";
import { useEngine, api } from "../lib/api";
import { GlyphsScreen } from "../components/GlyphsScreen";
import { CheckScreen, zipMemory, ensureGlyphSet } from "../components/CheckScreen";
import { HomeScreen } from "../components/HomeScreen";
import { ProjectBar } from "../components/ProjectBar";
import {
  useSession, listProjects, createProject, updateProject, deleteProject,
  saveProjectZip, loadProjectZip, mergedZip, countSvgs, slimCheck,
} from "../lib/store";
import { BuildScreen } from "../components/BuildScreen";
import { SettingsScreen } from "../components/Screens";

const IDS = TABS.map((t) => t.id);

export default function Page() {
  const [tab, setTab] = useState("home");
  const [msg, setMsg] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const timer = useRef();
  const pidRef = useRef(null);
  const engine = useEngine();
  // 마지막 검수 결과: 글리프 탭의 완료/누락 표시에 쓰고, 새로고침해도 남도록 브라우저에 저장
  const [check, setCheckState] = useState(null);
  // ---- 8단계: 비밀번호(PIN) 잠금 + 폰트 프로젝트 (Vercel 보관함) ----
  const auth = useSession();
  const uid = auth.status === "in" ? "owner" : null;
  const [projects, setProjects] = useState([]);
  const [pid, setPid] = useState(null);
  const [saving, setSaving] = useState("");
  const current = projects.find((p) => p.id === pid) || null;
  const refresh = async () => { if (uid) { const l = await listProjects(); setProjects(l); return l; } return []; };

  const setCheck = (c) => {
    setCheckState(c);
    try { localStorage.setItem("glyphroom-check", JSON.stringify(c)); } catch {}
    if (uid && pidRef.current) updateProject(pidRef.current, { lastCheck: slimCheck(c) }).catch(() => {});
  };
  // 마지막 빌드: 어느 탭에 있어도 진행 상황을 계속 확인하고, 홈에서도 보이게 앱 전체에서 공유
  const [build, setBuildState] = useState(null);
  const setBuild = (b) => {
    setBuildState(b);
    try { localStorage.setItem("glyphroom-build", JSON.stringify(b)); } catch {}
    if (uid && pidRef.current && b && ["succeeded", "failed", "cancelled"].includes(b.status)) {
      const { log, ...rest } = b; // 기록은 빼고 요약만 저장
      updateProject(pidRef.current, { lastBuild: rest }).catch(() => {});
    }
  };
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

  // 로그인되면 폰트 목록을 읽고, 마지막에 쓰던 폰트를 연다 (없으면 하나 만들어 줌)
  useEffect(() => {
    if (auth.status !== "in") { setProjects([]); setPid(null); pidRef.current = null; zipMemory.loader = null; return; }
    (async () => {
      let l = await refresh();
      if (!l.length) { await createProject("나의 첫 폰트"); l = await refresh(); }
      const saved = localStorage.getItem("glyphroom-project-" + uid);
      openProject(l.find((p) => p.id === saved) ? saved : l[0].id, l);
    })().catch(() => toast("폰트 목록을 불러오지 못했습니다."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status, uid]);

  // 폰트를 바꾸면: 그 폰트의 마지막 검수·빌드 결과로 화면을 바꾸고, 글자는 저장소에서 필요할 때 불러온다
  const openProject = (id, list = projects) => {
    const p = list.find((x) => x.id === id);
    if (!p) return;
    setPid(id); pidRef.current = id;
    try { localStorage.setItem("glyphroom-project-" + uid, id); } catch {}
    zipMemory.file = null; zipMemory.glyphSetId = null; zipMemory.replacements = {}; zipMemory.removed = [];
    zipMemory.loader = p.hasZip ? () => loadProjectZip(id, p.name) : null;
    setCheckState(p.lastCheck || null);
    setBuildState(p.lastBuild || null);
  };

  // 지금 글자 묶음(원래 zip + 교체·빼기 반영)을 폰트에 저장. 저장 횟수를 아끼려고 zip 한 개로.
  const persistZip = async (msg) => {
    if (!uid || !pidRef.current || !zipMemory.file) return;
    const id = pidRef.current;
    try {
      setSaving("저장 중…");
      const zip = await mergedZip(zipMemory.file, zipMemory.replacements, zipMemory.removed);
      await saveProjectZip(id, zip, (pct) => setSaving(`저장 중 ${pct}%`));
      const n = await countSvgs(zip);
      await updateProject(id, { hasZip: true, glyphCount: n });
      zipMemory.loader = () => loadProjectZip(id, current?.name);
      await refresh();
      if (msg) toast(msg);
    } catch { toast("글자를 저장하지 못했습니다. 잠시 뒤 다시 해 주세요."); }
    finally { setSaving(""); }
  };
  const onZipChecked = () => persistZip(`글자를 '${current?.name || "폰트"}'에 저장했어요`);
  const onGlyphReplaced = () => persistZip();
  const onFileRemoved = () => persistZip();

  // 검수에 쓴 글자로 바로 만들기 (zip 을 다시 고를 필요 없음)
  const startBuild = async ({ familyName, allowMissing }) => {
    const body = (gid) => ({ projectId: "prj_0009", glyphSetId: gid, allowMissing, familyName, previewText: settings.preview });
    let gid = (zipMemory.file || zipMemory.loader) ? await ensureGlyphSet(zipMemory.file) : check?.glyphSetId;
    if (!gid) throw new Error("먼저 검수 탭에서 글리프 zip을 올려 주세요.");
    let r;
    try { r = await api("/builds", { method: "POST", body: body(gid) }); }
    catch (e) {
      if (e.status !== 404) throw e;
      if (!zipMemory.file && !zipMemory.loader) throw new Error("서버 보관 시간이 지나 글자를 다시 올려야 합니다. 검수 탭에서 같은 zip을 다시 골라 주세요.");
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
          <div className="side-bottom">HANGUL FONT KIT<br />Glyphroom web · step 8<br />Made for type creators.</div>
        </aside>
        <main className="main">
          <ProjectBar auth={auth} projects={projects} current={current} saving={saving} toast={toast}
            onSelect={(id) => openProject(id)}
            onUnlocked={() => auth.refresh()}
            onCreate={async (name) => { const p = await createProject(name); const l = await refresh(); openProject(p.id, l); }}
            onRename={async (id, name) => { await updateProject(id, { name }); await refresh(); }}
            onDelete={async (id) => { await deleteProject(id); let l = await refresh(); if (!l.length) { await createProject("나의 첫 폰트"); l = await refresh(); } openProject(l[0].id, l); }} />
          {tab === "home" && <HomeScreen go={go} check={check} build={build} engine={engine} />}
          {tab === "glyphs" && <GlyphsScreen toast={toast} engine={engine} check={check} setCheck={setCheck} go={go} onGlyphReplaced={onGlyphReplaced} />}
          {tab === "check" && <CheckScreen toast={toast} engine={engine} check={check} setCheck={setCheck} go={go} onZipChecked={onZipChecked} onFileRemoved={onFileRemoved} />}
          {tab === "build" && ready && <BuildScreen settings={settings} engine={engine} check={check} go={go} build={build} startBuild={startBuild} cancelBuild={cancelBuild} />}
          {tab === "settings" && ready && <SettingsScreen toast={toast} settings={settings} saveSettings={saveSettings} engine={engine} />}
        </main>
      </div>
      <nav className="mobilebar" aria-label="주요 메뉴 (모바일)">{navButtons(true)}</nav>
      <div className={"toast" + (msg ? " show" : "")} role="status" aria-live="polite">{msg}</div>
    </div>
  );
}
