"use client";
// 글자 편집기 (9단계): 앱 안에서 바로 그리고 저장. 폰(손가락)·PC(마우스) 공용.
//  도구: 선택(점·손잡이·도형 옮기기) · 펜(점 찍기, 끌면 곡선) · 점 추가 · 사각형 · 원 · 화면 이동
//  보조: 바닥선(y=800)·틀·가운데선, 격자와 붙기, 숫자로 좌표·크기, 확대/축소, 되돌리기, 밑그림(투명도·크기·위치)
//  저장: 규칙 모양(절대좌표 경로, 바깥선/구멍 방향 정리)으로 만들어 넘긴다.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui";
import { contoursToSubs, contoursToSvg, subsToContours, subsToD, flatten, orient, parsePathD, transformSub, simplifyContour } from "../lib/glyph/geom";
import { api } from "../lib/api";
import { normalizeSvg } from "../lib/glyph/normalize";

const K = 0.5522847498;
const clone = (c) => JSON.parse(JSON.stringify(c));
const SNAPS = [0, 5, 10, 25, 50];
const TOOLS = [
  ["select", "↖", "선택"],
  ["pen", "✒", "펜"],
  ["add", "+", "점 추가"],
  ["rect", "▭", "사각형"],
  ["ellipse", "◯", "원"],
  ["pan", "✋", "화면 이동"],
];

// 밑그림은 글자를 옮겨 다녀도 유지 (같은 스캔 이미지로 여러 글자를 따라 그리는 경우가 많음)
const refMemory = { src: null, opacity: 0.35, size: 1000, x: 0, y: 0, show: true };

