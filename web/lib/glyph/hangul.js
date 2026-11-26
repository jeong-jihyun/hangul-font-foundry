// 한글 조합: 자모 칸(손글씨 종이) → 완성형 글자. 서버 hangul_font_kit/handwrite.py 와 같은 규칙.
import { parsePathD, orient, subsToD, glyphSvg } from "./geom.js";

export const L = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
export const V = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
export const T = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
const VT = {};
for (const v of "ㅏㅐㅑㅒㅓㅔㅕㅖㅣ") VT[v] = "V";
for (const v of "ㅗㅛㅜㅠㅡ") VT[v] = "H";
for (const v of "ㅘㅙㅚㅝㅞㅟㅢ") VT[v] = "M";
const p2 = (n) => String(n).padStart(2, "0");

export function split(ch) {
  const n = ch.codePointAt(0) - 0xac00;
  if (!(n >= 0 && n < 11172)) return null;
  const l = Math.floor(n / 588), v = Math.floor((n % 588) / 28), t = n % 28;
  return [L[l], V[v], t ? T[t - 1] : ""];
}

// 이 글자를 만들 때 쓰는 칸 key (초성·중성·종성)
export function partsFor(ch) {
  const s = split(ch);
  if (!s) return null;
  const [l, v, t] = s;
  const vt = VT[v], b = t ? 1 : 0;
  const keys = [`L${p2(L.indexOf(l))}${vt}${b}`, `V${p2(V.indexOf(v))}${b}`];
  if (t) keys.push(`T${p2(T.indexOf(t))}${vt}`);
  return keys;
}

export const JAMO_KEY = /^(L\d{2}[VHM][01]|V\d{2}[01]|T\d{2}[VHM])$/;

// 자모 모양을 겹쳐 한 글자로: 겹친 획은 채우고, 안에 든 모양(ㅇ·ㅁ 속)은 구멍으로
export function composeD(ch, jamo) {
  const keys = partsFor(ch);
  if (!keys || keys.some((k) => !jamo[k])) return null;
  const subs = keys.flatMap((k) => parsePathD(jamo[k]));
  return subs.length ? subsToD(orient(subs)) : null;
}
export const composeSvg = (ch, jamo) => { const d = composeD(ch, jamo); return d ? glyphSvg(d) : null; };
export const fileName = (ch) => "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0") + ".svg";
