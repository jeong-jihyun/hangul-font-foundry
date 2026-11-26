import { pinOk, setSession, clearSession, isAuthed, json } from "../../../lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ loggedIn: await isAuthed(), configured: !!(process.env.APP_PIN && process.env.SESSION_SECRET && process.env.GITHUB_TOKEN) });
}

// 같은 곳(IP)에서 10번 틀리면 15분 잠금 (서버가 여러 대일 수 있어 완벽하진 않지만, 마구 넣어 보기를 크게 늦춤)
const fails = new Map();
const LIMIT = 10, WINDOW = 15 * 60 * 1000;

export async function POST(req) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const f = fails.get(ip);
  if (f && f.n >= LIMIT && Date.now() - f.t < WINDOW) {
    const min = Math.ceil((WINDOW - (Date.now() - f.t)) / 60000);
    return json({ error: { code: "RATE_LIMITED", message: `비밀번호를 여러 번 틀려 ${min}분 동안 잠겼습니다.` } }, 429);
  }
  const { pin } = await req.json().catch(() => ({}));
  if (!pinOk(String(pin || "").trim())) {
    const cur = f && Date.now() - f.t < WINDOW ? f : { n: 0, t: Date.now() };
    fails.set(ip, { n: cur.n + 1, t: cur.n === 0 ? Date.now() : cur.t });
    await new Promise((r) => setTimeout(r, 1200)); // 마구 넣어 보기 방지
    const left = LIMIT - cur.n - 1;
    return json({ error: { code: "UNAUTHORIZED", message: `비밀번호(PIN)가 맞지 않습니다.${left <= 3 && left > 0 ? ` (${left}번 더 틀리면 15분 잠김)` : ""}` } }, 401);
  }
  fails.delete(ip);
  await setSession();
  return json({ loggedIn: true });
}

export async function DELETE() {
  await clearSession();
  return json({ loggedIn: false });
}
