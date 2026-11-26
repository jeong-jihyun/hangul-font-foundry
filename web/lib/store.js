"use client";
// 폰트 프로젝트 저장 (GitHub 비공개 저장소 hangul-font-glyphs). 잠금은 비밀번호(PIN) 하나.
// 폰트 하나 = 폴더 하나, 글자는 폴더/glyphs/U+AC00.svg — 저장할 때마다 GitHub에 기록이 남는다.
import { unzipSync, strFromU8 } from "fflate";
import { useCallback, useEffect, useState } from "react";

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error?.message || `저장소 오류 (${res.status})`); e.status = res.status; throw e; }
  return data;
}

// ---- 잠금 ----
export function useSession() {
  const [state, setState] = useState({ status: "loading" });
  const check = useCallback(async () => {
    try {
      const r = await call("/api/session");
      setState({ status: !r.configured ? "off" : r.loggedIn ? "in" : "out" });
    } catch { setState({ status: "off" }); }
  }, []);
  useEffect(() => { check(); }, [check]);
  return { ...state, refresh: check };
}
export const unlock = (pin) => call("/api/session", { method: "POST", body: { pin } });
export const lock = () => call("/api/session", { method: "DELETE" });

// ---- 폰트 목록 ----
export const listProjects = async () => (await call("/api/projects")).projects;
export const createProject = (name) => call("/api/projects", { method: "POST", body: { name } });
export const updateProject = (id, data) => call(`/api/projects/${id}`, { method: "PATCH", body: data });
export const deleteProject = (id) => call(`/api/projects/${id}`, { method: "DELETE" });

// ---- 글자 ----
const NAME = /^U\+[0-9A-F]{4,6}\.svg$/;

// zip 안의 올바른 이름(U+AC00.svg) SVG 만 꺼낸다. 이름이 틀린 파일은 저장하지 않음(검수에서 알려 줌)
export async function svgsFromZip(file) {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const out = [];
  for (const [path, data] of Object.entries(files)) {
    const base = path.split("/").pop();
    if (path.includes("__MACOSX") || !NAME.test(base) || data.length > 1_000_000) continue;
    out.push({ name: base, svg: strFromU8(data) });
  }
  return out;
}

// zip 글자 저장: 400자 또는 약 3MB씩 나눠 보냄(Vercel 요청 크기 한도 4.5MB).
// 기본은 합치기(같은 이름만 덮어씀). replaceAll 이면 마지막 묶음에서 새 zip 에 없는 예전 글자를 지운다
export async function saveAllGlyphs(id, items, onProgress, { replaceAll = false } = {}) {
  const names = items.map((i) => i.name);
  const parts = [];
  let cur = [], size = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= 400 || size + it.svg.length > 3_000_000)) { parts.push(cur); cur = []; size = 0; }
    cur.push(it); size += it.svg.length;
  }
  parts.push(cur);
  let done = 0;
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    await call(`/api/projects/${id}/glyphs`, {
      method: "POST",
      body: { files: parts[i], replaceAll: replaceAll && last, keepNames: replaceAll && last ? names : undefined, message: `글자 ${items.length}자 저장${parts.length > 1 ? ` (${i + 1}/${parts.length})` : ""}` },
    });
    done += parts[i].length;
    onProgress?.(done, items.length);
  }
}

export const saveOneGlyph = async (id, name, file) =>
  call(`/api/projects/${id}/glyphs`, { method: "POST", body: { files: [{ name, svg: await file.text() }], message: `글자 고침: ${name}` } });

export async function loadProjectZip(id, name) {
  const res = await fetch(`/api/projects/${id}/glyphs`, { credentials: "same-origin" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("저장된 글자를 불러오지 못했습니다.");
  return new File([await res.blob()], `${name || "font"}.zip`, { type: "application/zip" });
}

// 검수·빌드 결과는 이 기기에 폰트별로 기억 (자주 바뀌는 값이라 GitHub 기록을 어지럽히지 않게)
export const localGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
export const localSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const slimCheck = (c) => (c ? { ...c, issues: (c.issues || []).slice(0, 300) } : null);
