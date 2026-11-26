// 글자 불러오기(GET, zip) · 저장(POST, 400자씩 나눠 받음 → 커밋)
import { isAuthed, json, deny } from "../../../../../lib/server/session";
import { fontZip, saveGlyphs, validId } from "../../../../../lib/server/gh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req, { params }) {
  if (!(await isAuthed())) return deny();
  const { id } = await params;
  if (!validId(id)) return json({ error: { code: "RESOURCE_NOT_FOUND", message: "폰트를 찾을 수 없습니다." } }, 404);
  try {
    const z = await fontZip(id);
    if (!z) return json({ error: { code: "RESOURCE_NOT_FOUND", message: "저장된 글자가 없습니다." } }, 404);
    return new Response(z, { headers: { "Content-Type": "application/zip", "Cache-Control": "no-store" } });
  } catch { return json({ error: { code: "STORE_ERROR", message: "GitHub에서 글자를 받지 못했습니다." } }, 502); }
}

export async function POST(req, { params }) {
  if (!(await isAuthed())) return deny();
  const { id } = await params;
  if (!validId(id)) return json({ error: { code: "RESOURCE_NOT_FOUND", message: "폰트를 찾을 수 없습니다." } }, 404);
  const { files, replaceAll, keepNames, message } = await req.json().catch(() => ({}));
  if (!Array.isArray(files) || files.length > 500) return json({ error: { code: "VALIDATION_ERROR", message: "한 번에 500자까지 저장합니다." } }, 400);
  try { return json(await saveGlyphs(id, files, { replaceAll: !!replaceAll, keepNames: Array.isArray(keepNames) ? keepNames.slice(0, 3000).map(String) : null, message: typeof message === "string" ? message.slice(0, 80) : undefined })); }
  catch { return json({ error: { code: "STORE_ERROR", message: "GitHub에 저장하지 못했습니다." } }, 502); }
}
