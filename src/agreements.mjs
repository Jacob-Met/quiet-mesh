// Interruption agreements: weekly availability windows, parsed from plain text.
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const URGENCIES = ["low", "normal", "high", "critical"];

const hm = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`bad time "${s}" (use HH:MM)`);
  const v = +m[1] * 60 + +m[2];
  if (+m[2] > 59 || v > 1440) throw new Error(`bad time "${s}"`);
  return v;
};
export const fmtTime = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function parseDays(spec) {
  const out = new Set();
  for (const part of spec.split(",")) {
    const [a, b] = part.trim().split("-").map((x) => x.trim());
    const i = DAYS.findIndex((d) => d.toLowerCase() === a.toLowerCase());
    if (i < 0) throw new Error(`bad day "${a}"`);
    if (b === undefined) { out.add(i); continue; }
    const j = DAYS.findIndex((d) => d.toLowerCase() === b.toLowerCase());
    if (j < 0) throw new Error(`bad day "${b}"`);
    for (let k = i; ; k = (k + 1) % 7) { out.add(k); if (k === j) break; }
  }
  return [...out].sort((x, y) => x - y);
}

// "Mon-Fri 09:00-17:00; Sat 10:00-12:00" -> [{days,start,end}]
export function parseWindows(text) {
  const wins = [];
  for (const seg of String(text || "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const m = /^([A-Za-z,\- ]+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(seg);
    if (!m) throw new Error(`cannot read window "${seg}" (example: Mon-Fri 09:00-17:00)`);
    const start = hm(m[2]), end = hm(m[3]);
    if (start === end) throw new Error(`empty window "${seg}"`);
    wins.push({ days: parseDays(m[1]), start, end });
  }
  return wins;
}

export function formatWindows(wins) {
  return wins.map((w) => {
    const d = w.days;
    let label;
    if (d.length === 7) label = "Mon-Sun";
    else if (d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1)) label = `${DAYS[d[0]]}-${DAYS[d[d.length - 1]]}`;
    else label = d.map((x) => DAYS[x]).join(",");
    return `${label} ${fmtTime(w.start)}-${w.end === 1440 ? "24:00" : fmtTime(w.end)}`;
  }).join("; ");
}

// Is the minute-of-day `m` on day `day` (0=Mon) inside any window? Windows may wrap past midnight.
export function inWindow(wins, day, m) {
  const prev = (day + 6) % 7;
  return wins.some((w) => (w.start < w.end
    ? w.days.includes(day) && m >= w.start && m < w.end
    : (w.days.includes(day) && m >= w.start) || (w.days.includes(prev) && m < w.end)));
}

export function parseAt(s) {
  const m = /^([A-Za-z]{3})\s+(\d{1,2}:\d{2})$/.exec(String(s || "").trim());
  if (!m) throw new Error('time must look like "Tue 14:30"');
  const day = DAYS.findIndex((d) => d.toLowerCase() === m[1].toLowerCase());
  if (day < 0) throw new Error("bad day");
  const minute = hm(m[2]);
  if (minute >= 1440) throw new Error("bad time");
  return { day, minute };
}
export const fmtAt = (at) => `${DAYS[at.day]} ${fmtTime(at.minute)}`;
