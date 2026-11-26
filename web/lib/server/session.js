// 간단 잠금: 사용자 1명용 비밀번호(PIN). 맞으면 서명된 쿠키를 준다.
import crypto from "node:crypto";
import { cookies } from "next/headers";

const NAME = "gr_session";
const secret = () => process.env.SESSION_SECRET || "";

function sign(v) {
  return crypto.createHmac("sha256", secret()).update(v).digest("base64url");
}

export function pinOk(pin) {
  const want = (process.env.APP_PIN || "").trim(); // 저장할 때 섞인 줄바꿈·빈칸 무시
  if (!want || typeof pin !== "string") return false;
  const a = Buffer.from(pin), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function setSession() {
  const v = "owner." + Date.now();
  (await cookies()).set(NAME, v + "." + sign(v), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180,
  });
}

export async function clearSession() {
  (await cookies()).delete(NAME);
}

export async function isAuthed() {
  if (!secret()) return false;
  const raw = (await cookies()).get(NAME)?.value || "";
  const i = raw.lastIndexOf(".");
  if (i < 0) return false;
  const v = raw.slice(0, i), s = raw.slice(i + 1);
  const good = sign(v);
  return s.length === good.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good));
}

export const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export const deny = () => json({ error: { code: "UNAUTHORIZED", message: "비밀번호(PIN)로 먼저 들어와 주세요." } }, 401);
