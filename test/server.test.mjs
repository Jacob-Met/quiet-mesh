import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.mjs";
import { Mesh } from "../src/mesh.mjs";

test("HTTP: route, queue, tick, edit agreement", async () => {
  const classifier = async (t) => ({ topic: "legal", urgency: "normal", skills: ["gdpr"], summary: t, rationale: "", notes: [], source: "nemotron", model: "m", message: null });
  const srv = createApp({ mesh: new Mesh(), classifier }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (p, b, m = "POST") => fetch(base + p, { method: m, headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json() }));
  try {
    assert.equal((await fetch(base + "/")).status, 200);
    assert.equal((await post("/api/route", { text: "", at: "Mon 11:00" })).s, 400);
    const q = await post("/api/route", { text: "GDPR question", at: "Mon 11:00" });
    assert.equal(q.j.entry.status, "queued");
    const t = await post("/api/tick", { at: "Tue 10:30" });
    assert.deepEqual(t.j.released, [q.j.entry.id]);
    const bad = await post("/api/volunteers/luis", { windows: "nonsense" }, "PUT");
    assert.equal(bad.s, 400);
    const ok = await post("/api/volunteers/luis", { windows: "Mon 09:00-10:00", minUrgency: "high" }, "PUT");
    assert.equal(ok.j.volunteers.find((v) => v.id === "luis").agreement.windowsText, "Mon 09:00-10:00");
  } finally { srv.close(); }
});
