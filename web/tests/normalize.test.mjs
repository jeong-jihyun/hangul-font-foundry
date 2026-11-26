// 자동 정리기 시험: 여러 프로그램 모양의 SVG → 규칙 모양. 실행: node --test web/tests
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { normalizeSvg } from "../lib/glyph/normalize.js";
import { area, flatten, subsToContours, contoursToSvg, parsePathD } from "../lib/glyph/geom.js";

const N = (s) => normalizeSvg(s, DOMParser);
const OUT = process.env.NORM_OUT; // 있으면 결과를 파일로 남김 (엔진 검수용)
const save = (name, r) => { if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, name), r.svg); } };
const rule = (svg) => {
  assert.match(svg, /viewBox="0 0 1000 1000"/);
  const d = svg.match(/ d="([^"]+)"/)[1];
  assert.doesNotMatch(d, /[a-zHVSQTA]/, "절대좌표 M L C Z 만");
  assert.doesNotMatch(svg, /transform|<g|<rect|<circle/);
};

test("상대좌표·H/V·S·T·호(A)", () => {
  const r = N(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="m100 100 h300 v300 s-50 100-150 100 t-150-100 a50 50 0 0 1 0-100z"/></svg>`);
  assert.equal(r.problems.length, 0); rule(r.svg); save("U+AC00.svg", r);
  assert.equal(r.subs.length, 1);
});

test("일러스트레이터 모양: 다른 크기 viewBox + 그룹 변형 + rect/circle/polygon", () => {
  const r = N(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
    <g transform="translate(10,10) scale(0.8)"><rect x="0" y="0" width="50" height="20"/><circle cx="60" cy="60" r="10"/></g>
    <polygon points="5,90 30,70 55,90"/></svg>`);
  assert.equal(r.problems.length, 0); rule(r.svg); save("U+AC01.svg", r);
  assert.equal(r.subs.length, 3);
  assert.ok(r.notes.some((n) => n.includes("1000×1000에 맞췄")));
  // 사각형 첫 점: (0,0) → translate10 → *10 = (100,100)
  assert.deepEqual(r.subs.find((s) => Math.abs(s.start[0] - 100) < 0.01 || Math.abs(s.start[1] - 100) < 0.01) ? true : false, true);
});

test("SVG-Edit 모양: 레이어 g + title + 안내선 + 회전", () => {
  const r = N(`<svg width="1000" height="1000" xmlns="http://www.w3.org/2000/svg"><g class="layer"><title>Layer 1</title>
    <rect id="guide-baseline" x="0" y="799" width="1000" height="2" fill="#f00"/>
    <rect id="svg_1" x="400" y="300" width="200" height="200" transform="rotate(45 500 400)" fill="#000"/></g></svg>`);
  assert.equal(r.problems.length, 0); rule(r.svg); save("U+AC02.svg", r);
  assert.equal(r.subs.length, 1, "안내선은 빠짐");
  // 45도 회전한 정사각형: 꼭짓점이 중심에서 위로 141 가량
  const ys = flatten(r.subs[0]).map((p) => p[1]);
  assert.ok(Math.min(...ys) < 265 && Math.min(...ys) > 255);
});

test("구멍: evenodd 로 그린 'ㅇ' 은 바깥/구멍 방향이 반대로 정리됨", () => {
  const r = N(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path fill-rule="evenodd" d="M500 200 A300 300 0 1 1 499.9 200Z M500 350 A150 150 0 1 1 499.9 350Z"/></svg>`);
  rule(r.svg); save("U+C774.svg", r);
  const [a, b] = r.subs.map((s) => area(flatten(s)));
  assert.ok(a < 0 && b > 0, "바깥 음수, 구멍 양수 (화면 좌표)");
});

test("흰색 도형을 겹쳐 만든 구멍", () => {
  const r = N(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect x="100" y="100" width="600" height="600"/><rect x="300" y="300" width="200" height="200" fill="#ffffff"/></svg>`);
  const [a, b] = r.subs.map((s) => area(flatten(s)));
  assert.ok(a < 0 && b > 0);
});

test("선(stroke)만 있는 도형·텍스트·이미지 안내", () => {
  const r = N(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="M0 0L100 100" fill="none" stroke="#000"/><text>가</text><image href="x.png"/></svg>`);
  assert.ok(r.problems.some((p) => p.includes("선(stroke)")));
  assert.ok(r.problems.some((p) => p.includes("텍스트")));
  assert.ok(r.notes.some((p) => p.includes("밑그림")));
  assert.equal(r.svg, null);
});

test("깨진 파일", () => {
  assert.ok(N("이건 svg 아님").problems.length > 0);
});

test("편집기 구조로 갔다 와도 모양이 같음", () => {
  const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><circle cx="500" cy="500" r="200"/><rect x="100" y="700" width="800" height="80"/></svg>`;
  const r = N(src);
  const back = N(contoursToSvg(subsToContours(r.subs)));
  const A = r.subs.map((s) => Math.round(area(flatten(s)))), B = back.subs.map((s) => Math.round(area(flatten(s))));
  A.forEach((a, i) => assert.ok(Math.abs(a - B[i]) / Math.abs(a) < 0.001, "넓이 차이 0.1% 이내 (소수 첫째 자리 반올림)"));
  rule(back.svg); save("U+B098.svg", back);
});

test("붙여 쓴 호 깃발 (a10 10 0 0110 10)", () => {
  const subs = parsePathD("M0 0a10 10 0 0110 10z");
  assert.equal(subs.length, 1);
  const last = subs[0].segs.at(-1);
  assert.ok(Math.abs(last.at(-2) - 10) < 1e-6 && Math.abs(last.at(-1) - 10) < 1e-6);
});
