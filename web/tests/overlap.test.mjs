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

import { simplifyContour, subsToContours } from "../lib/glyph/geom.js";
test("점 줄이기: 둥근 고리는 점이 크게 줄고 넓이는 거의 같음, 네모는 모서리 4개", () => {
  const ring = []; for (let i = 0; i < 180; i++) { const a = (i / 180) * Math.PI * 2; ring.push({ x: 500 + 200 * Math.cos(a), y: 500 + 200 * Math.sin(a), hin: null, hout: null }); }
  const s = simplifyContour({ nodes: ring });
  assert.ok(s.nodes.length <= 24 && s.nodes.length >= 6, s.nodes.length);
  const A = (c) => Math.abs(area(flatten(contoursToSubs([c])[0])));
  assert.ok(Math.abs(A(s) - A({ nodes: ring })) / A({ nodes: ring }) < 0.02);
  const sq = [];
  for (let i = 0; i <= 50; i++) sq.push({ x: 100 + i * 4, y: 100 }); for (let i = 1; i <= 50; i++) sq.push({ x: 300, y: 100 + i * 8 });
  for (let i = 1; i <= 50; i++) sq.push({ x: 300 - i * 4, y: 500 }); for (let i = 1; i < 50; i++) sq.push({ x: 100, y: 500 - i * 8 });
  const q = simplifyContour({ nodes: sq.map((p) => ({ ...p, hin: null, hout: null })) });
  assert.equal(q.nodes.length, 4); assert.ok(q.nodes.every((n) => !n.smooth));
});

test("겹친 획의 시작점이 다른 획 안에 있어도 구멍으로 뒤집지 않음 (ㅍ)", () => {
  const top = rect(100, 100, 400, 60), vert = { nodes: [[200, 120], [240, 120], [240, 400], [200, 400]].map(([x, y]) => ({ x, y, hin: null, hout: null })) };
  const s = orient(contoursToSubs([top, vert]));
  assert.ok(s.every((x) => area(flatten(x)) < 0));
});
