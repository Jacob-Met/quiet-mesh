const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const state = { data: null, open: null, last: null };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n) => String(n).padStart(2, "0");
const fmt = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

const dayEl = $("#day"), timeEl = $("#time");
dayEl.innerHTML = DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join("");
const now = new Date(); dayEl.value = (now.getDay() + 6) % 7; timeEl.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
const at = () => `${DAYS[dayEl.value]} ${timeEl.value || "00:00"}`;
const curMin = () => { const [h, m] = (timeEl.value || "00:00").split(":").map(Number); return h * 60 + m; };

async function api(path, body, method = body ? "POST" : "GET") {
  const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "request failed");
  return j;
}

function bands(v, day) {
  const out = [], prev = (day + 6) % 7;
  for (const w of v.agreement.windows) {
    if (w.start < w.end) { if (w.days.includes(day)) out.push([w.start, w.end]); }
    else { if (w.days.includes(day)) out.push([w.start, 1440]); if (w.days.includes(prev)) out.push([0, w.end]); }
  }
  return out;
}
const isOpen = (v, day, m) => bands(v, day).some(([a, b]) => m >= a && m < b);

function renderBoard() {
  const d = state.data, day = +dayEl.value, m = curMin();
  const hl = state.last?.decisions || [];
  $("#rows").innerHTML = d.volunteers.map((v) => {
    const open = isOpen(v, day, m), a = v.agreement, dec = hl.find((x) => x.id === v.id);
    const verdict = dec ? (dec.eligible ? `<span class="ok" style="color:var(--ok)">eligible</span>` : `<span style="color:var(--bad)">${esc(dec.checks.find((c) => !c.ok)?.id)} blocks</span>`) : "";
    return `<div class="row ${state.open === v.id ? "edit" : ""}" data-id="${v.id}">
      <button class="rowbtn ${state.last?.to === v.id ? "sel" : ""}" aria-expanded="${state.open === v.id}" aria-label="${esc(v.name)}, ${open ? "available now" : "quiet now"}. Edit agreement">
        <span class="who"><span class="dot ${open ? "open" : ""}"></span><span><b>${esc(v.name)}</b><small>${esc(a.topics.join(", "))} · ${esc(a.minUrgency)}+ · ${a.maxPerDay}/day</small><small class="verdict">${verdict}</small></span></span>
        <span class="strip">${bands(v, day).map(([s, e]) => `<span class="band" style="left:${s / 14.4}%;width:${(e - s) / 14.4}%"></span>`).join("")}${a.breakthrough ? '<span class="bt"></span>' : ""}<span class="head" style="left:${m / 14.4}%"></span></span>
      </button>
      <div class="editor">
        <div><label>Topics I accept</label><div class="topics">${d.topics.map((t) => `<label><input type="checkbox" data-topic="${t}" ${a.topics.includes(t) ? "checked" : ""}> ${t}</label>`).join("")}</div></div>
        <div><label for="w-${v.id}">Windows (e.g. Mon-Fri 09:00-17:00; Sat 10:00-12:00)</label><input type="text" id="w-${v.id}" data-f="windows" value="${esc(a.windowsText)}"></div>
        <div><label for="u-${v.id}">Interrupt me at</label><select id="u-${v.id}" data-f="minUrgency">${d.urgencies.map((u) => `<option ${u === a.minUrgency ? "selected" : ""}>${u}</option>`).join("")}</select> or above<br><br>
          <label for="c-${v.id}">Max interruptions per day</label><input type="number" id="c-${v.id}" data-f="maxPerDay" min="0" max="50" value="${a.maxPerDay}" style="width:80px"></div>
        <div><label><input type="checkbox" data-f="breakthrough" ${a.breakthrough ? "checked" : ""}> Allow critical requests outside my windows</label><br><button class="ghost save" type="button">Save agreement</button></div>
        <div class="msg" role="alert"></div>
      </div></div>`;
  }).join("");
}

