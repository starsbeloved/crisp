# Scope amendment — Codex-only, no temperature, self-check-in revision

Date: 2026-10-24. Owner: current main Codex chat. **Planning only; product code unchanged.**

This amendment is part of the existing [master plan](2026-10-24-waiting-room-monitor-plan.md), not a second implementation plan. It supersedes older temperature tasks and Lovable/Antigravity assignments immediately. The [self-check-in design proposal](../../superpowers/specs/2026-10-24-self-check-in-revision-design.md) requires user review before its new behavior/interfaces are implemented.

## Decisions and boundaries

| Item | Current decision |
| --- | --- |
| Temperature | Removed entirely by user; no card/input/scenario/default/provider evidence/speech. |
| Implementer | Codex/GPT for all frontend, backend, sensing, integrations, tests and integration. No Lovable or Antigravity. |
| Design direction | Apple-inspired clarity, original apple-fruit branding, accessible patient flow; no Apple affiliation or fake medical efficacy. |
| User journey | Written self-check-in story proposed for review; one combined phone session changes current contracts and is not implemented yet. |
| Workstreams | User requested safe checkpoint and pause; messages delivered to all three existing sessions. No automatic restart or extra workers. |
| Hardware/network | Existing laptop + iPhone; actual phone/browser proof pending. Public trusted HTTPS is a proposal requiring separate deployment authorization. |

## Actual state checked during this revision

- `shared/contracts.ts` still includes `TemperatureScenario`, `AlertSnapshot.scenario` and `RoomSnapshot.scenarios`; `shared/view-model.ts` includes `TemperatureCardProps`, patient temperature and scenario banner. `shared/fixtures.ts` includes `simulatedTemperatureRoom`. These are implementation debt, not new-scope compliance.
- Current backend uses separate questionnaire/PPG pairing. Current phone captures and source clocks must be preserved through any new-session migration.
- Backend reported a safe checkpoint: 26/26 owned tests passed and typecheck passed. Phone reported a safe checkpoint: 47/47 owned tests and typecheck passed. These are worker-reported checkpoints, not a fresh integrated run by this chat.
- Environment thread is idle with an interrupted turn; its latest message reported phone-boundary tests and a pose model hash, with face-descriptor license unresolved. Do not claim it reached a clean verified checkpoint. Inspect its files/handoff and rerun checks before continuing.
- No Git repository is available. Retain existing files/test artifacts; no Git initialization or cleanup is authorized.

## Before any implementation resumes

- [ ] **R0 — reconcile checkpoint.** Goal: one trustworthy integration baseline. Steps: read the three local workstream notes; inspect changed file manifests and interrupted environment work; run app tests/typecheck/build without concurrent writers; record actual failures and ownership. Gate: all sessions idle and no further implementation authorized elsewhere. Acceptance: canonical status/evidence distinguishes verified, worker-reported, incomplete and interrupted work; no existing work discarded.
- [ ] **R1 — approve revised experience.** Goal: settle the self-check-in flow. Steps: user reviews the linked design; resolve laptop vs phone question default, consent/help/failure/completion behavior and public-phone network approach; preserve scientific acceptance. Gate: planning only. Acceptance: approved written design, with deployment authority still separate.
- [ ] **R2 — freeze coordinated contracts.** Goal: replace split patient flows safely. Steps: define exact consent/name/session/editor-lease/completion types and routes; define public/staff permissions and revocation; enumerate every consumer/test; write one migration packet with exact exported signatures. Gate: R1 approved, R0 coherent; main Codex owns shared files and migration integration. Acceptance: no undefined API or dual writer, no station authority on a phone, no session switch that cancels valid PPG just to answer questions. The old contracts remain the executable baseline until this migration is approved.
- [ ] **R3 — retire temperature runtime.** Goal: implement the approved scope cut without breaking data preservation. Steps: add negative tests; remove active temperature fields/props/routes and active gallery entries coherently; preserve legacy storage/artifacts without displaying or sending them; update consumers together; rerun affected tests/typecheck/build. Gate: exclusive ownership and approved migration packet, not an isolated field deletion during another session. Acceptance: no active temperature controls/cards/defaults/facts/speech, no destructive database migration, pulse/posture and generic synthetic/replay provenance unchanged.
- [ ] **R4 — implement self-check-in vertical slice.** Goal: one patient journey across laptop and phone. Steps: consent/visit/enrollment shell; visit-scoped continuation; questionnaire/save/review; reuse phone capture; completion/reset; staff readback; test two-visit races, takeover and failures. Gate: R2 and required camera/backend modules ready. Acceptance: the new design's acceptance stories pass at software level, with hardware gates separately recorded.
- [ ] **R5 — Codex frontend and device proof.** Goal: the approved Apple-inspired design on the real journey. Steps: implement tokens/atoms and screen layouts with existing stack; verify accessibility/degraded states; run iPhone HTTPS/torch/lens/save experiment early; run original identity/physiology/voice acceptance. Gate: no invented values or presentation-only pass treated as live proof. Acceptance: screenshots/interaction checks and actual device evidence; required failures remain incomplete rather than relabeled done.

