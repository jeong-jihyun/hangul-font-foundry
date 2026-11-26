import crypto from "node:crypto";
import { isAuthed, json, deny } from "../../../lib/server/session";
import { readIndex, writeIndex } from "../../../lib/server/index-store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthed())) return deny();
  const idx = await readIndex();
  idx.projects.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return json(idx);
}

export async function POST(req) {
  if (!(await isAuthed())) return deny();
  const { name } = await req.json().catch(() => ({}));
  const n = String(name || "").trim().slice(0, 40);
  if (!n) return json({ error: { code: "VALIDATION_ERROR", message: "폰트 이름을 입력해 주세요." } }, 400);
  const idx = await readIndex();
  if (idx.projects.length >= 30) return json({ error: { code: "VALIDATION_ERROR", message: "폰트는 30개까지 만들 수 있습니다." } }, 400);
  const now = new Date().toISOString();
  const p = { id: crypto.randomBytes(6).toString("hex"), name: n, glyphCount: 0, hasZip: false, settings: {}, lastCheck: null, lastBuild: null, createdAt: now, updatedAt: now };
  idx.projects.push(p);
  await writeIndex(idx);
  return json(p, 201);
}
