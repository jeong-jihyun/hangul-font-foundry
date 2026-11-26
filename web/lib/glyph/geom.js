// 글자 모양 계산 모음 (브라우저·Node 공용, DOM 없이 동작)
//  - 어떤 SVG 의 경로든 '절대좌표 M L C Z' 로 바꾸기 (상대좌표·H/V·S/T·Q·호(A) 포함)
//  - 변형(transform) 계산, 기본 도형(사각형·원·타원·다각형) → 경로
//  - 편집기용 '점(노드) + 손잡이' 구조 ↔ 경로 문자열
//  - 바깥선/구멍 방향 맞추기 (폰트로 바꿀 때 구멍이 메워지지 않게)

// ---------- 행렬 (a b c d e f) ----------
export const I = [1, 0, 0, 1, 0, 0];
export const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const nums = (s) => (String(s || "").match(NUM) || []).map(Number);

export function parseTransform(str) {
  let m = I;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t;
  while ((t = re.exec(str || ""))) {
    const v = nums(t[2]);
    let n = I;
    if (t[1] === "matrix" && v.length >= 6) n = v.slice(0, 6);
    if (t[1] === "translate") n = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    if (t[1] === "scale") n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    if (t[1] === "rotate") {
      const a = ((v[0] || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      n = [c, s, -s, c, 0, 0];
      if (v.length >= 3) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
    }
    if (t[1] === "skewX") n = [1, 0, Math.tan(((v[0] || 0) * Math.PI) / 180), 1, 0, 0];
    if (t[1] === "skewY") n = [1, Math.tan(((v[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

// ---------- 경로 문자열 읽기 ----------
// 결과: 하위 경로 배열. 각 하위 경로 = { start:[x,y], segs:[ ['L',x,y] | ['C',x1,y1,x2,y2,x,y] ], closed }
export function parsePathD(d) {
  const toks = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  let t;
  while ((t = re.exec(d || ""))) toks.push(t[1] ? { c: t[1] } : t[2]); // 숫자는 글자 그대로 (호 깃발 0/1 이 붙어 있을 수 있음)
  const subs = [];
  let i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0, cur = null;
  let lastC = null, lastQ = null; // 직전 제어점 (S/T 반사용)
  const need = (n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      if (typeof toks[i] !== "string") throw new Error("경로 숫자가 모자랍니다");
      out.push(Number(toks[i++]));
    }
    return out;
  };
  const begin = (x, y) => { cur = { start: [x, y], segs: [], closed: false }; subs.push(cur); };
  const ensure = () => { if (!cur) begin(cx, cy); };
  // 호 읽기: 깃발(0/1)이 붙어서 쓰일 수 있음 ("a10 10 0 0110 10")
  const needArc = () => {
    const out = [];
    for (let k = 0; k < 7; k++) {
      if (k === 3 || k === 4) {
        const s = toks[i];
        if (typeof s !== "string") throw new Error("호 숫자가 모자랍니다");
        if ((s[0] === "0" || s[0] === "1") && s.length > 1) {
          out.push(Number(s[0]));
          toks[i] = s.slice(1); // 남은 글자는 다음 숫자
          continue;
        }
        out.push(Number(s) ? 1 : 0); i++;
      } else out.push(need(1)[0]);
    }
    return out;
  };
  while (i < toks.length) {
    if (typeof toks[i] === "object") cmd = toks[i++].c;
    else if (!cmd) throw new Error("경로가 명령으로 시작하지 않습니다");
    const rel = cmd === cmd.toLowerCase() && cmd !== "z" && cmd !== "Z" ? true : cmd === "z";
    const C = cmd.toUpperCase();
    const ox = rel && C !== "Z" ? cx : 0, oy = rel && C !== "Z" ? cy : 0;
    if (C === "Z") {
      if (cur) cur.closed = true;
      cx = sx; cy = sy; cur = null; lastC = lastQ = null;
      continue;
    }
    if (C === "M") {
      const [x, y] = need(2);
      cx = x + ox; cy = y + oy; sx = cx; sy = cy; begin(cx, cy);
      cmd = rel ? "l" : "L"; // M 뒤에 이어지는 숫자는 선
      lastC = lastQ = null;
      continue;
    }
    ensure();
    if (C === "L" || C === "H" || C === "V") {
      let x = cx, y = cy;
      if (C === "L") { const v = need(2); x = v[0] + ox; y = v[1] + oy; }
      if (C === "H") x = need(1)[0] + ox;
      if (C === "V") y = need(1)[0] + oy;
      cur.segs.push(["L", x, y]); cx = x; cy = y; lastC = lastQ = null;
    } else if (C === "C" || C === "S") {
      let x1, y1;
      if (C === "C") { const v = need(2); x1 = v[0] + ox; y1 = v[1] + oy; }
      else { x1 = lastC ? 2 * cx - lastC[0] : cx; y1 = lastC ? 2 * cy - lastC[1] : cy; }
      const v = need(4);
      const x2 = v[0] + ox, y2 = v[1] + oy, x = v[2] + ox, y = v[3] + oy;
      cur.segs.push(["C", x1, y1, x2, y2, x, y]); lastC = [x2, y2]; lastQ = null; cx = x; cy = y;
    } else if (C === "Q" || C === "T") {
      let qx, qy;
      if (C === "Q") { const v = need(2); qx = v[0] + ox; qy = v[1] + oy; }
      else { qx = lastQ ? 2 * cx - lastQ[0] : cx; qy = lastQ ? 2 * cy - lastQ[1] : cy; }
      const v = need(2);
      const x = v[0] + ox, y = v[1] + oy;
      // 2차 곡선은 3차 곡선으로 정확히 바꿀 수 있음
      cur.segs.push(["C", cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y]);
      lastQ = [qx, qy]; lastC = null; cx = x; cy = y;
    } else if (C === "A") {
      const [rx, ry, rot, large, sweep, ex, ey] = needArc();
      const x = ex + ox, y = ey + oy;
      for (const c of arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y)) cur.segs.push(c);
      cx = x; cy = y; lastC = lastQ = null;
    } else throw new Error("모르는 경로 명령: " + cmd);
  }
  return subs.filter((s) => s.segs.length > 0);
}

// 호(타원 일부) → 3차 곡선 여러 개 (SVG 규격 F.6 방식)
function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (rx === 0 || ry === 0) return [["L", x2, y2]];
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (fa === fs) co = -co;
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2));
  const out = [];
  const step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const pt = (t) => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
  const dv = (t) => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
  for (let j = 0; j < n; j++) {
    const a = t1 + j * step, b = a + step;
    const [ax, ay] = pt(a), [bx, by] = pt(b), [dax, day] = dv(a), [dbx, dby] = dv(b);
    out.push(["C", ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, j === n - 1 ? x2 : bx, j === n - 1 ? y2 : by]);
  }
  return out;
}

// ---------- 기본 도형 → 하위 경로 ----------
const K = 0.5522847498; // 원을 3차 곡선 4개로 그릴 때 쓰는 값
export function ellipseSub(cx, cy, rx, ry) {
  return {
    start: [cx + rx, cy], closed: true,
    segs: [
      ["C", cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry],
      ["C", cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy],
      ["C", cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry],
      ["C", cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy],
    ],
  };
}
export function rectSub(x, y, w, h, rx = 0, ry = 0) {
  if (!rx && !ry) return { start: [x, y], closed: true, segs: [["L", x + w, y], ["L", x + w, y + h], ["L", x, y + h], ["L", x, y]] };
  rx = Math.min(rx || ry, w / 2); ry = Math.min(ry || rx, h / 2);
  const kx = K * rx, ky = K * ry;
  return {
    start: [x + rx, y], closed: true,
    segs: [
      ["L", x + w - rx, y], ["C", x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry],
      ["L", x + w, y + h - ry], ["C", x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h],
      ["L", x + rx, y + h], ["C", x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry],
      ["L", x, y + ry], ["C", x, y + ry - ky, x + rx - kx, y, x + rx, y],
    ],
  };
}
export function polySub(pts, closed = true) {
  if (pts.length < 2) return null;
  return { start: pts[0], closed, segs: pts.slice(1).map((p) => ["L", p[0], p[1]]) };
}

export function transformSub(s, m) {
  const out = { start: apply(m, ...s.start), closed: s.closed, segs: [] };
  for (const g of s.segs) {
    const v = [];
    for (let k = 1; k < g.length; k += 2) v.push(...apply(m, g[k], g[k + 1]));
    out.segs.push([g[0], ...v]);
  }
  return out;
}

// ---------- 방향 맞추기 ----------
// 곡선을 잘게 나눠 다각형으로 (넓이·안쪽 판정용)
export function flatten(s, n = 8) {
  const pts = [s.start];
  let [px, py] = s.start;
  for (const g of s.segs) {
    if (g[0] === "L") pts.push([g[1], g[2]]);
    else {
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        pts.push([
          u * u * u * px + 3 * u * u * t * g[1] + 3 * u * t * t * g[3] + t * t * t * g[5],
          u * u * u * py + 3 * u * u * t * g[2] + 3 * u * t * t * g[4] + t * t * t * g[6],
        ]);
      }
    }
    [px, py] = [g[g.length - 2], g[g.length - 1]];
  }
  return pts;
}
export const area = (poly) => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};
const inside = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
export function reverseSub(s) {
  // 끝점부터 거꾸로
  const nodes = [s.start];
  for (const g of s.segs) nodes.push([g[g.length - 2], g[g.length - 1]]);
  const out = { start: nodes[nodes.length - 1], closed: s.closed, segs: [] };
  for (let k = s.segs.length - 1; k >= 0; k--) {
    const g = s.segs[k], to = nodes[k];
    out.segs.push(g[0] === "L" ? ["L", to[0], to[1]] : ["C", g[3], g[4], g[1], g[2], to[0], to[1]]);
  }
  return out;
}
// 바깥선은 (화면 기준) 반시계, 구멍은 시계 방향으로. 엔진이 위아래를 뒤집으면 TrueType 규칙(바깥 시계)과 맞음.
// 겹친 정도(몇 겹 안에 들어 있는지)로 바깥/구멍을 정한다 → evenodd 로 그린 파일도 모양 그대로 유지
export function orient(subs) {
  const polys = subs.map((s) => flatten(s));
  const areas = polys.map((p) => Math.abs(area(p)));
  // 윤곽 전체(여러 점)가 다른 윤곽 안에 들어 있을 때만 '그 안에 있다'고 본다.
  // 시작점 하나만 보면, 겹쳐 그린 획(ㅍ의 세로획처럼 가로획 위에서 시작)을 구멍으로 잘못 뒤집는다.
  const within = (i, j) => {
    const p = polys[i];
    const step = Math.max(1, Math.floor(p.length / 16));
    let n = 0, hit = 0;
    for (let k = 0; k < p.length; k += step) { n++; if (inside(p[k], polys[j])) hit++; }
    return hit === n;
  };
  return subs.map((s, i) => {
    let depth = 0;
    subs.forEach((_, j) => { if (j !== i && areas[j] > areas[i] && within(i, j)) depth++; });
    const a = area(polys[i]);
    const wantNeg = depth % 2 === 0; // 바깥선 → 넓이(화면 좌표) 음수
    return (a < 0) === wantNeg ? s : reverseSub(s);
  });
}

// ---------- 출력 ----------
const r = (v) => {
  const x = Math.round(v * 10) / 10;
  return Object.is(x, -0) ? "0" : String(x);
};
export function subsToD(subs) {
  return subs.map((s) => "M" + r(s.start[0]) + " " + r(s.start[1]) +
    s.segs.map((g) => g[0] + g.slice(1).map(r).join(" ")).join("") + "Z").join("");
}
export const glyphSvg = (d) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">\n  <path d="${d}"/>\n</svg>\n`;

// ---------- 편집기 구조: 점(노드) ----------
// 윤곽 = { nodes:[{x,y, hin:{x,y}|null, hout:{x,y}|null, smooth:bool}] } (항상 닫힌 도형)
export function subsToContours(subs) {
  return subs.map((s) => {
    const nodes = [{ x: s.start[0], y: s.start[1], hin: null, hout: null, smooth: false }];
    for (const g of s.segs) {
      const prev = nodes[nodes.length - 1];
      const end = { x: g[g.length - 2], y: g[g.length - 1], hin: null, hout: null, smooth: false };
      if (g[0] === "C") {
        if (Math.hypot(g[1] - prev.x, g[2] - prev.y) > 0.01) prev.hout = { x: g[1], y: g[2] };
        if (Math.hypot(g[3] - end.x, g[4] - end.y) > 0.01) end.hin = { x: g[3], y: g[4] };
      }
      nodes.push(end);
    }
    // 마지막 점이 첫 점과 같으면 합침
    const a = nodes[0], b = nodes[nodes.length - 1];
    if (nodes.length > 1 && Math.hypot(a.x - b.x, a.y - b.y) < 0.01) { a.hin = b.hin; nodes.pop(); }
    for (const n of nodes) {
      if (n.hin && n.hout) {
        const v1 = [n.x - n.hin.x, n.y - n.hin.y], v2 = [n.hout.x - n.x, n.hout.y - n.y];
        const cr = v1[0] * v2[1] - v1[1] * v2[0], l = Math.hypot(...v1) * Math.hypot(...v2);
        n.smooth = l > 0 && Math.abs(cr) / l < 0.02 && v1[0] * v2[0] + v1[1] * v2[1] > 0;
      }
    }
    return { nodes };
  }).filter((c) => c.nodes.length >= 2);
}
export function contoursToSubs(contours) {
  return contours.filter((c) => c.nodes.length >= 2).map((c) => {
    const ns = c.nodes, segs = [];
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i], b = ns[(i + 1) % ns.length];
      if (a.hout || b.hin) {
        const h1 = a.hout || a, h2 = b.hin || b;
        segs.push(["C", h1.x, h1.y, h2.x, h2.y, b.x, b.y]);
      } else segs.push(["L", b.x, b.y]);
    }
    return { start: [ns[0].x, ns[0].y], segs, closed: true };
  });
}
export const contoursToSvg = (contours) => glyphSvg(subsToD(orient(contoursToSubs(contours))));

