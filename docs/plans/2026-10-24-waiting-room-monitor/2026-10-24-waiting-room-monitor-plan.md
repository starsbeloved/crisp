# Waiting Room Monitor Implementation Plan

**Current revision gate (2026-10-24):** Read [scope-amendment.md](scope-amendment.md) first. The user removed temperature entirely and selected Codex/GPT for all code; Lovable/Antigravity assignments below are superseded. All three workstreams are idle following the pause request (environment ended interrupted; inspect before resuming). This main chat now owns plan revision/integration. No automatic implementation restart. Review the [patient and nurse journeys](../../superpowers/specs/2026-10-24-self-check-in-revision-design.md) before freezing replacement contracts. Earlier authorization/status paragraphs describe historical checkpoints, not current authority.

**Execution status (2026-10-24):** Earlier P1-A1 foundation and three authorized workstream slices produced partial implementation. Those sessions are now idle; implementation is paused while this chat revises the patient/nurse plan. No external tools, subagents, deployment or automatic continuation.
> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Demonstrate one consenting patient checking in with face enrollment, questionnaire, and phone PPG, then appearing in live room footage with truthful sensing and a patient-specific staff check request explained by Gemini and spoken by ElevenLabs.

**Architecture:** Add an isolated React/Vite/TypeScript application under `apps/waiting-room/`, with browser-local sensing and a native Node HTTP/SQLite service. One laptop supplies face enrollment, room video, and the staff dashboard; one paired phone supplies fingertip PPG. A deterministic posture detector creates requests before asynchronous provider work.

**Tech Stack:** Node >=24 (observed 26.5.0), TypeScript, React, Vite, Vitest, React Testing Library, native `node:http`/`node:sqlite`, Zod, Human face recognition, MediaPipe Pose Landmarker Lite, classical signal processing, server-only `@google/genai`, ElevenLabs REST. P1-A1 pins resolved packages/interfaces before parallel code starts; P1-A2 verifies model hashes/licenses before each model is used; model-license and device checks are real gates, not assumed passes.

**Spec:** [Approved design](../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md), approved by the user 2026-10-24.

## Metadata

- Date: 2026-10-24.
- Status: **Revision under review. P1-A1 previously verified; later workstream checkpoints require integration reconciliation. Temperature removal and Codex-only ownership confirmed; detailed self-service design awaits review.**
- Canonical plan: this file. The Superpowers entry point links here; do not maintain a second competing plan.
- Companions: [actual status](2026-10-24-waiting-room-monitor-actual-status.md), [evidence](2026-10-24-waiting-room-monitor-evidence.md), [benchmarks](2026-10-24-waiting-room-monitor-benchmark.md).
- Shared decisions: [contracts and file map](contracts.md), [tool handoffs](agent-handoffs.md), [UI plan](ui-plan.md), [early device experiments](device-experiments.md), [review findings and resolutions](review-resolution.md).
- Current execution preference: Codex-only, no subagents. This chat owns revision/integration. Packets retain module boundaries, not external-tool assignments. Planning edits do not prove implementation.

## Global Constraints

- “No additional hardware purchase is required.”
- “The first automatic trigger uses posture persistence.”
- “The face scan at check-in is already selected.”
- “Live footage is required, not an optional decorative element.”
- “This version reports pulse/BPM and signal quality.” Phone PPG does not measure SpO₂, temperature, or blood pressure.
- “No trained model or stress dataset is required for initial contact PPG.” No new model training in this plan.
- “An initial contact pulse is a timestamped comparison point. It is not a permanent calibration offset for camera rPPG.”
- Face enrollment, recognition, and tracking are mandatory; optional assigned seats never replace them.
- Spec timings: seated reference >=10 seconds; qualifying slump >=10 seconds continuously; pose gap >1 second resets unfinished candidate; camera pulse 30-second window; breathing 45-second window; update both about every 2 seconds.
- Codex owns presentation, shared display components, behavior, integration, forms, state transitions, APIs, sensors, thresholds and models. No Lovable or Antigravity use.
- Preserve root ECHO source/tests/outputs/photos. New product code belongs only in `apps/waiting-room/`; only the Codex integrator may add `wr:*` root scripts and narrowly scoped ignore entries.
- No purchases, public tunnel, hosting/deployment, GitHub project creation, push, system installs/trust changes, or private-data uploads are authorized by plan approval alone. Use available tools and ordinary package-manager approval requirements at execution time.

## Review Focus