function renderLists() {
  const d = state.data;
  $("#qn").textContent = d.queue.length || "";
  $("#ln").textContent = d.log.length || "";
  $("#queue").innerHTML = d.queue.length ? d.queue.map((q) => `<li><span class="t">#${q.id} · ${esc(q.atLabel)} · ${esc(q.classification.topic)}/${esc(q.classification.urgency)}</span><br>${esc(q.text)}<br><span class="empty">${esc(q.because)}</span></li>`).join("") : `<li class="empty">Nothing waiting. Requests that arrive in a quiet hour appear here.</li>`;
  $("#log").innerHTML = d.log.length ? d.log.map((q) => `<li><span class="t">#${q.id} · ${esc(q.deliveredAt || q.atLabel)} → ${esc(q.toName)}</span><br>${esc(q.text)}</li>`).join("") : `<li class="empty">No requests delivered yet.</li>`;
  const m = d.model;
  $("#model").innerHTML = m.live ? `<b>●</b> Nemotron live · ${esc(m.name.split("/")[1])}` : `○ no NEBIUS_API_KEY · keyword fallback`;
}

function renderResult(e) {
  if (!e) { $("#result").innerHTML = ""; return; }
  const c = e.classification;
  const head = e.status === "routed" ? `Delivered to ${esc(e.toName)}` : e.status === "queued" ? `Held for ${esc(e.queuedFor)}` : "No one has agreed to this";
  const srcTxt = c.source === "nemotron" ? `Classified by ${esc(c.model)} on Nebius Token Factory` : esc(c.message || "Keyword fallback");
  $("#result").innerHTML = `<div class="res ${e.status}"><p class="big">${head}</p>
    <p class="src ${c.source === "nemotron" ? "nem" : ""}">${srcTxt}</p>
    <div class="cls"><span class="tag">${esc(c.topic)}</span><span class="tag u-${esc(c.urgency)}">${esc(c.urgency)}</span>${c.skills.map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</div>
    ${c.rationale ? `<p class="src">“${esc(c.rationale)}”</p>` : ""}
    ${c.notes?.length ? `<p class="notes">Checked by the app: ${esc(c.notes.join("; "))}</p>` : ""}
    <p>${esc(e.because)}.${e.releaseAt ? ` Delivery when the clock reaches ${esc(e.releaseAt)}.` : ""}</p>
    <ul class="why">${e.decisions.map((x) => { const bad = x.checks.find((k) => !k.ok); return `<li><span class="nm">${esc(x.name.split(" ")[0])}</span><span class="${x.eligible ? "ok" : "no"}">${x.eligible ? "✓ " + esc(x.checks.find((k) => k.id === "window").why) : "✕ " + esc(bad.why)}</span></li>`; }).join("")}</ul></div>`;
}

function render() { renderBoard(); renderLists(); }

async function load() { state.data = await api("/api/state"); render(); }

$("#form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const text = $("#text").value.trim(); if (!text) { $("#text").focus(); return; }
  const go = $("#go"); go.disabled = true; go.textContent = "Nemotron is reading the request…";
  try {
    const r = await api("/api/route", { text, at: at() });
    state.data = r; state.last = r.entry; renderResult(r.entry); render(); $("#text").value = "";
  } catch (e) { $("#result").innerHTML = `<p class="notes" role="alert">${esc(e.message)}</p>`; }
  go.disabled = false; go.textContent = "Route request";
});
document.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => { $("#text").value = b.dataset.ex; $("#text").focus(); }));

async function clockMoved() {
  try { const r = await api("/api/tick", { at: at() }); state.data = r; if (r.released.length) { const e = r.queue.length >= 0 && r.log.find((x) => x.id === r.released[0]); state.last = e; renderResult(e); } } catch {}
  render();
}
dayEl.addEventListener("change", clockMoved); timeEl.addEventListener("change", clockMoved);
document.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
  let t = (+dayEl.value) * 1440 + curMin() + +b.dataset.step; t %= 10080;
  dayEl.value = Math.floor(t / 1440); timeEl.value = fmt(t % 1440); clockMoved();
}));

$("#rows").addEventListener("click", async (ev) => {
  const row = ev.target.closest(".row"); if (!row) return;
  const id = row.dataset.id;
  if (ev.target.closest(".rowbtn")) { state.open = state.open === id ? null : id; renderBoard(); return; }
  if (ev.target.classList.contains("save")) {
    const q = (s) => row.querySelector(s);
    const body = { topics: [...row.querySelectorAll("[data-topic]:checked")].map((x) => x.dataset.topic), windows: q('[data-f="windows"]').value,
      minUrgency: q('[data-f="minUrgency"]').value, maxPerDay: q('[data-f="maxPerDay"]').value, breakthrough: q('[data-f="breakthrough"]').checked };
    try { state.data = { ...state.data, ...(await api(`/api/volunteers/${id}`, body, "PUT")) }; await clockMoved(); }
    catch (e) { q(".msg").textContent = e.message; }
  }
});
load();
