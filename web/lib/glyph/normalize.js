// 어떤 프로그램에서 만든 SVG든(일러스트레이터·Inkscape·SVG-Edit·이 앱) 규칙 모양으로 정리한다.
// 규칙: viewBox 0 0 1000 1000, 바닥선 y=800, 절대좌표 경로 하나(M L C Z), 변형·묶음 없음, 안내선 제외
import { I, mul, parseTransform, parsePathD, ellipseSub, rectSub, polySub, transformSub, orient, subsToD, glyphSvg, apply } from "./geom.js";

const SKIP = new Set(["defs", "clipPath", "mask", "symbol", "title", "desc", "metadata", "style", "script", "linearGradient", "radialGradient", "pattern", "filter", "marker", "namedview", "sodipodi:namedview", "foreignObject"]);
const local = (el) => (el.localName || el.nodeName || "").replace(/^.*:/, "");
const attr = (el, n) => (el.getAttribute ? el.getAttribute(n) : null);

function styleOf(el) {
  const out = {};
  for (const part of String(attr(el, "style") || "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
const prop = (el, n) => styleOf(el)[n] ?? attr(el, n);
const isGuide = (el) => {
  const id = String(attr(el, "id") || "").toLowerCase();
  const cls = String(attr(el, "class") || "").toLowerCase();
  const label = String(attr(el, "inkscape:label") || "").toLowerCase();
  return id.startsWith("guide") || cls.split(/\s+/).includes("guide") || label.startsWith("guide") || label === "안내선";
};
const num = (v, d = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

export function normalizeSvg(text, DOMParserImpl = globalThis.DOMParser) {
  const notes = [], problems = [];
  const note = (s) => { if (!notes.includes(s)) notes.push(s); };
  const problem = (s) => { if (!problems.includes(s)) problems.push(s); };
  let doc;
  try { doc = new DOMParserImpl().parseFromString(String(text), "image/svg+xml"); }
  catch { return { svg: null, subs: [], notes, problems: ["SVG 파일을 읽을 수 없습니다."] }; }
  const root = doc.documentElement;
  if (!root || local(root) !== "svg" || doc.getElementsByTagName("parsererror").length) {
    return { svg: null, subs: [], notes, problems: ["SVG 파일이 아니거나 내용이 깨져 있습니다."] };
  }

  // 그림 크기 → 1000×1000 으로 맞추기 (가로세로 비율 유지, 위·왼쪽 기준)
  let vb = String(attr(root, "viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = num(attr(root, "width"), 1000), h = num(attr(root, "height"), 1000);
    vb = [0, 0, w || 1000, h || 1000];
  }
  let base = I;
  if (!(vb[0] === 0 && vb[1] === 0 && vb[2] === 1000 && vb[3] === 1000)) {
    const s = 1000 / Math.max(vb[2], vb[3]);
    base = [s, 0, 0, s, -vb[0] * s, -vb[1] * s];
    note(`그림 크기(${vb[2]}×${vb[3]})를 1000×1000에 맞췄습니다.`);
  }

  const byId = {};
  const index = (el) => {
    const id = attr(el, "id");
    if (id) byId[id] = el;
    for (const c of Array.from(el.childNodes || [])) if (c.nodeType === 1) index(c);
  };
  index(root);

  const subs = [];
  const walk = (el, m, inh, depth) => {
    if (depth > 30) return;
    const name = local(el);
    if (SKIP.has(name) || isGuide(el)) return;
    if (prop(el, "display") === "none" || prop(el, "visibility") === "hidden") return;
    const t = attr(el, "transform");
    if (t) { m = mul(m, parseTransform(t)); note("변형(transform)을 실제 좌표에 반영했습니다."); }
    const fill = prop(el, "fill") ?? inh.fill;
    const stroke = prop(el, "stroke") ?? inh.stroke;
    if (attr(el, "clip-path") || prop(el, "clip-path")) note("자르기(clip-path)는 무시했습니다. 모양이 다르면 확인해 주세요.");
    const here = { fill, stroke };

    if (name === "svg" && el !== root) {
      m = mul(m, [1, 0, 0, 1, num(attr(el, "x")), num(attr(el, "y"))]);
    }
    if (name === "g" || name === "svg" || name === "a" || name === "switch") {
      if (name === "g" && t) note("묶음(그룹)을 풀었습니다.");
      for (const c of Array.from(el.childNodes || [])) if (c.nodeType === 1) walk(c, m, here, depth + 1);
      return;
    }
    if (name === "use") {
      const href = (attr(el, "href") || attr(el, "xlink:href") || "").replace(/^#/, "");
      const target = byId[href];
      if (target) walk(target, mul(m, [1, 0, 0, 1, num(attr(el, "x")), num(attr(el, "y"))]), here, depth + 1);
      return;
    }
    if (name === "text" || name === "tspan") { problem("글자(텍스트) 요소가 있습니다. 윤곽선으로 변환해 주세요."); return; }
    if (name === "image") { note("그림(이미지)은 밑그림으로 보고 뺐습니다."); return; }

    let local_ = [];
    try {
      if (name === "path") local_ = parsePathD(attr(el, "d"));
      else if (name === "rect") {
        const w = num(attr(el, "width")), h = num(attr(el, "height"));
        if (w > 0 && h > 0) local_ = [rectSub(num(attr(el, "x")), num(attr(el, "y")), w, h, num(attr(el, "rx")), num(attr(el, "ry")))];
      } else if (name === "circle") {
        const rr = num(attr(el, "r"));
        if (rr > 0) local_ = [ellipseSub(num(attr(el, "cx")), num(attr(el, "cy")), rr, rr)];
      } else if (name === "ellipse") {
        const rx = num(attr(el, "rx")), ry = num(attr(el, "ry"));
        if (rx > 0 && ry > 0) local_ = [ellipseSub(num(attr(el, "cx")), num(attr(el, "cy")), rx, ry)];
      } else if (name === "polygon" || name === "polyline") {
        const v = String(attr(el, "points") || "").match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
        const pts = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([+v[i], +v[i + 1]]);
        const s = polySub(pts, true);
        if (s) local_ = [s];
      } else if (name === "line") { problem("선(line)은 두께가 없어 글자가 되지 않습니다. 면으로 그려 주세요."); return; }
      else return; // 모르는 요소는 조용히 넘어감
    } catch (e) {
      problem(`경로를 읽지 못했습니다: ${e.message}`);
      return;
    }
    if (!local_.length) return;
    if (fill === "none" || fill === "transparent") {
      if (stroke && stroke !== "none") problem("선(stroke)으로만 그린 도형이 있습니다. '윤곽선으로 변환' 후 다시 불러와 주세요.");
      return;
    }
    if (/^(#fff(fff)?|white)$/i.test(String(fill || "").trim())) note("흰색 도형은 다른 도형 안에 있으면 구멍으로 바꿨습니다.");
    const mm = mul(base, m);
    for (const s of local_) {
      if (!s.closed) note("열린 경로를 닫았습니다.");
      subs.push(transformSub(s, mm));
    }
  };
  walk(root, I, { fill: null, stroke: null }, 0);

  // 아주 작은 조각(점 하나 등) 제거
  const clean = subs.filter((s) => s.segs.length >= 2 || (s.segs.length === 1 && s.segs[0][0] === "C"));
  if (!clean.length && !problems.length) problems.push("그려진 모양이 없습니다.");
  const oriented = orient(clean);
  // 틀 밖으로 크게 나간 점 알려 주기
  let out = false;
  for (const s of oriented) for (const g of [["M", ...s.start], ...s.segs]) for (let k = 1; k < g.length; k += 2) if (g[k] < -1 || g[k] > 1001 || g[k + 1] < -1 || g[k + 1] > 1001) out = true;
  if (out) note("1000×1000 틀 밖으로 나간 부분이 있습니다. 검수에서 다시 알려 줍니다.");
  return { svg: oriented.length ? glyphSvg(subsToD(oriented)) : null, subs: oriented, notes, problems };
}

export { apply };
