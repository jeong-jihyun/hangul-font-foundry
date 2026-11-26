import { isAuthed, json, deny } from "../../../../lib/server/session";
import { readIndex, writeIndex, deleteZip, validId } from "../../../../lib/server/index-store";

export const dynamic = "force-dynamic";
const FIELDS = ["name", "glyphCount", "hasZip", "settings", "lastCheck", "lastBuild"];

export async function PATCH(req, { params }) {
  if (!(await isAuthed())) return deny();
  const { id } = await params;
  if (!validId(id)) return json({ error: { code: "RESOURCE_NOT_FOUND", message: "폰트를 찾을 수 없습니다." } }, 404);
  const body = await req.json().catch(() => ({}));
  if (JSON.stringify(body).length > 400_000) return json({ error: { code: "PAYLOAD_TOO_LARGE", message: "저장할 내용이 너무 큽니다." } }, 413);
  const idx = await readIndex();
  const p = idx.projects.find((x) => x.id === id);
  if (!p) return json({ error: { code: "RESOURCE_NOT_FOUND", message: "폰트를 찾을 수 없습니다." } }, 404);
  for (const k of FIELDS) if (k in body) p[k] = k === "name" ? String(body.name).trim().slice(0, 40) || p.name : body[k];
  p.updatedAt = new Date().toISOString();
  await writeIndex(idx);
  return json(p);
}

export async function DELETE(req, { params }) {
  if (!(await isAuthed())) return deny();
  const { id } = await params;
  const idx = await readIndex();
  const before = idx.projects.length;
  idx.projects = idx.projects.filter((x) => x.id !== id);
  if (idx.projects.length === before) return json({ error: { code: "RESOURCE_NOT_FOUND", message: "폰트를 찾을 수 없습니다." } }, 404);
  await deleteZip(id);
  await writeIndex(idx);
  return json({ deleted: id });
}