1. A phone finishes an old capture after another visit is selected: immutable pairing/capture ID prevents reassignment. Test P2-A and P1-B.
2. A face turns, someone crosses, or an unknown person enters: identity epochs invalidate contaminated signal windows. Test P3-A and P3-C/D.
3. Phone clocks differ or video stalls: source time, aligned interval, freshness, and rejected gaps cannot become continuous evidence. Test P1-A, P1-B, P2-B.
4. A patient moves/gets checked while AI or audio is pending: snapshot version/location must be revalidated before speech. Test P4-B/C.
5. A frozen video or synthetic fixture looks live: provenance/feed labels survive patient selection, provider output, and history. Temperature must be absent from the active demo. Test P2-D, P5-A/B and amendment R3.

## Rules

Complete P0 before implementation. Execute a slice ID, not an entire phase. Read the approved spec, this plan, contracts, and your assigned packet. Never edit another owner's files. Each slice uses the failing-test -> implementation -> passing-test cycle where meaningful; camera behavior also requires actual device evidence. Static visual components need a typecheck and visual check, not tests that merely repeat their JSX.

After a completed slice, send the integrator its exact files, validation command/results, limitations, and evidence; only the integrator updates the canonical ledgers and next affected tasks. Check off only demonstrated work. Keep old failed checks visible. If Git exists at execution, checkpoint scoped changes with a local commit; if not, record a changed-file manifest and recoverable snapshot without initializing a repository or publishing. Retain isolated test databases/artifacts under `.local/test-runs/<run-id>/`; no automatic permanent cleanup. Any removal follows the user's explicit Trash-only approval rule.

### Common slice pre-flight and proof rules

Every packet specifies editable files, exact inputs/outputs, dependencies, behavior checks, and acceptance. Before each slice: inspect its caller, contract, tests, runtime config, and data source; verify the dependency's acceptance/evidence rather than trusting a filename. The packet's **Flow check** applies at each test/implementation/verification step: verify the UI trigger, data read/write, visible render target, and resulting evidence; N/A is explicit for pure code. Code uses synthetic/in-memory fixtures by default; hardware proof uses consenting volunteers; providers use synthetic fixtures unless separately authorized consenting material.

Evidence per slice: `E<phase>-P<phase><letter>-TEST1` (command/result), `...-UI1` (real flow/screenshot), `...-DEVICE1` (device conditions/measurement), `...-DIFF1` (file manifest/review). Create only evidence that actually exists. Keep identities, signal values, and credentials out of routine logs. The benchmark ledger stores measured numbers, not planned or invented results.

## Problem / actual status

The original P0 found only ECHO drafts. A Waiting Room Monitor foundation and partial backend/phone/environment modules now exist under `apps/waiting-room/`; they are not a proven end-to-end patient/nurse journey. Read scope-amendment.md for checkpoint classifications and reconcile the interrupted environment slice before resuming. Preserve ECHO and do not count its tests as proof of this product.

## Scope / non-goals

Build the linked patient and nurse journeys, truthful missing/low-quality states and optional seat metadata. Temperature is excluded entirely. The second person is an identity-confusion test. No diagnosis, stress classifier, medical triage, automatic fever trigger, 100-person validation, dedicated sensor procurement, or cloud room-video processing. All required live sensing layers remain required; if an experimental layer fails, report that acceptance item incomplete rather than covertly removing it.

### One-laptop topology and acceptance levels

One laptop hosts the service, a single foreground station tab, the webcam and speaker. Enrollment and room monitoring reuse its webcam sequentially; no second laptop is required. The existing designated phone remains required for contact PPG. Independent phone acquisition can overlap laptop rPPG for comparison. Switching station modes/repositioning explicitly resets affected windows/reference/regions; hidden or frozen footage is never called live. See contracts and D1/D2 experiments for HTTPS, station access, frame ownership and compute limits.

Use three distinct statuses for each packet: **module-ready** (interfaces + automated tests/typecheck), **integrated** (actual caller → write/read → rendered state), and **device/provider-validated** (real hardware/provider evidence). P5 consumes module-ready outputs; it does not wait on a packet's P5-dependent UI proof. Required acceptance is complete only when its applicable levels pass. After the revision gate, start thin P5-A containers as dependencies become ready; final styling is not a prerequisite for the first real journey.

## File Structure / ownership

See `contracts.md` for the exact tree and interfaces. Paths are relative to repository root; commands run from `apps/waiting-room/` unless explicitly stated. Old root files are preserve-only, except the integrator's additive scripts/ignore entries. Do not move or rewrite legacy source as cleanup.

## Requirements / acceptance mapping

