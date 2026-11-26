// 폰트 목록(index.json)을 보관함에 저장·읽기. 폰트 글자는 projects/{id}/glyphs.zip 한 파일로 저장.
import { get, put, del } from "@vercel/blob";

const INDEX = "index.json";

export async function readIndex() {
  const r = await get(INDEX, { access: "private", useCache: false });
  if (!r || !r.stream) return { projects: [] };
  const text = await new Response(r.stream).text();
  try { const j = JSON.parse(text); return Array.isArray(j.projects) ? j : { projects: [] }; } catch { return { projects: [] }; }
}

export async function writeIndex(idx) {
  await put(INDEX, JSON.stringify(idx), {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 0,
  });
}

export const zipPath = (id) => `projects/${id}/glyphs.zip`;
export const validId = (id) => /^[a-z0-9]{8,24}$/.test(id || "");

export async function getZip(id) {
  return get(zipPath(id), { access: "private", useCache: false });
}

export async function deleteZip(id) {
  try { await del(zipPath(id)); } catch {}
}
