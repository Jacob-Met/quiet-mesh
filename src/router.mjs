// Deterministic router: only volunteers whose agreements allow the interruption get it.
import { URGENCIES, inWindow, fmtAt } from "./agreements.mjs";

const rank = (u) => URGENCIES.indexOf(u);

// Static checks do not depend on the clock; dynamic ones (window, capacity) do.
function staticChecks(v, req) {
  const a = v.agreement;
  const checks = [];
  checks.push(a.topics.includes(req.topic)
    ? { id: "topic", ok: true, why: `accepts ${req.topic}` }
    : { id: "topic", ok: false, why: `does not take ${req.topic} requests` });
  checks.push(rank(req.urgency) >= rank(a.minUrgency)
    ? { id: "urgency", ok: true, why: `${req.urgency} meets their ${a.minUrgency}+ threshold` }
    : { id: "urgency", ok: false, why: `${req.urgency} is below their ${a.minUrgency}+ threshold` });
  const matched = req.skills.filter((s) => v.skills.includes(s));
  checks.push(req.skills.length === 0 || matched.length
    ? { id: "skills", ok: true, why: matched.length ? `has ${matched.join(", ")}` : "no specific skill needed", matched: matched.length }
    : { id: "skills", ok: false, why: `lacks ${req.skills.join(", ")}`, matched: 0 });
  return checks;
}

function dynamicChecks(v, req, at, load) {
  const a = v.agreement;
  const open = inWindow(a.windows, at.day, at.minute);
  const breakthrough = !open && req.urgency === "critical" && a.breakthrough;
  const checks = [open
    ? { id: "window", ok: true, why: "inside an availability window" }
    : breakthrough
      ? { id: "window", ok: true, why: "outside windows, but allows critical breakthrough" }
      : { id: "window", ok: false, why: `outside their windows at ${fmtAt(at)}` }];
  const used = load[v.id] || 0;
  checks.push(used < a.maxPerDay
    ? { id: "capacity", ok: true, why: `${used}/${a.maxPerDay} interruptions used today` }
    : { id: "capacity", ok: false, why: `already used ${used}/${a.maxPerDay} interruptions today` });
  return checks;
}

// Earliest time (within a week) the volunteer would accept, given static checks pass.
export function nextAvailable(v, req, at, load) {
  for (let step = 0; step < 7 * 96; step++) {
    const t = at.day * 1440 + at.minute + step * 15;
    const day = Math.floor(t / 1440) % 7, minute = t % 1440;
    const sameDay = t < (at.day + 1) * 1440;
    const cap = sameDay ? load[v.id] || 0 : 0;
    if (inWindow(v.agreement.windows, day, minute) && cap < v.agreement.maxPerDay) return { day, minute };
  }
  return null;
}

export function route(req, volunteers, at, load = {}) {
  const decisions = volunteers.map((v) => {
    const st = staticChecks(v, req);
    const checks = st.every((c) => c.ok) ? [...st, ...dynamicChecks(v, req, at, load)] : st;
    const eligible = checks.length === 5 && checks.every((c) => c.ok);
    return { id: v.id, name: v.name, eligible, staticOk: st.every((c) => c.ok), checks,
      matched: st.find((c) => c.id === "skills").matched || 0, used: load[v.id] || 0 };
  });
  const eligible = decisions.filter((d) => d.eligible)
    .sort((a, b) => b.matched - a.matched || a.used - b.used || a.name.localeCompare(b.name));
  if (eligible.length) {
    const top = eligible[0];
    return { status: "routed", to: top.id, toName: top.name, decisions,
      because: `${top.name} agreed to ${req.topic} at ${req.urgency} urgency, is in a window, and has capacity`
        + (eligible.length > 1 ? `; chosen over ${eligible.length - 1} other eligible (best skill match, then lightest load)` : "") };
  }
  const waiting = decisions.filter((d) => d.staticOk).map((d) => {
    const v = volunteers.find((x) => x.id === d.id);
    return { id: d.id, name: d.name, next: nextAvailable(v, req, at, load) };
  }).filter((w) => w.next).sort((a, b) => (a.next.day * 1440 + a.next.minute + 10080 - (at.day * 1440 + at.minute)) % 10080
    - ((b.next.day * 1440 + b.next.minute + 10080 - (at.day * 1440 + at.minute)) % 10080));
  if (waiting.length) {
    return { status: "queued", queuedFor: waiting[0].id, queuedForName: waiting[0].name, releaseAt: waiting[0].next, decisions,
      because: `no volunteer can be interrupted at ${fmtAt(at)}; held for ${waiting[0].name}, whose next qualifying window opens ${fmtAt(waiting[0].next)}` };
  }
  return { status: "unroutable", decisions,
    because: `no volunteer's agreement covers ${req.topic} at ${req.urgency} urgency${req.skills.length ? ` with ${req.skills.join(", ")}` : ""}; kept for a coordinator` };
}
