# Quiet Mesh

Route help requests to volunteers **only through the interruption agreements they wrote themselves**.

Volunteers declare when they can be interrupted (weekly windows), for which topics, from what urgency up, how many
times a day, and whether a true emergency may break through outside their windows. A request arrives as free text.
NVIDIA Nemotron reads it and proposes a topic, an urgency and the skills needed. A deterministic router then
checks every volunteer's agreement, picks someone only if all checks pass, shows exactly why each person was or
was not chosen, and otherwise queues the request until the next qualifying window opens.

Audience: mutual-aid groups, open-source maintainers, community IT and crisis-adjacent volunteer networks, where
helpers give attention generously and need it protected.

## Quick start

Requires Node 22+. No npm dependencies.

```sh
export NEBIUS_API_KEY=...        # Nebius Token Factory key
node server.mjs                  # http://localhost:4423  (PORT=... to change)
node --test test/                # 12 tests, no network needed
```

Open http://localhost:4423. Pick a mesh time with the clock at the top (Day/Time, +1h/+4h/+1d). Click an example
chip, press **Route request**. Click any volunteer row to edit their agreement. Moving the clock re-checks the
queue and releases held requests whose window has opened.

Without `NEBIUS_API_KEY` the app still runs; classification falls back to simple keyword rules and the UI says so.

## How it uses NVIDIA Nemotron on Nebius Token Factory

- **Endpoint:** `https://api.tokenfactory.nebius.com/v1/chat/completions` (OpenAI-compatible), called server-side
  from `src/classify.mjs`. The browser never sees the key. Key comes from `NEBIUS_API_KEY`.
- **Model:** `nvidia/nemotron-3-super-120b-a12b` by default (`QUIET_MESH_MODEL` to change). A 120B-class model with
  12B active parameters follows a strict JSON schema and judges urgency from tone and context reliably, while staying
  fast enough for a request-by-request triage step. `max_tokens` is 3000 because it is a reasoning model.
- **What it does:** turns free text into `{topic, urgency, skills, summary, rationale}`, restricted to the mesh's
  vocabulary.
- **How the output is checked:** the model only proposes. `validate()` rejects unknown topics, defaults invalid
  urgency, drops skills outside the vocabulary, and caps a `critical` claim to `high` when the text has no
  emergency cue. Routing itself (`src/router.mjs`) never calls a model: topic, urgency threshold, skills, window
  and daily capacity are all plain checks over the volunteer's written agreement. A bad or failed model reply
  falls back to keyword rules and is labelled as such.

## Layout

`src/agreements.mjs` window parsing and clock logic · `src/router.mjs` routing and queue release times ·
`src/mesh.mjs` state · `src/classify.mjs` Nemotron adapter · `server.mjs` HTTP · `public/` UI · `test/`.

## Honest limits

- State is in memory (resets on restart); no accounts or real notification delivery. "Delivered" means routed.
- The clock is a simulated mesh clock so the schedule can be demonstrated; it starts at your local time.
- Times are one shared timezone. Daily capacity is counted per weekday of the mesh clock.
- Classification quality depends on the model; the checks catch malformed or unsupported output, not every wrong guess.
- Seed volunteers are fictional.

MIT licensed.
