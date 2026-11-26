import test from "node:test";
import assert from "node:assert/strict";
import { partsFor, composeD, split } from "../lib/glyph/hangul.js";
import { area, flatten, parsePathD } from "../lib/glyph/geom.js";

test("칸 key 가 서버 규칙과 같음", () => {
  assert.deepEqual(partsFor("각"), ["L00V1", "V001", "T00V"]);
  assert.deepEqual(partsFor("뷁"), ["L07M1", "V151", "T08M"]);
  assert.deepEqual(partsFor("가"), ["L00V0", "V000"]);
  assert.equal(partsFor("A"), null);
  assert.deepEqual(split("한"), ["ㅎ", "ㅏ", "ㄴ"]);
});

test("조합: ㅇ 속은 구멍, 칸이 없으면 만들지 않음", () => {
  const ring = "M300 200L700 200L700 600L300 600ZM400 300L400 500L600 500L600 300Z"; // ㅇ 대신 네모 고리
  const bar = "M720 100L800 100L800 850L720 850Z";
  const jamo = { L11V0: ring, V000: bar };
  const d = composeD("아", jamo);
  const subs = parsePathD(d);
  const a = subs.map((s) => area(flatten(s)));
  assert.equal(subs.length, 3);
  assert.ok(a.filter((x) => x > 0).length === 1, "구멍 하나");
  assert.equal(composeD("가", jamo), null);
});