| Spec acceptance | Implementing slices |
| --- | --- |
| AC-01 visit, form, confirmed summary | P2-A, P4-A, P5-A |
| AC-02/03 enrollment, identity, lost continuity | P3-A, P5-A/B |
| AC-04 real phone PPG / correct patient | P1-B, P2-A, P5-A/B |
| AC-05 facial rPPG | P3-C, P5-B |
| AC-06 camera breathing | P3-D, P5-B |
| AC-07 activity | P3-B, P5-A |
| AC-08 posture persistence | P2-B, P3-B, P5-B |
| AC-09 staff request and lifecycle | P2-B, P5-A |
| AC-10 Gemini questionnaire + explanation | P4-A/B |
| AC-11 speech / dedup / stale results | P4-C, P5-A/B |
| AC-12 freshness / provenance | P1-A, P2-B/D, P5-A/B |
| AC-13 live dashboard footage | P2-C, P3-A, P5-A/B |
| AC-14 optional seats | P2-A, P3-A, P5-A/B |
| AC-15 revised: no active temperature surface | Amendment R3, P4-B, P5-A/B; old criterion retired, not passed |

## Checklist

Each row is an executable mini-plan: Goal / ordered work / gate / acceptance. Open its packet for exact files, signatures, tests, evidence targets, and checkpoint boundary. Dependencies are a DAG; phase numbers group responsibility and do not block an explicitly ready independent lane.

- [x] **P0-A — actual status.** Goal: establish reality. Work: inspect root code/config -> run baseline -> classify surfaces -> update plan consequences. Gate: read-only audit only. Acceptance: actual-status matrix and exact evidence IDs completed; no product code changed.

### P1 — shared foundation and first device proof

- [ ] **P1-A — foundation/contracts.** Goal: a compiling isolated app and frozen interfaces. Work: establish app scripts/test shell -> implement contract schemas and UI fixtures/tokens -> local HTTP health/station shell (room state belongs to P2) -> resolve/pin relevant dependencies/assets -> typed scheduling/worker seam. Gate: plan approved and P0 fresh. Acceptance: app typecheck/tests/build and schema tests pass; fixture imports stable; model/license decisions recorded separately. Pure UI lanes require A1 only, not device success. [Packet 01](tasks/01-foundation.md)
- [ ] **P1-B — phone PPG.** Goal: a real waveform and quality-controlled BPM on one actual phone. Work: verify secure capture/torch -> implement timestamped optical extraction/DSP -> bind capture ID -> perform device comparisons. Gate: P1-A; phone HTTPS/camera permission must be available before device proof, with user-operated trust/configuration if needed. Acceptance: real usable capture plus bad-input rejection; save integration waits for P2-A. Unsupported phone leaves this incomplete while independent lanes continue. [Packet 02](tasks/02-phone-ppg.md)

### P2 — independent backend and presentation lanes

- [ ] **P2-A — check-in persistence and pairing.** Goal: correct visit association and durable check-in. Work: SQLite records -> short form confirmation/seat updates -> single-use phone pairing/captures -> restart/idempotency tests. Gate: P1-A. Acceptance: two visits cannot exchange answers/readings; completed readings reload; restarting requires face reenrollment. [Packet 03](tasks/03-backend.md)
- [ ] **P2-B — observation state and deterministic requests.** Goal: truthful current state and a timed posture request. Work: source-clock alignment/validation -> identity-safe windows/freshness -> posture timing -> acknowledge/check/rearm. Gate: P1-A; persistence integration after P2-A. Acceptance: exact 10s/1s boundary tests, duplicate handling, immutable evidence, and persisted request lifecycle pass. [Packet 03](tasks/03-backend.md)
- [ ] **P2-C — Codex dashboard presentation.** Goal: Apple-inspired accessible staff workspace with passed props/callbacks. Work: approved tokens -> synthetic fixtures -> live-video slot/request/detail layout -> rendered interaction/accessibility checks. Gate: revised ViewModel frozen through R2/R3; no external tool/export. Acceptance: correct selected visit/track, truthful empty/degraded states, no temperature, typecheck and rendered proof. [Packet 04](tasks/04-lovable-dashboard.md) (historical filename retained).
- [ ] **P2-D — Codex display atoms.** Goal: StatusBadge and ProvenanceLabel without duplicated clinical logic. Work: implement frozen props -> check tones/provenance -> integrate shared CSS. Gate: R2/R3 types and tokens frozen. Acceptance: exact copy, accessible contrast, no effects/API/dependencies; screenshots/typecheck. TemperatureCard/P2-D3 retired. [Packet 05](tasks/05-antigravity-components.md) (historical filename retained).

### P3 — independent Codex sensing lanes

