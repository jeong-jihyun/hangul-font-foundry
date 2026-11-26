// 손글씨 자모 조각 불러오기(GET) · 저장(POST {items:[{key, d}]}, d 가 null 이면 지움)
import { isAuthed, json, deny } from "../../../../../lib/server/session";
import { loadJamo, saveJamo, validId } from "../../../../../lib/server/gh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const nf = () => json({ error: { code: "RESOURCE_NOT_FOUND", message: "폰트를 찾을 수 없습니다." } }, 404);

export async function GET(req, { params }) {
  if (!(await isAuthed())) return deny();
  const { id } = await params;
  if (!validId(id)) return nf();
  try { return json({ jamo: await loadJamo(id) }); }
  catch { return json({ error: { code: "STORE_ERROR", message: "GitHub에서 손글씨 조각을 받지 못했습니다." } }, 502); }
}

export async function POST(req, { params }) {
  if (!(await isAuthed())) return deny();
  const { id } = await params;
  if (!validId(id)) return nf();
  const { items } = await req.json().catch(() => ({}));
  if (!Array.isArray(items) || items.length > 300) return json({ error: { code: "VALIDATION_ERROR", message: "한 번에 300개까지 저장합니다." } }, 400);
  try { return json(await saveJamo(id, items)); }
  catch { return json({ error: { code: "STORE_ERROR", message: "GitHub에 손글씨 조각을 저장하지 못했습니다." } }, 502); }
}
