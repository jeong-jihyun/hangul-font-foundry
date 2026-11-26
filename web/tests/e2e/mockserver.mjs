// 가짜 GitHub 를 HTTP 서버로 (앱 서버가 GITHUB_API_BASE 로 붙음). 시험 전용.
import http from "node:http";
import crypto from "node:crypto";
import { zipSync, strToU8 } from "fflate";
const H = (s) => crypto.createHash("sha1").update(s).digest("hex");
const trees = {}, commits = {}; let head = null; const msgs = [];
const snap = (f) => { const sha = H(JSON.stringify(Object.entries(f).sort())); trees[sha] = { ...f }; return sha; };
const cur = () => (head ? trees[commits[head].tree] : {});
const commit = (f, m) => { const t = snap(f); const sha = H(t + m + Math.random()); commits[sha] = { tree: t }; head = sha; msgs.push(m); };
http.createServer(async (req, res) => {
  let raw = ""; for await (const c of req) raw += c; const body = raw ? JSON.parse(raw) : null;
  const u = new URL(req.url, "http://x"); const p = decodeURIComponent(u.pathname.replace("/repos/jeong-jihyun/hangul-font-glyphs", "")); const m = req.method;
  const J = (o, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (p === "/_log") return J({ msgs, files: Object.keys(cur()) });
  if (p === "/git/ref/heads/main") return head ? J({ object: { sha: head } }) : J({ message: "empty" }, 409);
  if (p.startsWith("/contents/")) {
    const path = p.slice(10).replace(/\/$/, "");
    if (m === "PUT") { commit({ ...cur(), [path]: Buffer.from(body.content, "base64").toString() }, body.message); return J({}, 201); }
    const f = cur(); if (path in f) return J({ type: "file", content: Buffer.from(f[path]).toString("base64"), sha: H(f[path]) });
    return J({ message: "Not Found" }, 404);
  }
  if (p.startsWith("/git/commits/")) return J({ tree: { sha: commits[p.slice(13)].tree } });
  if (p === "/git/trees" && m === "POST") { const f = { ...trees[body.base_tree] }; for (const e of body.tree) { if (e.sha === null) delete f[e.path]; else f[e.path] = e.content; } return J({ sha: snap(f) }, 201); }
  if (p.startsWith("/git/trees/")) return J({ tree: Object.keys(trees[p.slice(11)]).map((path) => ({ path, type: "blob" })) });
  if (p === "/git/commits" && m === "POST") { const sha = H(body.tree + body.message + Math.random()); commits[sha] = { tree: body.tree }; msgs.push(body.message); return J({ sha }, 201); }
  if (p === "/git/refs/heads/main" && m === "PATCH") { head = body.sha; return J({}); }
  if (p === "/zipball/main") { const z = {}; for (const [k, v] of Object.entries(cur())) z["repo-abc/" + k] = strToU8(v); res.writeHead(200, { "content-type": "application/zip" }); return res.end(Buffer.from(zipSync(z))); }
  J({ message: "mock: " + m + " " + p }, 500);
}).listen(9100, () => console.log("mock github on 9100"));