- [ ] **P3-A — camera runtime and face identity.** Goal: live local stream plus enrollment, recognition, and safe track binding. Work: shared camera owner/frame scheduler -> local face models/calibration -> enroll/match/epoch changes -> current region/seat association. Gate: P1-A; model licenses/assets verified before use. Acceptance: enrolled/unknown/crossing cases produce correct binding or uncertainty; live frame watchdog and overlay transform work. [Packet 06](tasks/06-camera-identity.md)
- [ ] **P3-B — pose/activity.** Goal: observable posture features for a face-visible seated slump. Work: selected-person pose -> stationary/activity quality -> 10s seated reference -> relative slump observations. Gate: P1-A; real frame binding needs P3-A, pure tests start from frozen fixtures. Acceptance: active/poorly associated torso cannot create a medical event; posture features feed P2-B, without duplicating its event lifecycle. [Packet 07](tasks/07-pose.md)
- [ ] **P3-C — facial pulse.** Goal: classical POS rPPG with honest quality. Work: timestamped face skin means -> POS window -> quality/BPM -> real stationary comparison. Gate: P1-A; device path P3-A and integrator scheduler; pure signal tests independent. Acceptance: 30s window/2s refresh and runtime identity/motion rejection; report usable-window rate and error. [Packet 08](tasks/08-rppg.md)
- [ ] **P3-D — breathing.** Goal: independent torso-motion respiratory estimate. Work: torso patches -> motion trace -> quality/periodicity -> timed reference comparison. Gate: P1-A; device path P3-A/B. Acceptance: 45s window/2s refresh; gross movement/poor texture rejected; no pulse inferred from respiration. [Packet 09](tasks/09-breathing.md)

### P4 — Codex provider lanes

- [ ] **P4-A — questionnaire Gemini adapter.** Goal: editable factual summary with originals. Work: server-only SDK adapter -> schema validation -> original/confirm flow -> timeout path. Gate: P1-A; P2-A for saving; real provider proof requires available authorized credentials without exposing them. Acceptance: omissions/instruction-like answers/failure preserve form data; no diagnosis. [Packet 10](tasks/10-gemini.md)
- [ ] **P4-B — event evidence explanation.** Goal: Gemini explains an existing request and supplies grounded voice text. Work: bounded versioned snapshot -> constrained statements/text validation -> stale result rejection -> factual fallback. Gate: P1-A, P2-B and revised contracts. Acceptance: unsupported causal/numeric/location claims fail; no generated temperature fact; visible event precedes provider call. [Packet 10](tasks/10-gemini.md)
- [ ] **P4-C — ElevenLabs playback.** Goal: one valid staff announcement per event. Work: server TTS adapter -> bounded transient audio job -> enable/mute/queue -> revalidate before playback. Gate: P1-A, P4-B; synthetic tests first. Acceptance: timeout/retry/movement/acknowledgement cannot play obsolete or duplicate audio; provider unavailable stays visible. [Packet 11](tasks/11-voice.md)

### P5 — Codex integration and final proof

- [ ] **P5-A — patient-to-nurse journey.** Goal: join module-ready outputs into one local workflow. Work: check-in/consent/face/questions/phone -> saved visit -> live staff identity/evidence -> request -> acknowledgement -> in-person demo check -> mark checked/rearm; add providers and polished presentation without blocking core requests. Gate: approved revision, frozen migrated contracts, relevant modules; full journey requires P1-B, P2-A/B/C/D, P3-A/B/C/D, P4-A/B/C. Acceptance: two-device UI input -> persistence/readback -> same visit/current track -> persisted staff actions; no fake live data or temperature. [Packet 12](tasks/12-integration-and-validation.md)
- [ ] **P5-B — scientific and UI acceptance.** Goal: verify AC-01..14, revised AC-15 and both journey stories on the actual setup. Work: automated gates -> signal comparisons -> patient and nurse rehearsals -> ambiguity/failure/retry/privacy checks -> rendered evidence. Gate: P5-A and sensing modules; partial rehearsal cannot claim full acceptance. Acceptance: predeclared targets and every criterion reported passed/failed/not-run with device/reference conditions; no clinical-validation claim. [Packet 12](tasks/12-integration-and-validation.md)
- [ ] **P5-C — whole-project review.** Goal: verify contracts, scope, credentials handling, real UI behavior, and remaining gaps. Work: inspect changed-file manifest and evidence -> review accepted plan/AC -> return failures to owning slice -> rerun affected gates. Gate: all slices completed or explicitly blocked. Acceptance: review passes or records exact blockers; no closure with required unresolved acceptance.
- [ ] **P5-D — dead-work review.** Goal: keep only useful plan-created artifacts. Work: identify rejected fixtures/helpers/duplicate scripts -> rewrite in scope where needed -> list candidates for Trash with exact paths/sizes/purpose -> obtain approval before removal. Gate: only plan-created artifacts in scope; never delete historical ECHO work. Acceptance: no dead runtime import/hidden fallback; any unapproved removal remains preserved and documented, not silently deleted.
- [ ] **P5-E — close implementation.** Goal: final verified handoff. Work: refresh ledgers -> rerun app test/typecheck/build -> run representative local demo -> record final changed-file manifest and Git commit only if available/authorized workflow -> report complete vs incomplete criteria. Gate: P5-C/D accepted; required blockers prevent complete status. Acceptance: evidence and measured benchmarks current, no invented passes, known working-tree/file state, concise demo instructions.

