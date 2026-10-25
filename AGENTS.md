# AGENTS.md

## What we are building tonight

**Crisp — proactive AI assistant for healthcare** (SBUHacks 2026, due 2026-10-25 21:00).
Product vision: [.plans/content/CRISP-VISION.md](.plans/content/CRISP-VISION.md). Crisp is envisioned as an assistant
with a personality across hospital/clinic systems, helping patients, nurses and doctors. The current patient-journey
demo is one example of that vision. Read the vision before writing product descriptions or film scripts. Demo spec:
[.plans/waiting-room-demo-rescue-spec.md](.plans/waiting-room-demo-rescue-spec.md). Your task packet lives in
[.plans/codex/](.plans/codex/README.md) — read the spec once, then only your packet.

New app: `apps/demo/` (Vite + React + TypeScript client, plain `node:http` server). Everything else in this repo is
history: read it for algorithms, never edit it, never import from it (copy what you need into `apps/demo`).

## Priorities (in order)

1. **It runs end to end.** A working ugly feature beats a perfect missing one. Ship the simplest thing that works.
2. **Honest data.** Show real readings, "measuring…", or "low signal" — never a made-up number. Label REPLAY.
   Never call output a diagnosis or triage; it is "may need a check".
3. Polish.

## Simplicity rules (important — the previous build failed from over-engineering)

- No leases, epochs, grants, ledgers, clock-sync, generation counters, or defensive state machines unless your packet
  explicitly asks. One in-memory store on the server; one SSE stream to clients.
- Do not add abstractions "for later". No new dependencies outside `apps/demo/package.json` as set by P0.
- Do not edit files outside your packet's **Owns** list. If you need a change elsewhere, write it under
  "Requests for integrator" in your final report instead.
- `apps/demo/shared/types.ts` and the route table in `apps/demo/server/http.ts` are frozen after P0; only P0/P8 edit them.

## Commands (from `apps/demo/`)

- `npm install` · `npm run dev` (server :8787 + Vite :5173) · `npm test` · `npm run typecheck`
- Open `http://localhost:5173/check-in`, `/camera`, `/dashboard`, `/lobby`.

## Done means

Your packet's acceptance checks pass **in a real browser** (not only unit tests), `npm run typecheck` passes, and your
final report lists: what works, what you verified and how, what is not done, requests for the integrator.

## Git (save to GitHub continuously — user instruction)

- Repo: `starsbeloved/waiting-room-monitor` (private). Integration branch: **`crisp-demo`**.
- P0 and P8 work on `crisp-demo`. Parallel packets work on `crisp-demo-<packet>` (e.g. `crisp-demo-p2`) branched from the
  latest `crisp-demo`.
- **Commit and `git push` after every working step** (at least every ~30 min), small commits, message
  `pN: <what works now>`. Never force-push, never push to `main`, never rewrite history.
- Merging packet branches into `crisp-demo` is done by the integrator (P8 / Claude audit), not by packet sessions.
- Known-good checkpoint: tag `checkpoint-p9` and branch `crisp-demo-stable`. Never move, delete or force-push them.

## Safety

Provider keys are server-only. The server reads the env file at `PROVIDERS_ENV` (default
`/Users/ducthanhnguyenpham/Coding/APPLE HEALTH DEVICE/apps/waiting-room/.local/providers.env`; keys
`GEMINI_API_KEY, GEMINI_MODEL, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL_ID`, plus
`ELEVENLABS_AGENT_ID` once created). Never log, print or commit keys. No deployments, purchases or external account
changes. Deletion = move to Trash.
