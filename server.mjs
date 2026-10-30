import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Mesh } from "./src/mesh.mjs";
import { classify, MODEL } from "./src/classify.mjs";
import { parseAt, URGENCIES, DAYS } from "./src/agreements.mjs";
import { TOPICS, SKILLS } from "./src/seed.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

export function createApp({ mesh = new Mesh(), classifier = classify } = {}) {
  const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const body = (req) => new Promise((ok, no) => {
    let s = ""; req.on("data", (c) => { s += c; if (s.length > 20000) { no(new Error("body too large")); req.destroy(); } });
    req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch { no(new Error("invalid JSON")); } });
  });
  return createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/api/state" && req.method === "GET") {
        return send(res, 200, { ...mesh.view(), topics: TOPICS, skills: SKILLS, urgencies: URGENCIES, days: DAYS,
          model: { name: MODEL, live: !!process.env.NEBIUS_API_KEY } });
      }
      if (url.pathname === "/api/route" && req.method === "POST") {
        const b = await body(req);
        const text = String(b.text || "").trim();
        if (!text || text.length > 2000) return send(res, 400, { error: "Write the request first (up to 2000 characters)." });
        const at = parseAt(b.at);
        const cls = await classifier(text);
        const entry = mesh.submit(text, cls, at);
        return send(res, 200, { entry, ...mesh.view() });
      }
      if (url.pathname === "/api/tick" && req.method === "POST") {
        const b = await body(req);
        const released = mesh.tick(parseAt(b.at));
        return send(res, 200, { released: released.map((r) => r.id), ...mesh.view() });
      }
      const m = /^\/api\/volunteers\/([a-z0-9-]+)$/.exec(url.pathname);
      if (m && req.method === "PUT") { mesh.update(m[1], await body(req)); return send(res, 200, mesh.view()); }
      if (url.pathname === "/api/reset" && req.method === "POST") { mesh.reset(); return send(res, 200, mesh.view()); }
      if (url.pathname === "/api/health") return send(res, 200, { ok: true });
      if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
      const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
      const data = await readFile(join(root, rel));
      res.writeHead(200, { "content-type": types[extname(rel)] || "application/octet-stream" });
      res.end(data);
    } catch (e) {
      if (e.code === "ENOENT" || e.code === "EISDIR") return send(res, 404, { error: "not found" });
      send(res, e.code === 404 ? 404 : 400, { error: e.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4423);
  createApp().listen(port, () => console.log(`Quiet Mesh on http://localhost:${port} (${process.env.NEBIUS_API_KEY ? "Nemotron live" : "no NEBIUS_API_KEY: keyword fallback"})`));
}