## Initial execution order and scope control

No subagents for the current workflow. After approval: P1-A1 contracts/shell → relevant P1-A2 checks → early D1 phone and D2 combined-camera experiments using their task slices → P2 visit/event state → thin P5-A real journey → D3 physiology evaluation and P4 provider integration → P2-C/D polish → P5 full proof. Do not defer discovering rPPG/breathing/framing impossibility until final integration; D2/D3 acquisition probes precede broad polish. P2 UI work and pure signal/provider tests are independently implementable from frozen fixtures, but this does not require concurrent agents or multiple laptops.

Codex implements everything locally; external handoffs are removed. Keep module boundaries and a single contract owner. No Supabase, WebSocket, cloud video, chart framework, GSAP or second application is needed for this demo. Optional seat controls come after the core journey; temperature is excluded. Mandatory sensing layers remain acceptance obligations. Use device-experiments.md timeboxes and reserve integration time; do not promise completion without actual hours and successful probes.

## Engineering acceptance targets (not clinical thresholds)

Use separate calibration/debug attempts and fresh holdout attempts. Freeze thresholds/framing before evaluation, retain all rejected attempts, and restart a labelled evaluation set after retuning. Device/provider gates are not established by unit-test accuracy on generated sine waves.

- Phone: three stationary usable 30s windows; absolute pulse error <=5 BPM against a simultaneous instrument if available, otherwise a documented coarse timed manual count. At least 2/3 attempted windows usable; count all attempts. Covered/no-finger/motion/saturation controls must reject instead of invent BPM.
- Facial pulse: three 30s stationary windows, <=10 BPM absolute error against independent pulse reference; target >=2/3 usable attempts. Phone/rPPG agreement is separately reported and not independent clinical validation.
- Breathing: three 45s stationary windows; <=3 breaths/min error against synchronized timed manual/video counts; target >=2/3 usable attempts. Gross movement controls reject.
- Detector: no event at 9,999ms qualifying hold; one at 10,000ms; gap >1,000ms resets; unknown/ambiguous identity does not attach a confident patient event.
- UI: stopped stream visibly stale within 1 second; numeric current estimates stale after 5 seconds without a fresh eligible window; visible request appears within 1 second of a detector event on the tested laptop. Provider latency never blocks the visible request. Record actual values rather than asserting targets achieved.
- A failed experimental layer is shown unavailable and its acceptance remains incomplete. The integrator can demonstrate the working portions truthfully; cannot label that a fully passed product.

## Risk Notes

Phone torch/HTTPS compatibility, subtle chest motion and rPPG signal quality, face model license/threshold calibration, compute contention, and provider account access are unverified. One camera owner schedules model work with no overlapping inference; identity/pose receive bounded cadence, physiological channels use timestamped frames, and missed deadlines produce quality/freshness failures. No silently substituted model, phone app, prerecorded clip, fake sensor, or seat-only identity. If the actual device gate fails, record the blocker and ask for a scoped design change rather than rewrite the approved idea.

## P1-A1 checkpoint (2026-10-24)

- [x] P1-A1 isolated compiling app, frozen contracts/fixtures, local health/station, presentation gallery and bounded frame seams; E1-P1A1-TEST1/UI1/DIFF1.
- [ ] P1-A2 clocks, model/license/assets and phone HTTPS boundary; partial work exists, environment turn interrupted, reconciliation pending. Actual phone TLS/camera and descriptor-license gates remain unverified.

P1-A overall is not complete. Local synthetic-only Lovable v2 handoff is prepared, typechecked, built and allowlist-verified; not uploaded. See the current actual-status/evidence and apps/waiting-room/docs/foundation-checkpoint.md. Next work requires a separate scoped execution; no automatic continuation.