function moveNode(n, dx, dy) {
  n.x += dx; n.y += dy;
  if (n.hin) { n.hin.x += dx; n.hin.y += dy; }
  if (n.hout) { n.hout.x += dx; n.hout.y += dy; }
}
function bbox(contour) {
  const pts = flatten(contoursToSubs([contour])[0] || { start: [0, 0], segs: [] }, 6);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
const rnd = (v) => Math.round(v * 10) / 10;

// 3차 곡선을 t 에서 둘로 나누기 (점 추가용)
function splitCubic(p0, p1, p2, p3, t) {
  const l = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a = l(p0, p1), b = l(p1, p2), c = l(p2, p3), d = l(a, b), e = l(b, c), f = l(d, e);
  return { a, d, f, e, c };
}

export function GlyphEditor({ glyph, list = [], loadSvg, onSave, onClose, onNavigate, toast, onOpenSvgEdit }) {
  const svgRef = useRef(null);
  const [contours, setContours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tool, setTool] = useState("select");
  const [sel, setSel] = useState(null); // {c, n} 점 선택 | {c} 도형 선택
  const [penOpen, setPenOpen] = useState(null); // 펜으로 그리는 중인 도형 번호
  const [snap, setSnap] = useState(10);
  const [view, setView] = useState({ x: -60, y: -60, w: 1120 });
  const [ref, setRef] = useState({ ...refMemory });
  const [panel, setPanel] = useState(null); // ref | more | null
  const [notes, setNotes] = useState([]);
  const [thr, setThr] = useState(140);       // 자동 따기 진하기 기준
  const [tracing, setTracing] = useState(false);
  const [ask, setAsk] = useState(null); // 저장 안 하고 떠날 때 묻기: {then}
  const past = useRef([]), future = useRef([]);
  const drag = useRef(null);
  const pointers = useRef(new Map());
  const cref = useRef(contours);
  cref.current = contours;

  useEffect(() => { Object.assign(refMemory, ref); }, [ref]);

  // ---- 글자 불러오기 ----
  useEffect(() => {
    let stop = false;
    setLoading(true); setSel(null); setPenOpen(null); setNotes([]); past.current = []; future.current = []; setDirty(false);
    (async () => {
      try {
        const text = await loadSvg(glyph.filename);
        if (stop) return;
        if (text) {
          const r = normalizeSvg(text);
          setContours(r.subs.length ? subsToContours(r.subs) : []);
          setNotes([...r.problems, ...r.notes]);
        } else setContours([]);
      } catch (e) { if (!stop) { setContours([]); setNotes([e.message || "글자를 불러오지 못했습니다."]); } }
      finally { if (!stop) setLoading(false); }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glyph.filename]);

  // ---- 바꾸기 (되돌리기 기록) ----
  const commit = useCallback((next, keepFuture = false) => {
    setContours((cur) => {
      past.current.push(clone(cur));
      if (past.current.length > 100) past.current.shift();
      if (!keepFuture) future.current = [];
      return typeof next === "function" ? next(clone(cur)) : next;
    });
    setDirty(true);
  }, []);
  const undo = () => {
    if (!past.current.length) return;
    future.current.push(clone(contours));
    setContours(past.current.pop()); setSel(null); setPenOpen(null); setDirty(true);
  };
  const redo = () => {
    if (!future.current.length) return;
    past.current.push(clone(contours));
    setContours(future.current.pop()); setSel(null); setDirty(true);
  };

  // ---- 좌표 ----
  const toGlyph = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };
  const ups = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? view.w / Math.min(r.width, r.height) : 2; // 화면 1픽셀 = 글자 몇 칸
  };
  const snapV = (v) => (snap ? Math.round(v / snap) * snap : rnd(v));
  const snapP = (p) => {
    let { x, y } = { x: snapV(p.x), y: snapV(p.y) };
    if (snap && Math.abs(p.y - 800) < snap * 0.8) y = 800; // 바닥선에 붙기
    return { x, y };
  };

  // ---- 확대·이동 ----
  const zoomAt = (factor, cx, cy) => setView((v) => {
    const w = Math.min(4000, Math.max(80, v.w * factor));
    const k = w / v.w;
    return { w, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
  });
  const fit = () => setView({ x: -60, y: -60, w: 1120 });

  // ---- 누르기 ----
  const hit = (e) => e.target?.dataset || {};
  const onDown = (e) => {
    if (loading) return;
    svgRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) { // 두 손가락: 확대/이동
      const [a, b] = [...pointers.current.values()];
      drag.current = { kind: "pinch", d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view };
      return;
    }
    const p = toGlyph(e);
    const h = hit(e);
    const c = h.c !== undefined ? +h.c : null, n = h.n !== undefined ? +h.n : null;

    if (tool === "pan" || (e.button === 1)) { drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view }; return; }

    if (tool === "select") {
      if (h.kind === "node" || h.kind === "hin" || h.kind === "hout") {
        setSel({ c, n });
        drag.current = { kind: h.kind, c, n, start: p, before: clone(contours), moved: false };
        return;
      }
      if (h.kind === "shape") {
        setSel({ c });
        drag.current = { kind: "shape", c, start: p, last: snapP(p), before: clone(contours), moved: false };
        return;
      }
      setSel(null);
      drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view };
      return;
    }

    if (tool === "pen") {
      const sp = snapP(p);
      if (penOpen !== null && h.kind === "node" && c === penOpen && n === 0 && contours[penOpen].nodes.length >= 3) {
        setPenOpen(null); setSel({ c: penOpen }); toast?.("도형을 닫았어요");
        return;
      }
      const node = { x: sp.x, y: sp.y, hin: null, hout: null, smooth: false };
      if (penOpen === null) {
        commit((cs) => { cs.push({ nodes: [node] }); return cs; });
        const ci = contours.length;
        setPenOpen(ci); setSel({ c: ci, n: 0 });
        drag.current = { kind: "penHandle", c: ci, n: 0 };
      } else {
        const ni = contours[penOpen].nodes.length;
        commit((cs) => { cs[penOpen].nodes.push(node); return cs; });
        setSel({ c: penOpen, n: ni });
        drag.current = { kind: "penHandle", c: penOpen, n: ni };
      }
      return;
    }

    if (tool === "add") {
      if (h.kind === "shape" || h.kind === "node") { insertNodeNear(p, c); return; }
      insertNodeNear(p, null);
      return;
    }

    if (tool === "rect" || tool === "ellipse") {
      const sp = snapP(p);
      drag.current = { kind: tool, start: sp, before: clone(contours), index: contours.length };
      commit((cs) => { cs.push({ nodes: [] }); return cs; });
    }
  };

  const onMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = svgRef.current.getBoundingClientRect();
      const k = d.d / dist;
      const unit = d.view.w / Math.min(r.width, r.height);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const cx = d.view.x + (d.mid.x - r.left - (r.width - Math.min(r.width, r.height)) / 2) * unit;
      const cy = d.view.y + (d.mid.y - r.top - (r.height - Math.min(r.width, r.height)) / 2) * unit;
      const w = Math.min(4000, Math.max(80, d.view.w * k));
      setView({ w, x: cx - (cx - d.view.x) * (w / d.view.w) - (mid.x - d.mid.x) * unit, y: cy - (cy - d.view.y) * (w / d.view.w) - (mid.y - d.mid.y) * unit });
      return;
    }
    if (d.kind === "pan") {
      const unit = ups();
      setView({ ...d.view, x: d.view.x - (e.clientX - d.sx) * unit, y: d.view.y - (e.clientY - d.sy) * unit });
      return;
    }
    const p = toGlyph(e);
    if (d.kind === "node" || d.kind === "hin" || d.kind === "hout" || d.kind === "shape") {
      if (!d.moved) { past.current.push(d.before); future.current = []; d.moved = true; setDirty(true); }
      setContours((cur) => {
        const cs = clone(cur);
        if (d.kind === "shape") {
          const sp = snapP(p);
          const dx = sp.x - d.last.x, dy = sp.y - d.last.y;
          d.last = sp;
          for (const nd of cs[d.c].nodes) moveNode(nd, dx, dy);
          return cs;
        }
        const node = cs[d.c].nodes[d.n];
        if (d.kind === "node") { const sp = snapP(p); moveNode(node, sp.x - node.x, sp.y - node.y); }
        else {
          const sp = { x: rnd(p.x), y: rnd(p.y) };
          node[d.kind] = sp;
          const other = d.kind === "hin" ? "hout" : "hin";
          if (node.smooth && node[other]) { // 부드러운 점: 반대쪽 손잡이도 같은 방향으로
            const len = Math.hypot(node[other].x - node.x, node[other].y - node.y);
            const vx = node.x - sp.x, vy = node.y - sp.y, l = Math.hypot(vx, vy) || 1;
            node[other] = { x: rnd(node.x + (vx / l) * len), y: rnd(node.y + (vy / l) * len) };
          }
        }
        return cs;
      });
      return;
    }
    if (d.kind === "penHandle") {
      setContours((cur) => {
        const cs = clone(cur);
        const node = cs[d.c]?.nodes[d.n];
        if (!node) return cur;
        const hx = rnd(p.x), hy = rnd(p.y);
        if (Math.hypot(hx - node.x, hy - node.y) * (1 / ups()) < 6) return cur; // 살짝 떨린 건 무시
        node.hout = { x: hx, y: hy };
        node.hin = { x: rnd(2 * node.x - hx), y: rnd(2 * node.y - hy) };
        node.smooth = true;
        return cs;
      });
      return;
    }
    if (d.kind === "rect" || d.kind === "ellipse") {
      const sp = snapP(p);
      const x = Math.min(d.start.x, sp.x), y = Math.min(d.start.y, sp.y), w = Math.abs(sp.x - d.start.x), h = Math.abs(sp.y - d.start.y);
      setContours((cur) => {
        const cs = clone(cur);
        cs[d.index] = d.kind === "rect"
          ? { nodes: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => ({ x: a, y: b, hin: null, hout: null, smooth: false })) }
          : ellipseContour(x + w / 2, y + h / 2, w / 2, h / 2);
        return cs;
      });
    }
  };

  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === "pinch" && pointers.current.size) { drag.current = null; return; }
    drag.current = null;
    if (d && (d.kind === "rect" || d.kind === "ellipse")) {
      const c = cref.current[d.index];
      const b = c && c.nodes.length ? bbox(c) : null;
      if (!b || b.w < 5 || b.h < 5) { // 너무 작으면 없던 일로
        setContours(d.before); past.current.pop();
        toast?.("끌어서 크기를 정해 주세요");
      } else setSel({ c: d.index });
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const p = toGlyph(e);
    zoomAt(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function ellipseContour(cx, cy, rx, ry) {
    const mk = (x, y, hin, hout) => ({ x, y, hin, hout, smooth: true });
    return {
      nodes: [
        mk(cx + rx, cy, { x: cx + rx, y: cy - K * ry }, { x: cx + rx, y: cy + K * ry }),
        mk(cx, cy + ry, { x: cx + K * rx, y: cy + ry }, { x: cx - K * rx, y: cy + ry }),
        mk(cx - rx, cy, { x: cx - rx, y: cy + K * ry }, { x: cx - rx, y: cy - K * ry }),
        mk(cx, cy - ry, { x: cx - K * rx, y: cy - ry }, { x: cx + K * rx, y: cy - ry }),
      ],
    };
  }

  // 가장 가까운 선 위에 점 하나 넣기
  function insertNodeNear(p, only) {
    let best = null;
    contours.forEach((c, ci) => {
      if (only !== null && ci !== only) return;
      const ns = c.nodes;
      for (let i = 0; i < ns.length; i++) {
        const a = ns[i], b = ns[(i + 1) % ns.length];
        const p1 = a.hout || a, p2 = b.hin || b;
        for (let k = 1; k < 40; k++) {
          const t = k / 40, u = 1 - t;
          const x = u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x;
          const y = u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y;
          const dd = Math.hypot(x - p.x, y - p.y);
          if (!best || dd < best.d) best = { d: dd, ci, i, t };
        }
      }
    });
    if (!best || best.d > 30 * ups()) { toast?.("도형의 선 가까이를 눌러 주세요"); return; }
    commit((cs) => {
      const ns = cs[best.ci].nodes, a = ns[best.i], b = ns[(best.i + 1) % ns.length];
      const curve = a.hout || b.hin;
      let node;
      if (curve) {
        const s = splitCubic(a, a.hout || a, b.hin || b, b, best.t);
        if (a.hout) a.hout = { x: rnd(s.a.x), y: rnd(s.a.y) };
        if (b.hin) b.hin = { x: rnd(s.c.x), y: rnd(s.c.y) };
        node = { x: rnd(s.f.x), y: rnd(s.f.y), hin: { x: rnd(s.d.x), y: rnd(s.d.y) }, hout: { x: rnd(s.e.x), y: rnd(s.e.y) }, smooth: true };
      } else {
        node = { x: rnd(a.x + (b.x - a.x) * best.t), y: rnd(a.y + (b.y - a.y) * best.t), hin: null, hout: null, smooth: false };
      }
      ns.splice(best.i + 1, 0, node);
      return cs;
    });
    setSel({ c: best.ci, n: best.i + 1 });
  }

  // ---- 선택한 것 다루기 ----
  const selNode = sel && sel.n !== undefined && sel.n !== null ? contours[sel.c]?.nodes[sel.n] : null;
  const selShape = sel && contours[sel.c] ? contours[sel.c] : null;
  const box = useMemo(() => (selShape && selShape.nodes.length >= 2 ? bbox(selShape) : null), [selShape]);

  const deleteSel = () => {
    if (!sel) return;
    if (selNode) {
      commit((cs) => {
        cs[sel.c].nodes.splice(sel.n, 1);
        if (cs[sel.c].nodes.length < 2) cs.splice(sel.c, 1);
        return cs;
      });
      if (penOpen === sel.c && contours[sel.c].nodes.length <= 2) setPenOpen(null);
    } else {
      commit((cs) => { cs.splice(sel.c, 1); return cs; });
      if (penOpen === sel.c) setPenOpen(null);
    }
    setSel(null);
  };
  const toggleCurve = () => {
    if (!selNode) return;
    commit((cs) => {
      const ns = cs[sel.c].nodes, nd = ns[sel.n];
      if (nd.hin || nd.hout) { nd.hin = null; nd.hout = null; nd.smooth = false; }
      else {
        const prev = ns[(sel.n - 1 + ns.length) % ns.length], next = ns[(sel.n + 1) % ns.length];
        const vx = (next.x - prev.x) / 6, vy = (next.y - prev.y) / 6;
        nd.hin = { x: rnd(nd.x - vx), y: rnd(nd.y - vy) }; nd.hout = { x: rnd(nd.x + vx), y: rnd(nd.y + vy) }; nd.smooth = true;
      }
      return cs;
    });
  };
  const setNodeXY = (k, v) => {
    if (!selNode || !Number.isFinite(v)) return;
    commit((cs) => { const nd = cs[sel.c].nodes[sel.n]; moveNode(nd, k === "x" ? v - nd.x : 0, k === "y" ? v - nd.y : 0); return cs; });
  };
  const setBox = (k, v) => {
    if (!box || !Number.isFinite(v)) return;
    commit((cs) => {
      const c = cs[sel.c];
      const sx = k === "w" && box.w ? v / box.w : 1, sy = k === "h" && box.h ? v / box.h : 1;
      const dx = k === "x" ? v - box.x : 0, dy = k === "y" ? v - box.y : 0;
      const f = (pt) => { pt.x = rnd(box.x + (pt.x - box.x) * sx + dx); pt.y = rnd(box.y + (pt.y - box.y) * sy + dy); };
      for (const nd of c.nodes) { f(nd); if (nd.hin) f(nd.hin); if (nd.hout) f(nd.hout); }
      return cs;
    });
  };
  const nudge = (dx, dy) => {
    if (!sel) return;
    commit((cs) => {
      if (selNode) moveNode(cs[sel.c].nodes[sel.n], dx, dy);
      else for (const nd of cs[sel.c].nodes) moveNode(nd, dx, dy);
      return cs;
    });
  };
  const flipH = () => {
    if (!box) return;
    commit((cs) => {
      const c = cs[sel.c], mid = box.x + box.w / 2;
      const f = (pt) => { pt.x = rnd(2 * mid - pt.x); };
      for (const nd of c.nodes) { f(nd); if (nd.hin) f(nd.hin); if (nd.hout) f(nd.hout); }
      return cs;
    });
  };
  const duplicate = () => {
    if (!selShape) return;
    commit((cs) => { const c = clone(cs[sel.c]); for (const nd of c.nodes) moveNode(nd, 20, 20); cs.push(c); return cs; });
    setSel({ c: contours.length });
  };

  // ---- 키보드 (PC) ----
  useEffect(() => {
    const k = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (sel) { e.preventDefault(); deleteSel(); } }
      else if (e.key === "Escape") { setPenOpen(null); setSel(null); }
      else if (e.key.startsWith("Arrow") && sel) {
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        nudge(e.key === "ArrowLeft" ? -s : e.key === "ArrowRight" ? s : 0, e.key === "ArrowUp" ? -s : e.key === "ArrowDown" ? s : 0);
      } else if (!mod) {
        const map = { v: "select", p: "pen", a: "add", r: "rect", e: "ellipse", h: "pan" };
        if (map[e.key.toLowerCase()]) { setTool(map[e.key.toLowerCase()]); setPenOpen(null); }
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // ---- 저장 / 떠나기 ----
  const closedContours = contours.filter((c) => c.nodes.length >= 3 || (c.nodes.length === 2 && c.nodes.some((n) => n.hin || n.hout)));
  const save = async () => {
    if (saving) return false;
    if (!closedContours.length) { toast?.("그린 모양이 없습니다. 펜이나 사각형으로 그려 주세요."); return false; }
    setSaving(true);
    try {
      setPenOpen(null);
      await onSave(glyph.filename, contoursToSvg(closedContours));
      setDirty(false);
      return true;
    } catch (e) { toast?.(e.message || "저장하지 못했습니다."); return false; }
    finally { setSaving(false); }
  };
  const leave = (then) => { if (dirty) setAsk({ then }); else then(); };
  const idx = list.findIndex((g) => g.filename === glyph.filename);
  const prev = idx > 0 ? list[idx - 1] : null, next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;

  // ---- 밑그림(도안)에서 자동으로 패스 따기: 서버가 검은 부분 윤곽을 따고, 밑그림 놓인 자리에 맞춰 넣는다 ----
  const autoTrace = async (replace) => {
    if (!ref.src || tracing) return;
    setTracing(true);
    try {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = ref.src; });
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise((ok) => cv.toBlob(ok, "image/png"));
      const fd = new FormData();
      fd.append("file", new File([blob], "ref.png", { type: "image/png" }));
      fd.append("threshold", String(thr));
      const r = await api("/trace", { method: "POST", body: fd, timeout: 120000 });
      const s = ref.size / r.width; // 밑그림은 가로 ref.size 칸으로 깔려 있음
      const subs = orient(parsePathD(r.d).map((x) => transformSub(x, [s, 0, 0, s, ref.x, ref.y])));
      const add = subsToContours(subs).map((c) => simplifyContour(c)); // 점을 줄이고 매끄럽게
      commit((cs) => (replace ? add : [...cs, ...add]));
      setSel(null); setPenOpen(null); setTool("select");
      setRef((x) => ({ ...x, opacity: Math.min(x.opacity, 0.25) }));
      toast?.(`도형 ${add.length}개를 따냈어요 · 선택 도구로 점을 다듬으세요`);
    } catch (e) { toast?.(e.message || "자동으로 따내지 못했습니다."); }
    finally { setTracing(false); }
  };

  // ---- 파일 불러오기·내려받기 ----
  const fileRef = useRef(), refFile = useRef();
  const importSvg = async (text, from = "파일") => {
    const r = normalizeSvg(text);
    setNotes([...r.problems, ...r.notes]);
    if (!r.subs.length) { toast?.(r.problems[0] || "불러올 모양이 없습니다."); return; }
    commit(subsToContours(r.subs));
    setSel(null); setPenOpen(null);
    toast?.(`${from}에서 불러왔어요${r.notes.length ? " · 자동 정리 " + r.notes.length + "건" : ""}`);
  };
  const download = () => {
    const blob = new Blob([contoursToSvg(closedContours)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = glyph.filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // ---- 그리기 ----
  const u = ups();
  const gridLines = useMemo(() => {
    const step = snap >= 25 ? snap : snap ? 50 : 0;
    if (!step) return null;
    const out = [];
    for (let v = 0; v <= 1000; v += step) out.push(v);
    return out;
  }, [snap]);
  // 폰트와 똑같이 칠해 보이기: 겹친 획은 채우고, 안에 들어간 도형만 구멍 (저장할 때와 같은 방향 정리)
  const allD = useMemo(() => {
    try {
      const cs = contours.filter((c, i) => i !== penOpen && (c.nodes.length >= 3 || (c.nodes.length === 2 && c.nodes.some((n) => n.hin || n.hout))));
      return subsToD(orient(contoursToSubs(cs)));
    } catch { return ""; }
  }, [contours, penOpen]);
  const pathOf = (c, open) => {
    if (!c.nodes.length) return "";
    const ns = c.nodes;
    let d = `M${ns[0].x} ${ns[0].y}`;
    const n = open ? ns.length - 1 : ns.length;
    for (let i = 0; i < n; i++) {
      const a = ns[i], b = ns[(i + 1) % ns.length];
      d += a.hout || b.hin ? `C${(a.hout || a).x} ${(a.hout || a).y} ${(b.hin || b).x} ${(b.hin || b).y} ${b.x} ${b.y}` : `L${b.x} ${b.y}`;
    }
    return d + (open ? "" : "Z");
  };

  return (
    <div className="editor" role="dialog" aria-label={`${glyph.char} 글자 편집기`}>
      <div className="ed-top">
        <button className="ed-icon" onClick={() => leave(onClose)} aria-label="닫기">✕</button>
        <div className="ed-title">
          <b>{glyph.char === " " ? "␠" : glyph.char}</b>
          <small className="mono">{glyph.codepoint}{dirty ? " · 저장 안 됨" : ""}</small>
        </div>
        <button className="ed-icon" disabled={!prev} onClick={() => leave(() => onNavigate(prev))} aria-label="이전 글자">‹</button>
        <button className="ed-icon" disabled={!next} onClick={() => leave(() => onNavigate(next))} aria-label="다음 글자">›</button>
        <Button loading={saving} variant={dirty ? "" : "light"} onClick={save}>{dirty ? "저장" : "✓ 저장됨"}</Button>
      </div>

      {ask && (
        <div className="ed-ask" role="alertdialog">
          <span>저장하지 않은 변경이 있어요.</span>
          <div className="row-gap">
            <Button onClick={async () => { const t = ask.then; setAsk(null); if (await save()) t(); }}>저장하고 이동</Button>
            <Button variant="light" onClick={() => { const t = ask.then; setAsk(null); setDirty(false); t(); }}>버리기</Button>
            <Button variant="light" onClick={() => setAsk(null)}>취소</Button>
          </div>
        </div>
      )}

      <div className="ed-stage">
        <svg ref={svgRef} className={"ed-canvas tool-" + tool} viewBox={`${view.x} ${view.y} ${view.w} ${view.w}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          onDoubleClick={(e) => { if (tool === "select" && hit(e).kind === "shape") insertNodeNear(toGlyph(e), +hit(e).c); }}>
          <rect x="0" y="0" width="1000" height="1000" className="ed-paper" />
          {ref.src && ref.show && (
            <image href={ref.src} x={ref.x} y={ref.y} width={ref.size} opacity={ref.opacity} preserveAspectRatio="xMinYMin meet" style={{ pointerEvents: "none" }} />
          )}
          {gridLines && gridLines.map((v) => (
            <g key={v} className="ed-grid"><line x1={v} y1="0" x2={v} y2="1000" strokeWidth={u * 0.6} /><line x1="0" y1={v} x2="1000" y2={v} strokeWidth={u * 0.6} /></g>
          ))}
          <line x1="500" y1="0" x2="500" y2="1000" className="ed-center" strokeWidth={u} strokeDasharray={`${u * 6} ${u * 6}`} />
          <line x1="-2000" y1="800" x2="3000" y2="800" className="ed-baseline" strokeWidth={u * 1.5} />
          <text x="6" y={800 - u * 6} className="ed-label" fontSize={u * 11}>바닥선 800</text>
          <rect x="0" y="0" width="1000" height="1000" className="ed-frame" strokeWidth={u * 1.2} />

          <path d={allD} className="ed-fill" fillRule="nonzero" style={{ pointerEvents: "none" }} />
          {contours.map((c, ci) => (
            <path key={"s" + ci} d={pathOf(c, ci === penOpen)} data-kind="shape" data-c={ci}
              className={"ed-shape" + (sel?.c === ci ? " on" : "") + (ci === penOpen ? " open" : "")} strokeWidth={u * (sel?.c === ci ? 2 : 1)} />
          ))}
          {contours.map((c, ci) => (sel?.c === ci || ci === penOpen || tool === "select") && c.nodes.map((nd, ni) => {
            const on = sel?.c === ci && sel?.n === ni;
            const showH = sel?.c === ci || ci === penOpen;
            return (
              <g key={ci + "-" + ni}>
                {showH && nd.hin && <><line x1={nd.x} y1={nd.y} x2={nd.hin.x} y2={nd.hin.y} className="ed-hline" strokeWidth={u} />
                  <circle cx={nd.hin.x} cy={nd.hin.y} r={u * 5} className="ed-handle" data-kind="hin" data-c={ci} data-n={ni} />
                  <circle cx={nd.hin.x} cy={nd.hin.y} r={u * 14} className="ed-hit" data-kind="hin" data-c={ci} data-n={ni} /></>}
                {showH && nd.hout && <><line x1={nd.x} y1={nd.y} x2={nd.hout.x} y2={nd.hout.y} className="ed-hline" strokeWidth={u} />
                  <circle cx={nd.hout.x} cy={nd.hout.y} r={u * 5} className="ed-handle" data-kind="hout" data-c={ci} data-n={ni} />
                  <circle cx={nd.hout.x} cy={nd.hout.y} r={u * 14} className="ed-hit" data-kind="hout" data-c={ci} data-n={ni} /></>}
                {nd.smooth
                  ? <circle cx={nd.x} cy={nd.y} r={u * (on ? 7 : 5.5)} className={"ed-node" + (on ? " on" : "") + (ni === 0 && ci === penOpen ? " first" : "")} data-kind="node" data-c={ci} data-n={ni} />
                  : <rect x={nd.x - u * (on ? 6.5 : 5)} y={nd.y - u * (on ? 6.5 : 5)} width={u * (on ? 13 : 10)} height={u * (on ? 13 : 10)} className={"ed-node" + (on ? " on" : "") + (ni === 0 && ci === penOpen ? " first" : "")} data-kind="node" data-c={ci} data-n={ni} />}
                <circle cx={nd.x} cy={nd.y} r={u * 16} className="ed-hit" data-kind="node" data-c={ci} data-n={ni} />
              </g>
            );
          }))}
        </svg>
        {loading && <div className="ed-loading">글자를 불러오는 중…</div>}
        {!loading && !contours.length && <div className="ed-empty">펜(✒)으로 점을 찍거나, 사각형·원을 끌어서 그려 보세요.<br />점을 찍고 끌면 곡선이 됩니다.</div>}
        <div className="ed-zoom">
          <button onClick={() => zoomAt(1 / 1.25, view.x + view.w / 2, view.y + view.w / 2)} aria-label="확대">＋</button>
          <button onClick={() => zoomAt(1.25, view.x + view.w / 2, view.y + view.w / 2)} aria-label="축소">－</button>
          <button onClick={fit} aria-label="전체 보기">⤢</button>
        </div>
        <div className="ed-preview" aria-label="작게 본 모양">
          <svg viewBox="0 0 1000 1000"><path d={allD} fillRule="nonzero" /></svg>
          <span>{glyph.char}</span>
        </div>
      </div>

      {penOpen !== null && tool === "pen" && (
        <div className="ed-hint">점을 계속 찍고, 첫 점을 누르면 닫힙니다. <button className="linkbtn" onClick={() => { setPenOpen(null); toast?.("도형을 닫았어요"); }}>여기서 닫기</button></div>
      )}

      {/* 선택한 점·도형: 숫자로 정밀하게 */}
      {(selNode || box) && (
        <div className="ed-inspect">
          {selNode ? (
            <>
              <label>X<input type="number" value={rnd(selNode.x)} onChange={(e) => setNodeXY("x", parseFloat(e.target.value))} /></label>
              <label>Y<input type="number" value={rnd(selNode.y)} onChange={(e) => setNodeXY("y", parseFloat(e.target.value))} /></label>
              <button onClick={toggleCurve}>{selNode.hin || selNode.hout ? "직선 점으로" : "곡선 점으로"}</button>
            </>
          ) : (
            <>
              <label>X<input type="number" value={rnd(box.x)} onChange={(e) => setBox("x", parseFloat(e.target.value))} /></label>
              <label>Y<input type="number" value={rnd(box.y)} onChange={(e) => setBox("y", parseFloat(e.target.value))} /></label>
              <label>너비<input type="number" value={rnd(box.w)} onChange={(e) => setBox("w", parseFloat(e.target.value))} /></label>
              <label>높이<input type="number" value={rnd(box.h)} onChange={(e) => setBox("h", parseFloat(e.target.value))} /></label>
              <button onClick={duplicate}>복제</button>
              <button onClick={flipH}>좌우 뒤집기</button>
            </>
          )}
          <span className="ed-nudge">
            <button onClick={() => nudge(-1, 0)} aria-label="왼쪽 1">←</button>
            <button onClick={() => nudge(0, -1)} aria-label="위 1">↑</button>
            <button onClick={() => nudge(0, 1)} aria-label="아래 1">↓</button>
            <button onClick={() => nudge(1, 0)} aria-label="오른쪽 1">→</button>
          </span>
          <button className="danger" onClick={deleteSel}>{selNode ? "점 지우기" : "도형 지우기"}</button>
        </div>
      )}

      {panel === "ref" && (
        <div className="ed-panel">
          <div className="row-between"><b>밑그림</b><button className="ed-icon" onClick={() => setPanel(null)} aria-label="밑그림 설정 닫기">✕</button></div>
          <input ref={refFile} type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (!f) return;
            if (f.size > 8 * 1024 * 1024) { toast?.("8MB 이하 그림을 골라 주세요."); return; }
            const rd = new FileReader();
            rd.onload = () => setRef((r) => ({ ...r, src: rd.result, show: true }));
            rd.readAsDataURL(f);
          }} />
          <div className="row-gap">
            <Button variant="light" onClick={() => refFile.current?.click()}>{ref.src ? "다른 그림" : "그림 고르기"}</Button>
            {ref.src && <Button variant="light" onClick={() => setRef((r) => ({ ...r, show: !r.show }))}>{ref.show ? "숨기기" : "보이기"}</Button>}
            {ref.src && <Button variant="light" onClick={() => setRef((r) => ({ ...r, src: null }))}>빼기</Button>}
          </div>
          {ref.src && (
            <div className="ed-sliders">
              <label>투명도 <input type="range" min="0.05" max="1" step="0.05" value={ref.opacity} onChange={(e) => setRef((r) => ({ ...r, opacity: +e.target.value }))} /><span>{Math.round(ref.opacity * 100)}%</span></label>
              <label>크기 <input type="range" min="200" max="2000" step="10" value={ref.size} onChange={(e) => setRef((r) => ({ ...r, size: +e.target.value }))} /><span>{ref.size}</span></label>
              <label>가로 위치 <input type="range" min="-500" max="500" step="5" value={ref.x} onChange={(e) => setRef((r) => ({ ...r, x: +e.target.value }))} /><span>{ref.x}</span></label>
              <label>세로 위치 <input type="range" min="-500" max="500" step="5" value={ref.y} onChange={(e) => setRef((r) => ({ ...r, y: +e.target.value }))} /><span>{ref.y}</span></label>
            </div>
          )}
          {ref.src && (
            <div className="ed-trace">
              <label>진하기 기준 <input type="range" min="60" max="220" step="5" value={thr} onChange={(e) => setThr(+e.target.value)} /><span>{thr}</span></label>
              <div className="row-gap">
                <Button loading={tracing} onClick={() => autoTrace(!contours.length)}>✦ 자동으로 패스 따기</Button>
                {contours.length > 0 && <Button variant="light" disabled={tracing} onClick={() => autoTrace(true)}>지우고 새로 따기</Button>}
              </div>
              <small className="muted">도안의 검은 부분을 점·선 패스로 바꿔 넣습니다. 너무 굵게 나오면 기준을 낮추고, 끊기면 높이세요. 되돌리기(↶)로 취소할 수 있어요.</small>
            </div>
          )}
          <p className="muted" style={{ margin: "6px 0 0" }}>직접 쓴 손글씨나 스케치를 사진으로 찍어 깔고 따라 그리세요. 다른 폰트의 글자를 따라 그리면 안 됩니다. 밑그림은 저장되지 않고, 글자를 옮겨도 이 창을 닫기 전까지 유지됩니다.</p>
        </div>
      )}

      {panel === "more" && (
        <div className="ed-panel">
          <div className="row-between"><b>더 보기</b><button className="ed-icon" onClick={() => setPanel(null)} aria-label="더 보기 닫기">✕</button></div>
          <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (f) { await importSvg(await f.text(), f.name); setPanel(null); }
          }} />
          <div className="ed-morelist">
            <button onClick={() => fileRef.current?.click()}><b>SVG 파일 불러오기</b><small>일러스트레이터·Inkscape 등에서 만든 파일 → 자동 정리</small></button>
            <button onClick={download} disabled={!closedContours.length}><b>SVG 내려받기</b><small>{glyph.filename} · 다른 프로그램에서 고칠 때</small></button>
            {onOpenSvgEdit && <button onClick={() => { setPanel(null); onOpenSvgEdit(contoursToSvg(closedContours), (text) => importSvg(text, "SVG-Edit")); }}><b>SVG-Edit에서 열기</b><small>PC용 고급 편집기 · 저장하면 여기로 돌아와 자동 정리</small></button>}
            <button onClick={() => { if (contours.length) { commit((cs) => cs.map((c) => (c.nodes.length > 12 ? simplifyContour(c) : c))); setPanel(null); toast?.("점을 줄이고 매끄럽게 했어요 · 되돌리기(↶) 가능"); } }} disabled={!contours.some((c) => c.nodes.length > 12)}><b>점 줄이기·매끄럽게</b><small>사진에서 따낸 글씨처럼 점이 아주 많을 때 · 모서리는 그대로</small></button>
            <button onClick={() => { if (contours.length) { commit([]); setSel(null); setPenOpen(null); } }}><b>모두 지우기</b><small>되돌리기(↶)로 되살릴 수 있음</small></button>
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>PC 단축키: V 선택 · P 펜 · A 점 추가 · R 사각형 · E 원 · H 이동 · Ctrl+Z 되돌리기 · Ctrl+S 저장 · 방향키 1칸(Shift 10칸) · Delete 지우기 · 마우스 휠 확대</p>
        </div>
      )}

      {notes.length > 0 && !panel && (
        <div className="ed-notes">
          {notes.slice(0, 3).map((n) => <div key={n}>{n.includes("없") || n.includes("주세요") ? "△ " : "✓ "}{n}</div>)}
          <button className="linkbtn" onClick={() => setNotes([])}>닫기</button>
        </div>
      )}

      <div className="ed-bottom">
        <div className="ed-tools" role="toolbar" aria-label="도구">
          {TOOLS.map(([k, ico, label]) => (
            <button key={k} className={tool === k ? "on" : ""} aria-pressed={tool === k} onClick={() => { setTool(k); if (k !== "pen") setPenOpen(null); }}>
              <span aria-hidden="true">{ico}</span><small>{label}</small>
            </button>
          ))}
        </div>
        <div className="ed-actions">
          <button onClick={undo} disabled={!past.current.length} aria-label="되돌리기">↶</button>
          <button onClick={redo} disabled={!future.current.length} aria-label="다시 하기">↷</button>
          <button onClick={() => setSnap(SNAPS[(SNAPS.indexOf(snap) + 1) % SNAPS.length])} className={snap ? "on" : ""}>격자 {snap ? snap : "끔"}</button>
          <button onClick={() => setPanel(panel === "ref" ? null : "ref")} className={ref.src && ref.show ? "on" : ""}>밑그림</button>
          <button onClick={() => setPanel(panel === "more" ? null : "more")}>더 보기</button>
        </div>
      </div>
    </div>
  );
}
