import { pinOk, setSession, clearSession, isAuthed, json } from "../../../lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ loggedIn: await isAuthed(), configured: !!(process.env.APP_PIN && process.env.SESSION_SECRET && process.env.GITHUB_TOKEN) });
}

export async function POST(req) {
  const { pin } = await req.json().catch(() => ({}));
  if (!pinOk(String(pin || "").trim())) {
    await new Promise((r) => setTimeout(r, 1200)); // 마구 넣어 보기 방지
    return json({ error: { code: "UNAUTHORIZED", message: "비밀번호(PIN)가 맞지 않습니다." } }, 401);
  }
  await setSession();
  return json({ loggedIn: true });
}

export async function DELETE() {
  await clearSession();
  return json({ loggedIn: false });
}