// ---------- 점 줄이기 + 매끄럽게 (자동 따기·손글씨 조각처럼 점이 아주 많은 윤곽용) ----------
// 1) 꼭 필요한 점만 남기고(Ramer–Douglas–Peucker) 2) 꺾인 곳은 모난 점, 나머지는 곡선 점으로
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let best = -1, bi = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L;
    if (d > best) { best = d; bi = i; }
  }
  if (best <= eps) return [a, b];
  return [...rdp(pts.slice(0, bi + 1), eps).slice(0, -1), ...rdp(pts.slice(bi), eps)];
}
export function simplifyContour(c, eps = 9, cornerDeg = 55) {
  // 닫힌 윤곽의 점 목록(곡선은 잘게 나눔)
  const sub = contoursToSubs([c])[0];
  let pts = flatten(sub, 6);
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 0.01) pts.pop();
  if (pts.length < 4) return c;
  // 가장 먼 두 점에서 나눠 닫힌 선을 줄임
  let far = 0, fd = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  const a = rdp(pts.slice(0, far + 1), eps), b = rdp([...pts.slice(far), pts[0]], eps);
  const s = [...a.slice(0, -1), ...b.slice(0, -1)];
  if (s.length < 3) return c;
  const n = s.length, r = (v) => Math.round(v * 10) / 10;
  const nodes = s.map((p, i) => {
    const pv = s[(i - 1 + n) % n], nx = s[(i + 1) % n];
    const v1 = [p[0] - pv[0], p[1] - pv[1]], v2 = [nx[0] - p[0], nx[1] - p[1]];
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((l1 * l2) || 1);
    const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (ang > cornerDeg) return { x: r(p[0]), y: r(p[1]), hin: null, hout: null, smooth: false };
    // 곡선 점: 앞뒤 점을 잇는 방향으로 손잡이 (길이 = 이웃까지 거리의 1/3)
    const t = [nx[0] - pv[0], nx[1] - pv[1]], tl = Math.hypot(...t) || 1;
    const u = [t[0] / tl, t[1] / tl];
    return { x: r(p[0]), y: r(p[1]), hin: { x: r(p[0] - u[0] * l1 / 3), y: r(p[1] - u[1] * l1 / 3) }, hout: { x: r(p[0] + u[0] * l2 / 3), y: r(p[1] + u[1] * l2 / 3) }, smooth: true };
  });
  return { nodes };
}
