import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWindows, formatWindows, inWindow, parseAt } from "../src/agreements.mjs";
import { route } from "../src/router.mjs";
import { seedVolunteers } from "../src/seed.mjs";
import { Mesh } from "../src/mesh.mjs";
import { validate, extractJson, classify, heuristic } from "../src/classify.mjs";

const vols = seedVolunteers();
const R = (topic, urgency, skills = [], at = "Tue 10:00", load = {}) => route({ topic, urgency, skills }, vols, parseAt(at), load);

test("windows parse, format and wrap midnight", () => {
  const w = parseWindows("Mon-Fri 09:00-17:00; Sat 10:00-12:00");
  assert.equal(formatWindows(w), "Mon-Fri 09:00-17:00; Sat 10:00-12:00");
  assert.ok(inWindow(w, 0, 9 * 60) && !inWindow(w, 0, 17 * 60) && !inWindow(w, 6, 600));
  const night = parseWindows("Mon-Sun 22:00-06:00");
  assert.ok(inWindow(night, 2, 23 * 60) && inWindow(night, 2, 5 * 60) && !inWindow(night, 2, 12 * 60));
  assert.throws(() => parseWindows("Funday 1-2"));
});
test("routes to the volunteer whose agreement allows it", () => {
  const r = R("infrastructure", "normal", ["kubernetes"]);
  assert.equal(r.status, "routed"); assert.equal(r.to, "ana");
});
test("urgency threshold blocks low-urgency requests", () => {
  const r = R("security", "low", [], "Mon 19:00");
  assert.equal(r.decisions.find((d) => d.id === "dev").checks.find((c) => c.id === "urgency").ok, false);
  assert.notEqual(r.to, "dev");
});
test("outside windows the request is queued for the next opening", () => {
  const r = R("legal", "normal", ["gdpr"], "Mon 11:00"); // Luis only Tue/Thu
  assert.equal(r.status, "queued"); assert.equal(r.queuedFor, "luis");
  assert.deepEqual(r.releaseAt, { day: 1, minute: 600 });
});
test("critical breakthrough only for volunteers who agreed", () => {
  const night = R("wellbeing", "critical", ["counseling"], "Wed 15:00");
  assert.equal(night.to, "sam");
  const legal = R("legal", "critical", [], "Mon 11:00");
  assert.equal(legal.status, "queued"); // Luis never agreed to breakthrough
});
test("capacity limit is enforced", () => {
  const r = R("wellbeing", "normal", [], "Mon 08:30", { sam: 2 });
  assert.equal(r.status, "queued");
});
test("nobody covers it -> unroutable", () => {
  assert.equal(R("legal", "normal", ["kubernetes"]).status, "unroutable");
});
test("queue releases when the clock reaches the window", () => {
  const m = new Mesh();
  const e = m.submit("contract question", { topic: "legal", urgency: "normal", skills: ["contracts"] }, parseAt("Mon 11:00"));
  assert.equal(e.status, "queued");
  assert.equal(m.tick(parseAt("Mon 12:00")).length, 0);
  const rel = m.tick(parseAt("Tue 10:00"));
  assert.equal(rel.length, 1); assert.equal(rel[0].to, "luis"); assert.equal(m.queue.length, 0);
});
test("validate rejects bad topics, drops unknown skills, caps unsupported critical", () => {
  assert.equal(validate({ topic: "cooking", urgency: "low" }), null);
  const v = validate({ topic: "data", urgency: "critical", skills: ["postgres", "witchcraft"] }, "please look at my query when you can");
  assert.deepEqual(v.skills, ["postgres"]); assert.equal(v.urgency, "high"); assert.equal(v.notes.length, 2);
  assert.equal(validate({ topic: "data", urgency: "critical", skills: [] }, "database is down in production").urgency, "critical");
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
});
test("adapter calls Token Factory with Nemotron (mocked, no network)", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ model: "nvidia/x", choices: [{ message: { content: '{"topic":"security","urgency":"critical","skills":["incident-response"],"summary":"s","rationale":"r"}' } }] }) }; };
  const c = await classify("our server was breached right now", { key: "k", fetchImpl, model: "nvidia/nemotron-3-super-120b-a12b" });
  assert.equal(c.source, "nemotron"); assert.equal(c.topic, "security");
  assert.match(seen.url, /tokenfactory\.nebius\.com\/v1\/chat\/completions$/);
  assert.equal(JSON.parse(seen.init.body).model, "nvidia/nemotron-3-super-120b-a12b");
  assert.equal(seen.init.headers.authorization, "Bearer k");
});
test("adapter falls back gracefully with no key or bad reply", async () => {
  const none = await classify("backup of postgres failed", { key: "" });
  assert.equal(none.source, "heuristic"); assert.match(none.message, /NEBIUS_API_KEY/); assert.equal(none.topic, "data");
  const bad = await classify("hello", { key: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "nope" } }] }) }) });
  assert.equal(bad.source, "heuristic"); assert.match(bad.message, /failed/);
  assert.equal(heuristic("site is down in production").urgency, "critical");
});
