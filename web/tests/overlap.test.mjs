// 겹친 획은 채워지고(같은 방향), 안에 든 도형은 구멍(반대 방향)
import test from "node:test";
import assert from "node:assert/strict";
import { orient, contoursToSubs, area, flatten } from "../lib/glyph/geom.js";
const rect = (x, y, w, h) => ({ nodes: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => ({ x: a, y: b, hin: null, hout: null })) });
test("겹친 두 획(ㄱ+ㅏ)은 둘 다 바깥선", () => {
  const s = orient(contoursToSubs([rect(100, 100, 400, 80), rect(420, 100, 80, 600)]));
  assert.ok(s.every((x) => area(flatten(x)) < 0));
});
test("똑같이 겹친 두 도형도 채워짐", () => {
  const s = orient(contoursToSubs([rect(100, 100, 300, 300), rect(100, 100, 300, 300)]));
  assert.ok(s.every((x) => area(flatten(x)) < 0));
});
test("안에 든 도형은 구멍", () => {
  const s = orient(contoursToSubs([rect(100, 100, 600, 600), rect(300, 300, 100, 100)]));
  assert.ok(area(flatten(s[0])) < 0 && area(flatten(s[1])) > 0);
});
