import { isAuthed, json, deny } from "../../../lib/server/session";
import { listFonts, createFont, ghReady } from "../../../lib/server/gh";

export const dynamic = "force-dynamic";
const fail = (e) => json({ error: { code: e.status === 404 ? "RESOURCE_NOT_FOUND" : "STORE_ERROR", message: e.status === 401 || e.status === 403 ? "GitHub 열쇠(토큰) 권한을 확인해 주세요." : e.status === 404 ? "글자 보관 저장소(hangul-font-glyphs)를 찾을 수 없습니다." : "GitHub에 연결하지 못했습니다." } }, e.status === 404 ? 404 : 502);

export async function GET() {
  if (!(await isAuthed())) return deny();
  try { return json({ projects: await listFonts() }); } catch (e) { return fail(e); }
}

export async function POST(req) {
  if (!(await isAuthed())) return deny();
  const { name } = await req.json().catch(() => ({}));
  const n = String(name || "").trim().slice(0, 40);
  if (!n) return json({ error: { code: "VALIDATION_ERROR", message: "폰트 이름을 입력해 주세요." } }, 400);
  try {
    if ((await listFonts()).length >= 30) return json({ error: { code: "VALIDATION_ERROR", message: "폰트는 30개까지 만들 수 있습니다." } }, 400);
    return json(await createFont(n), 201);
  } catch (e) { return fail(e); }
}