## Exact downstream plan changes

| Existing surface | Governing change |
| --- | --- |
| Master P2-C / packet 04 | Codex owns dashboard presentation; no export/import or external service. Retain presentational boundary and injected video/callbacks. |
| Master P2-D / packet 05 | Codex owns StatusBadge and ProvenanceLabel. P2-D3 TemperatureCard is retired, not completed. |
| P4-B / packet 10 | No temperature-specific prompt/snapshot/fallback case; still test unsupported numbers, missing data, source provenance and stale identity/location. |
| P5-A / packet 12 | No TemperatureScenario control, scenario mutation or temperature readback; optional seat metadata remains. |
| AC-15 | Retire the old optional-temperature acceptance. Replace with no-temperature active-surface regression, retaining the old criterion in historical evidence only. AC-01..14 remain required. |
| `contracts.md` | Current schema is the old implemented baseline. New temperature/session changes are pending a single explicitly versioned migration; do not silently edit producers or consumers independently. |
| `ui-plan.md` | Codex-only Apple-inspired direction, no temperature; new self-check-in story is the review source for patient screens. |
| Ledgers / historical packages | Preserve prior truthful results and exports. Do not erase old observations, rewrite historical pass counts, or treat an old fixture screenshot as revised UI acceptance. |

## Known file impact for the migration packet

Relative to `apps/waiting-room/`: `shared/{contracts.ts,schemas.ts,view-model.ts,fixtures.ts}`, `client/{App.tsx,styles.css}`, `client/runtime/api.ts`, `server/{http.ts,store.ts,clock.ts}`, `client/runtime/clock.ts`, `client/phone/PhonePage.tsx`, `client/ui/dashboard/{DashboardView.tsx,dashboard.css}` and their contract/API/store/HTTP/clock/phone/UI tests. Verify actual file names before editing; no rename or removal is authorized by this inventory. New kiosk/continuation modules will get exact paths and exports in R2, not improvised during parallel implementation.

Capture/DSP internals, independent frame sampling, immutable visit-bound results and original timestamps are preserve-first. Consent/session UX must not weaken those guarantees. Original patient text mentioning fever remains reported context; removal of the temperature feature does not authorize erasing answers. No network/provider call is required to revise this plan.

## Safe continuation

The user now wants this chat to own the plan and integration. Do not resume the three old sessions with stale packets. Review the written self-check-in proposal, then complete R0/R2 and issue one bounded implementation task here. Parallelism can be reconsidered only with explicit authorization and frozen, non-overlapping interfaces.

## Revision verification

Read-only Node documentation check: 12 touched documents, 81 local links checked, zero failures; checked that both user-story sections exist and that the original spec no longer selects optional temperature or external-tool implementation. Product code was not changed by this planning revision. No application test/build, device experiment, deployment or provider call was performed; worker test results above remain attributed reports. Historical contract/task text is explicitly marked superseded where migration has not yet occurred; it is not a claim that revised runtime interfaces already exist.
