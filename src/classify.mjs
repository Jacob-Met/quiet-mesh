// Free text -> {topic, urgency, skills}. Nemotron on Nebius Token Factory proposes;
// validate() is the app's own check, and the router never sees unvalidated output.
import { URGENCIES } from "./agreements.mjs";
import { TOPICS, SKILLS } from "./seed.mjs";

export const BASE_URL = process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1";
export const MODEL = process.env.QUIET_MESH_MODEL || "nvidia/nemotron-3-super-120b-a12b";

const CRITICAL_CUES = /\b(down|outage|breach(ed)?|leak(ed|ing)?|ransom\w*|locked out|data loss|lost data|emergency|crisis|unsafe|suicid\w*|self[- ]harm|in production|prod\b|right now|immediately|deadline (is )?(tonight|today))\b/i;

export function extractJson(s) {
  if (!s) return null;
  const t = String(s).replace(/```(?:json)?/g, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

// Returns a clean classification plus notes about anything the app corrected.
export function validate(raw, text = "") {
  const notes = [];
  if (!raw || typeof raw !== "object") return null;
  let topic = String(raw.topic || "").toLowerCase().trim();
  if (!TOPICS.includes(topic)) { notes.push(`topic "${raw.topic}" is not in the mesh vocabulary`); return null; }
  let urgency = String(raw.urgency || "").toLowerCase().trim();
  if (!URGENCIES.includes(urgency)) { notes.push(`urgency "${raw.urgency}" invalid; set to normal`); urgency = "normal"; }
  const skills = [...new Set((Array.isArray(raw.skills) ? raw.skills : []).map((s) => String(s).toLowerCase().trim()))];
  const known = skills.filter((s) => SKILLS.includes(s));
  const dropped = skills.filter((s) => !SKILLS.includes(s));
  if (dropped.length) notes.push(`dropped unknown skills: ${dropped.join(", ")}`);
  if (urgency === "critical" && text && !CRITICAL_CUES.test(text)) {
    urgency = "high";
    notes.push("model said critical but the text has no emergency cue; capped at high");
  }
  return { topic, urgency, skills: known, summary: String(raw.summary || "").slice(0, 200), rationale: String(raw.rationale || "").slice(0, 300), notes };
}

const RULES = [
  ["security", /\b(breach|phish\w*|password|malware|ransom\w*|2fa|hacked|leak\w*|vulnerab\w*)\b/i, ["incident-response"]],
  ["infrastructure", /\b(server|cluster|kubernetes|k8s|deploy\w*|outage|dns|network|vpn|down)\b/i, ["kubernetes", "networking"]],
  ["data", /\b(database|postgres|sql|backup|migration|dataset|query)\b/i, ["postgres"]],
  ["legal", /\b(contract|gdpr|privacy|lawyer|legal|license|terms)\b/i, ["contracts", "gdpr"]],
  ["wellbeing", /\b(burn\w*|anxious|anxiety|stress\w*|crisis|overwhelmed|suicid\w*|lonely|support)\b/i, ["counseling"]],
  ["design", /\b(design|ui|ux|accessib\w*|screen reader|contrast|layout|react)\b/i, ["accessibility"]],
  ["writing", /\b(write|copy|newsletter|announcement|translate|draft|wording)\b/i, ["copywriting"]],
];

export function heuristic(text) {
  const hit = RULES.find(([, re]) => re.test(text)) || ["writing", null, []];
  const urgency = CRITICAL_CUES.test(text) ? "critical" : /\b(asap|urgent|soon|today|tonight|blocked)\b/i.test(text) ? "high" : /\b(whenever|no rush|sometime|eventually)\b/i.test(text) ? "low" : "normal";
  const skills = [...hit[2]];
  if (/\bspanish|espa[ñn]ol\b/i.test(text)) skills.push("spanish");
  return { topic: hit[0], urgency, skills, summary: text.slice(0, 120), rationale: "keyword rules (no model call)", notes: [] };
}

const SYSTEM = `You triage help requests for a volunteer mesh. Reply with ONE JSON object and nothing else:
{"topic": one of ${JSON.stringify(TOPICS)},
 "urgency": one of ["low","normal","high","critical"],
 "skills": subset of ${JSON.stringify(SKILLS)} that the helper needs (may be empty),
 "summary": under 20 words,
 "rationale": one sentence on why you chose this topic and urgency}
Urgency guide: low = whenever; normal = this week; high = needed today or someone is blocked; critical = harm, outage or data loss happening now.`;

export async function classify(text, { key = process.env.NEBIUS_API_KEY, fetchImpl = fetch, model = MODEL, timeoutMs = 90000 } = {}) {
  if (!key) {
    return { ...heuristic(text), source: "heuristic", model: null, message: "NEBIUS_API_KEY is not set, so keyword rules classified this. Set the key to use Nemotron." };
  }
  try {
    const res = await fetchImpl(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: 3000, temperature: 0.1, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Token Factory returned HTTP ${res.status}`);
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    const clean = validate(extractJson(content), text);
    if (!clean) throw new Error("Nemotron reply failed validation");
    return { ...clean, source: "nemotron", model: body.model || model, message: null };
  } catch (e) {
    return { ...heuristic(text), source: "heuristic", model: null, message: `Nemotron call failed (${e.message}); keyword rules used instead.` };
  }
}
