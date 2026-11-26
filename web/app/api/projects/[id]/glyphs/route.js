// 저장된 글자 zip 내려받기 (다른 기기에서 열 때 / 엔진 서버가 잊었을 때)
import { isAuthed, json, deny } from "../../../../../lib/server/session";
import { getZip, validId } from "../../../../../lib/server/index-store";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  if (!(await isAuthed())) return deny();
  const { id } = await params;
  if (!validId(id)) return json({ error: { code: "RESOURCE_NOT_FOUND", message: "폰트를 찾을 수 없습니다." } }, 404);
  const r = await getZip(id);
  if (!r || !r.stream) return json({ error: { code: "RESOURCE_NOT_FOUND", message: "저장된 글자가 없습니다." } }, 404);
  return new Response(r.stream, { headers: { "Content-Type": "application/zip", "Cache-Control": "no-store" } });
}
