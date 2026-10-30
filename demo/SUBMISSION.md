# Devpost answers (Quiet Mesh)

**Track:** Best apps and agents.

**New or existing before Aug 26 2026:** New. The repository was created during the hackathon (first commit dated 2026-10-30).

**Models used and why that size:** nvidia/nemotron-3-super-120b-a12b on Nebius Token Factory. It follows a strict JSON schema and judges urgency from context; only 12B parameters are active, so a triage call stays practical.

**Nemotron output quality (1-10):** Not rated. The builder session had no outbound network, so no live Nemotron output was observed; the adapter is tested only against a mocked response. Rate this after a live run.

**Approach:** Prompting only: a system prompt with the closed vocabulary and a JSON reply format, with app-side validation of the result.

**Comparison to other models:** None run. No comparison was made.

**Most valuable Nebius capability:** Token Factory's OpenAI-compatible API, which let a plain `fetch` call reach Nemotron with one key and no SDK.

**Recommend score (1-10):** Leave for the author to fill in; not measured here.

**Experience score (1-10):** Leave for the author to fill in; the build session could not reach the API.

**Improvements wanted:** Not evaluated live; would want a per-request JSON-schema mode so validation rarely has to correct output.

**What I hope to see next from Nemotron:** Faster reasoning-model responses with a switch to skip long reasoning for simple classification.

**AI tools used while building:** Claude Code.

## About the project

**Inspiration.** Volunteers give attention freely, and unmanaged requests burn them out. People should be interrupted only on terms they chose.

**What it does.** Volunteers write interruption agreements: weekly windows, accepted topics, minimum urgency, daily cap, and whether a true emergency may break through. A free-text request is classified by Nemotron. A deterministic router routes it only to volunteers whose agreements allow it, explains every yes and no, and queues it until a window opens.

**How it's built.** Node 22, no runtime dependencies. `src/router.mjs` holds all routing logic; `src/classify.mjs` calls Nemotron on Nebius Token Factory and validates the reply. Plain HTML/CSS/JS front end. 12 tests, none needing network.

**Challenges.** Keeping the model out of the decision: it proposes labels, the app checks them. Windows that wrap midnight and queue release times.

**What's next.** Real notification channels, persistence, per-volunteer timezones, acknowledgement and re-routing on no response.

## Built with
nodejs, javascript, nvidia-nemotron, nebius-token-factory, html, css
