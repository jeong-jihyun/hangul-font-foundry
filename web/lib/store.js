"use client";
// 폰트 프로젝트 저장 (Vercel 보관함). 잠금은 비밀번호(PIN) 하나 — 로그인 계정 없음.
// 글자는 폰트마다 zip 파일 한 개로 저장 (무료 사용량의 '저장 횟수'를 아끼기 위해)
import { upload } from "@vercel/blob/client";
import { unzipSync, zipSync } from "fflate";
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

// ---- 글자 zip ----
export async function saveProjectZip(id, file, onProgress) {
  await upload(`projects/${id}/glyphs.zip`, file, {
    access: "private", handleUploadUrl: "/api/projects/upload", contentType: "application/zip",
    multipart: file.size > 4 * 1024 * 1024,
    onUploadProgress: (p) => onProgress?.(Math.round(p.percentage)),
  });
}

export async function loadProjectZip(id, name) {
  const res = await fetch(`/api/projects/${id}/glyphs`, { credentials: "same-origin" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("저장된 글자를 불러오지 못했습니다.");
  return new File([await res.blob()], `${name || "font"}.zip`, { type: "application/zip" });
}

// 원래 zip 에 '교체한 글자'와 '뺀 파일'을 반영한 새 zip (저장용)
export async function mergedZip(file, replacements = {}, removed = []) {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const out = {};
  const gone = new Set([...removed, ...Object.keys(replacements)]);
  for (const [path, data] of Object.entries(files)) {
    const base = path.split("/").pop();
    if (!base || path.includes("__MACOSX") || gone.has(base)) continue;
    out[`glyphs/${base}`] = data;
  }
  for (const [name, f] of Object.entries(replacements)) out[`glyphs/${name}`] = new Uint8Array(await f.arrayBuffer());
  return new File([zipSync(out, { level: 6 })], file.name, { type: "application/zip" });
}

export const countSvgs = async (file) =>
  Object.keys(unzipSync(new Uint8Array(await file.arrayBuffer()))).filter((p) => /\.svg$/i.test(p) && !p.includes("__MACOSX")).length;

// 검수 결과를 저장용으로 줄이기
export const slimCheck = (c) => (c ? { ...c, issues: (c.issues || []).slice(0, 300) } : null);
