// 폰트 글자 보관: GitHub 비공개 저장소 (기본: jeong-jihyun/hangul-font-glyphs)
//   {id}/font.json          폰트 이름·설정
//   {id}/glyphs/U+AC00.svg  글자 파일
// 저장할 때마다 커밋이 남아 예전 글자로 되돌릴 수 있다.
import crypto from "node:crypto";
import { unzipSync, zipSync, strToU8 } from "fflate";

const REPO = process.env.GLYPH_REPO || "jeong-jihyun/hangul-font-glyphs";
const BRANCH = "main";
const API = `https://api.github.com/repos/${REPO}`;

async function gh(path, { method = "GET", body, raw = false } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "glyphroom",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
    cache: "no-store",
  });
  if (raw) return res;
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || `GitHub 오류 ${res.status}`); e.status = res.status; throw e; }
  return data;
}

const GLYPH = /^U\+[0-9A-F]{4,6}\.svg$/;
export const validId = (id) => /^[a-z0-9]{8,24}$/.test(id || "");
export const ghReady = () => !!process.env.GITHUB_TOKEN;
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s) => Buffer.from(s, "base64").toString("utf8");

// 빈 저장소면 첫 커밋(README)을 만든다
async function headSha() {
  try {
    return (await gh(`/git/ref/heads/${BRANCH}`)).object.sha;
  } catch (e) {
    if (e.status !== 409 && e.status !== 404) throw e;
    await gh(`/contents/README.md`, { method: "PUT", body: { message: "Glyphroom 글자 보관소 시작", content: b64("# Glyphroom 폰트 글자 보관소\n\n폰트마다 폴더 하나, 글자는 `폴더/glyphs/U+AC00.svg`.\n"), branch: BRANCH } });
    return (await gh(`/git/ref/heads/${BRANCH}`)).object.sha;
  }
}

async function readFontJson(id) {
  try {
    const f = await gh(`/contents/${id}/font.json?ref=${BRANCH}`);
    return { data: JSON.parse(unb64(f.content)), sha: f.sha };
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// 글자 수는 저장소 전체 목록을 한 번에 받아 센다 (폴더 목록 API는 1,000개까지만 보여 줘서 2,350자를 다 못 셈)
export async function listFonts() {
  const head = await headSha();
  const commit = await gh(`/git/commits/${head}`);
  const t = await gh(`/git/trees/${commit.tree.sha}?recursive=1`);
  const count = {};
  const ids = new Set();
  for (const x of t.tree) {
    const [id, sub, name] = x.path.split("/");
    if (!validId(id)) continue;
    if (sub === "font.json") ids.add(id);
    if (sub === "glyphs" && GLYPH.test(name || "")) count[id] = (count[id] || 0) + 1;
  }
  const out = [];
  for (const id of ids) {
    const f = await readFontJson(id);
    if (f) out.push({ id, ...f.data, glyphCount: count[id] || 0 });
  }
  return out.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export async function createFont(name) {
  await headSha();
  const id = crypto.randomBytes(6).toString("hex");
  const now = new Date().toISOString();
  const data = { name, settings: {}, createdAt: now, updatedAt: now };
  await gh(`/contents/${id}/font.json`, { method: "PUT", body: { message: `새 폰트: ${name}`, content: b64(JSON.stringify(data, null, 2)), branch: BRANCH } });
  return { id, ...data, glyphCount: 0 };
}

export async function updateFont(id, patch) {
  const f = await readFontJson(id);
  if (!f) return null;
  const data = { ...f.data, ...patch, updatedAt: new Date().toISOString() };
  await gh(`/contents/${id}/font.json`, { method: "PUT", body: { message: `폰트 정보 변경: ${data.name}`, content: b64(JSON.stringify(data, null, 2)), sha: f.sha, branch: BRANCH } });
  return { id, ...data };
}

// 여러 파일을 커밋 하나로 (추가·변경·삭제)
async function commitTree(entries, message) {
  const head = await headSha();
  const commit = await gh(`/git/commits/${head}`);
  const tree = await gh(`/git/trees`, { method: "POST", body: { base_tree: commit.tree.sha, tree: entries } });
  if (tree.sha === commit.tree.sha) return head; // 바뀐 것 없음
  const c = await gh(`/git/commits`, { method: "POST", body: { message, tree: tree.sha, parents: [head] } });
  await gh(`/git/refs/heads/${BRANCH}`, { method: "PATCH", body: { sha: c.sha } });
  return c.sha;
}

async function pathsUnder(prefix) {
  const head = await headSha();
  const commit = await gh(`/git/commits/${head}`);
  const t = await gh(`/git/trees/${commit.tree.sha}?recursive=1`);
  return t.tree.filter((x) => x.type === "blob" && x.path.startsWith(prefix)).map((x) => x.path);
}

export async function deleteFont(id) {
  const paths = await pathsUnder(`${id}/`);
  if (!paths.length) return false;
  await commitTree(paths.map((path) => ({ path, mode: "100644", type: "blob", sha: null })), `폰트 지움: ${id}`);
  return true;
}

// 글자 저장: files=[{name,svg}]. replaceAll 이면 새 묶음에 없는 예전 글자는 지운다 (새 zip 을 올린 경우)
export async function saveGlyphs(id, files, { replaceAll = false, keepNames = null, message } = {}) {
  const good = files.filter((f) => GLYPH.test(f.name) && typeof f.svg === "string" && f.svg.length <= 1_000_000);
  const entries = good.map((f) => ({ path: `${id}/glyphs/${f.name}`, mode: "100644", type: "blob", content: f.svg }));
  if (replaceAll) {
    // 여러 번에 나눠 보낼 때는 마지막 묶음에 '전체 글자 이름'(keepNames)을 함께 보내 그때 지운다
    const keep = new Set((keepNames || good.map((f) => f.name)).map((n) => `${id}/glyphs/${n}`));
    for (const p of await pathsUnder(`${id}/glyphs/`)) if (!keep.has(p)) entries.push({ path: p, mode: "100644", type: "blob", sha: null });
  }
  if (!entries.length) return { saved: 0 };
  const f = await readFontJson(id);
  if (f) entries.push({ path: `${id}/font.json`, mode: "100644", type: "blob", content: JSON.stringify({ ...f.data, updatedAt: new Date().toISOString() }, null, 2) });
  await commitTree(entries, message || `글자 ${good.length}자 저장`);
  return { saved: good.length };
}

// 저장된 글자를 zip 으로 (저장소 전체 zip 을 받아 이 폰트 폴더만 골라냄)
export async function fontZip(id) {
  await headSha();
  const res = await gh(`/zipball/${BRANCH}`, { raw: true });
  if (!res.ok) throw new Error("저장된 글자를 받지 못했습니다.");
  const all = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const out = {};
  for (const [path, data] of Object.entries(all)) {
    const parts = path.split("/"); // 맨 앞은 '저장소-커밋' 폴더
    if (parts[1] === id && parts[2] === "glyphs" && GLYPH.test(parts[3] || "")) out[`glyphs/${parts[3]}`] = data;
  }
  if (!Object.keys(out).length) return null;
  return zipSync(out, { level: 6 });
}

export const repoUrl = (id) => `https://github.com/${REPO}/tree/${BRANCH}/${id || ""}`;
export { strToU8 };
