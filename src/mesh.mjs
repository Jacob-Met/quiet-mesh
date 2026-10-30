// In-memory mesh state: volunteers, held queue, delivery log, per-day load.
import { seedVolunteers } from "./seed.mjs";
import { route } from "./router.mjs";
import { parseWindows, formatWindows, URGENCIES, fmtAt } from "./agreements.mjs";
import { TOPICS } from "./seed.mjs";

export class Mesh {
  constructor() { this.reset(); }
  reset() { this.volunteers = seedVolunteers(); this.queue = []; this.log = []; this.load = {}; this.seq = 0; }
  loadFor(day) { return this.load[day] || {}; }
  bump(day, id) { (this.load[day] ||= {})[id] = (this.load[day][id] || 0) + 1; }

  submit(text, cls, at) {
    const req = { topic: cls.topic, urgency: cls.urgency, skills: cls.skills };
    const r = route(req, this.volunteers, at, this.loadFor(at.day));
    const entry = { id: ++this.seq, text, classification: cls, at, atLabel: fmtAt(at), status: r.status, because: r.because, decisions: r.decisions,
      to: r.to || null, toName: r.toName || null, queuedFor: r.queuedForName || null, releaseAt: r.releaseAt ? fmtAt(r.releaseAt) : null };
    if (r.status === "routed") { this.bump(at.day, r.to); this.log.unshift(entry); }
    else this.queue.push(entry);
    return entry;
  }

  // Clock moved: re-route anything held. Same deterministic router, new time.
  tick(at) {
    const released = [];
    for (const q of [...this.queue]) {
      const r = route({ topic: q.classification.topic, urgency: q.classification.urgency, skills: q.classification.skills }, this.volunteers, at, this.loadFor(at.day));
      if (r.status === "routed") {
        this.bump(at.day, r.to);
        this.queue = this.queue.filter((x) => x !== q);
        Object.assign(q, { status: "routed", to: r.to, toName: r.toName, decisions: r.decisions, deliveredAt: fmtAt(at),
          because: `released from queue at ${fmtAt(at)}: ${r.because}` });
        this.log.unshift(q);
        released.push(q);
      }
    }
    return released;
  }

  update(id, body) {
    const v = this.volunteers.find((x) => x.id === id);
    if (!v) throw Object.assign(new Error("no such volunteer"), { code: 404 });
    const a = { ...v.agreement };
    if (body.topics !== undefined) {
      if (!Array.isArray(body.topics) || body.topics.some((t) => !TOPICS.includes(t))) throw new Error("unknown topic");
      a.topics = body.topics;
    }
    if (body.minUrgency !== undefined) { if (!URGENCIES.includes(body.minUrgency)) throw new Error("bad urgency"); a.minUrgency = body.minUrgency; }
    if (body.maxPerDay !== undefined) { const n = Number(body.maxPerDay); if (!Number.isInteger(n) || n < 0 || n > 50) throw new Error("maxPerDay must be 0-50"); a.maxPerDay = n; }
    if (body.breakthrough !== undefined) a.breakthrough = !!body.breakthrough;
    if (body.windows !== undefined) a.windows = parseWindows(body.windows);
    v.agreement = a;
    return v;
  }

  view() {
    return {
      volunteers: this.volunteers.map((v) => ({ ...v, agreement: { ...v.agreement, windowsText: formatWindows(v.agreement.windows) } })),
      queue: this.queue, log: this.log.slice(0, 30), load: this.load,
    };
  }
}
