# Execution ledger — waiting-room-monitor plan

## Authorization and rulings — 2026-10-24

- User reviewed the patient/nurse revision and said “okay start building.” This authorizes local Codex-only implementation in this chat, not deployment, external services, camera operation without consent, purchases or additional sessions.
- Ruling: work in the existing non-Git workspace; native worktrees/commit-based skill scripts cannot apply. Preserve artifacts and record local verification. No repository initialization, destructive cleanup or subagents.
- Ruling: reconcile interrupted integration before new scope. Fresh baseline: 137/138 tests pass with loopback permission; `/phone` mount test fails because App still renders the foundation placeholder. Sandbox-only HTTP listener failures are not product defects. Existing phone/clock modules and the retained failing integration test define the repair.
- Ruling: no new UI framework or animation dependency. UI/UX Pro Max governs accessible forms; Apple-inspired style uses existing React/CSS and system fonts. Marketing-first skill prescriptions do not apply.

## Dependency preflight

| Producer → consumer | Finding / action |
| --- | --- |
| PhonePage → App | PhonePage requires SensorContext, synchronized source clock and source time. App has not mounted it. Add a lifecycle-owned route wrapper before changing session behavior. |
| RoomSnapshot → schemas/store/fixtures/view-model/dashboard | Temperature crosses every surface. Migrate coherently to snapshot version 2 with no scenarios; preserve measurement/binding version 1 because their wire formats are unchanged. |
| Existing patient roles → combined journey | Separate questionnaire and PPG roles cannot fulfill one phone continuation. Freeze new patient-session contract before implementation; do not grant station access to a phone. |

## Progress

- [x] Reconcile phone mount and obtain green baseline.
- [x] Remove temperature runtime with failing regression tests and coordinated schema migration.
- [x] Implement reviewed patient-session/check-in contracts and tests.
- [x] Implement patient screens and truthful nurse readback; verify the assisted, measurement-unavailable journey.
- [x] Record remaining hardware/model/provider gates separately from software tests.
- [ ] Complete live identity/sensing/frame transport and provider UI integration; pass actual-device acceptance.

## Main integration checkpoint — 2026-10-24, after five workstreams

All five chats verified idle. Read their notes under `docs/workstreams/`; no new sessions/subagents launched. Baseline: 393/395 tests passed; the two failures reproduced missing `/check-in` and `/patient` mounts. Typecheck/build passed. This checkpoint is **not a completed live demo**.

Implemented and regression-tested:

- Mounted `/check-in`, `/patient`, `/vision`, `/staff`; `/` and `/station` now show real route choices rather than default synthetic patients. Preserved gallery at `/gallery` and legacy phone route.
- VisionRoute performs explicit station connection and source clock synchronization before the separate Start camera action; serial, latest-only binding transport. It does not yet forward frames into physiology/pose.
- Reconciled kiosk completion: `/kiosk/session` returns `{visit:null,receipt}` for completed own visits. Receipt contains only visitId/label/completedAtMs; completed answers remain hidden. Phone completion now reaches kiosk completion UI. HTTP and mounted UI RED→GREEN.
- Connected nurse acknowledge/check with same-key retries after a lost response, duplicate-click locks, pending/error feedback. Local elapsed time marks hung room polling stale rather than freezing current readings. UI RED→GREEN.
- Replaced invalid/overlong sensing IDs with UUIDs. Actual producer output now passes measurement/pose input schemas even with maximum-length source/run IDs. RED→GREEN.
- Added authenticated explanation/speech/audio HTTP endpoints and room status merge through injected provider service. Default production provider config remains disabled; no paid network call was made. Synthetic HTTP test creates the deterministic request first, receives grounded fallback/audio, and invalidates audio on acknowledgement.
- Reconciled provider/client audio eligibility with immutable trigger tracks versus uniquely reidentified current tracks in newer snapshots. Semantic stamp includes actual current track/epoch; first-version mismatch still fails closed. RED→GREEN.
- Shared operator CSS follows the approved restrained system-font/leaf-green direction. UI/UX Pro Max informed visible pending states and recoverable inline action errors; no UI dependency added.

Rulings:

- Minimal own-visit completion receipt is an additive implementation contract, not a reason to return completed questionnaire data. Cost if wrong: adjust receipt/readback schema; no spec change.
- Keep actual providers disabled until explicitly configured/authorized; tests inject bounded synthetic transports. Cost: real explanation/speech remains incomplete, not silently substituted.
- Existing foundation test expecting a station-preview button was updated for the approved three-workspace launcher. Synthetic evidence remains accessible only in its labeled gallery.
- No model/license assumption, arbitrary calibration, synthetic physiology, public deployment or additional worker was introduced to hide the remaining gaps.

Browser evidence: local app at `http://127.0.0.1:5173`. Real browser created a labeled synthetic visit (`Patient d670aec3`, alias `Synthetic integration test`), declined camera consent, saved original test answers, completed without pulse, and read the same answers in staff. Vision station connected and synchronized without camera acquisition. Record retained in local SQLite; no deletion. API restarted with saved records preserved (ephemeral sessions reset). Screenshot: `apps/waiting-room/output/playwright/integrated-vision-camera-off.jpg`. Playwright connector navigation stalled; switched to the working in-app browser. No live camera, phone, biometric calibration, audible speech, 200% zoom or small-device proof claimed.

Remaining build work (not merely device gates): install/review a suitable face runtime and exact model assets; implement worker-backed FaceAdapter and calibration UI; connect real FaceEnrollment; retain session gallery across check-in/vision without persistent biometric storage; wire bounded pose inference, metadata, rPPG/breathing, clock-safe observation buffering and nurse reference controls; same-feed staff video transport and liveness; questionnaire summary HTTP/UI, explanation scheduling and browser audio queue/playback. Three-device role pairing/video transport is not implemented. Staff buttons for voice still report unavailable.

Remaining external/device gates: phone-accessible trusted HTTPS, iPhone rear-lens/torch/cadence/signal/save test; consenting face calibration and held-out unknown/swap tests; real camera pulse/breathing reference comparisons; full seated-reference → sustained-slump → nurse response journey; explicitly authorized Gemini/ElevenLabs configuration and actual audible test. The first three routes loading does not pass these gates.
