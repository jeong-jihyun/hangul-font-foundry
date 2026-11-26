import { isAuthed, json, deny } from "../../../../lib/server/session";
import { updateFont, deleteFont, validId } from "../../../../lib/server/gh";

export const dynamic = "force-dynamic";
const nf = () => json({ error: { code: "RESOURCE_NOT_FOUND", message: "폰트를 찾을 수 없습니다." } }, 404);

export async function PATCH(req, { params }) {
  if (!(await isAuthed())) return deny();
  const { id } = await params;
  if (!validId(id)) return nf();
  const body = await req.json().catch(() => ({}));
  const patch = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 40);
  if (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) {
    if (JSON.stringify(body.settings).length > 4000) return json({ error: { code: "VALIDATION_ERROR", message: "설정이 너무 큽니다." } }, 400);
    patch.settings = body.settings;
  }
  try { const r = await updateFont(id, patch); return r ? json(r) : nf(); }
  catch { return json({ error: { code: "STORE_ERROR", message: "GitHub에 저장하지 못했습니다." } }, 502); }
}

export async function DELETE(req, { params }) {
  if (!(await isAuthed())) return deny();
  const { id } = await params;
  if (!validId(id)) return nf();
  try { return (await deleteFont(id)) ? json({ deleted: id }) : nf(); }
  catch { return json({ error: { code: "STORE_ERROR", message: "GitHub에서 지우지 못했습니다." } }, 502); }
}
