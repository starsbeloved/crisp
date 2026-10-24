# Foundation and Shared Interfaces Implementation Plan

**Execution authorization (2026-10-24):** User approved beginning the revised plan in a separate GPT-6.1 Sol/high session, bounded here to P1-A1 and a LOCAL synthetic-only Lovable handoff. Earlier awaiting-review language below is historical and superseded. No subagents, other sessions, external uploads or automatic continuation to later slices.
> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Create a compiling isolated app and freeze interfaces before concurrent work.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** Node >=24, TypeScript, React, Vite, Vitest, Zod, SQLite.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the revised plan; this session is bounded to P1-A1. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex integrator. **Dependencies:** approved plan + fresh P0.

**Scope boundary:** Create app config, shared/, client entrypoints/styles, runtime/api.ts, frame-bus.ts and inference.worker.ts transport, server/main.ts/http.ts health/station shell, tests/contracts.test.ts, tests/http.test.ts, tests/helpers.ts, tests/frame-bus.test.ts, docs/model-manifest.md. Add only root wr:* scripts and narrow ignore rules. Preserve ECHO scripts/source/tests. Integrator retains frame-bus/worker ownership through P3/P5; backend receives http.ts/http tests explicitly after the foundation checkpoint.

**Pre-flight:** Source = approved spec/contracts; UI = a local app shell; data = synthetic fixtures, in-memory tests; runtime = installed Node; no DB migration or external account. Pin dependencies once with ordinary network approval if required. Do not run opaque remote scripts.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P1-A1 — compiling app and contract boundary

**Interfaces:** implement shared/contracts.ts and schemas.ts exactly as contracts.md; export all named fixtures and presentation types. `createWaitingRoomServer({databasePath,now?})` exposes health/station and clean shutdown; full room state is added by P2. Frame-bus starts as a typed publish/subscribe interface, not fake sensor data.

- [x] Write contracts tests: reject `{value:Infinity,quality:'usable'}`, wrong method/unit, null usable value, injected aligned timestamps, negative windows, >500-character reason, wrong provenance, >100 ingest rows, and duplicate IDs with conflicting payloads. Accept a correct phone fixture and every named RoomSnapshot fixture.
- [x] Run `npm run test -- tests/contracts.test.ts`; record the initial missing-schema failure. Write minimal app config and schemas/types/fixtures until these assertions pass. Choose/pin exact package versions and a compatible React/Vite pair; add no UI kit/cloud backend by default.
- [x] Implement the local server shell and React shell. `GET /api/wr/health` returns `{ok:true,serverNowMs}`; unrelated route 404; explicit `/station` initializes the operator's same-origin HttpOnly session. Foreign-origin mutations reject; no arbitrary remotely accessible station creation. Bind the backend to loopback. A fixture screen says “Synthetic fixture” and does not claim live sensing.
- [x] Implement the exact UI props/fixtures and token/atom vocabulary from ui-plan.md, including posture-without-event, reference rearming, pending/failed staff actions and synthetic video slot. Test fixture-to-view mapping, original answers and historical contact-pulse labels. Provide gallery/typed callbacks before either presentation handoff; do not require live backend data to design it.
- [x] Reserve App pathname dispatch `/station`, `/phone`, `/questionnaire` per contracts; pin one lightweight QR encoder for P5's navigation-only phone links after package compatibility review. No routing framework or external QR service needed. The page skeleton is not a completed questionnaire/capture flow.
- [x] Add frame-bus tests for borrowed bitmap lifetime, independent stream allocators, stale inference discard, one in-flight model call and metadata age invalidation. Supply synthetic slow-model adapters; do not start sensors in the fixture gallery. Browser model APIs may block synchronously: worker transport is integrator-owned and live compatibility is proved in D2, not asserted by returning Promise.
- [x] Run `npm run test -- tests/contracts.test.ts tests/http.test.ts`, `npm run typecheck`, `npm run build`; start `npm run dev` and verify the actual shell and health route. Record exact new scripts, lockfile, paths, and rendered fixture screenshot. Gate for all other lanes: import/fixtures stable and build green.

**Flow check:** browser opens shell -> fixture read -> visible synthetic state; health/station requests -> bounded service state -> response. No real patient DB writes. In-memory tests; any retained artifacts under `.local/test-runs/P1-A1/`.
**Acceptance:** isolated app builds/types/tests; original root scripts remain; API errors and schema invariants externally tested. Shared file ownership frozen.
**Evidence/status:** E1-P1A1-TEST1/UI1/DIFF1; contracts and runtime missing -> correct only after proof.

## P1-A2 — clocks, environment, and model manifest

**Files:** server/clock.ts, client/runtime/clock.ts, tests/clock.test.ts; vite.config.ts and model manifest owned by integrator.
**Interfaces:** `completeClockSync` algorithm in contracts; serve model assets locally with recorded hashes/license/source. P3 requests models through this manifest owner.

- [ ] Add tests using client/server clocks 90s apart and 100ms RTT: align to the service interval without receipt anchoring; reject negative or >1000ms RTT, expired (>60s) sync, invented handshake IDs, and future source time. Run `npm run test -- tests/clock.test.ts` and observe failure before implementation.
- [ ] Implement the two-message sync using server-owned handshake state and same-role/source/run binding. Configure resync at 30s. Expose exact errors; callers cannot forge server timestamps or overwrite receipt time.
- [ ] Add BindingBatch source/nested-time alignment, stream-specific ordering and frozen-capture retry tests from contracts.md. Test old-sync completion inside an unexpired original phone capture versus a new live observation using expired sync. Never realign historical samples using a new handshake.
- [ ] Add HTTPS configuration that reads existing ignored certificate paths only; no automatic system trust changes, tunnel, or deployment. Document how the user can provide a phone-trusted origin and how to verify the phone camera permission screen. Plain LAN HTTP cannot pass P1-B device acceptance.
- [ ] Verify phone-facing HTTPS proxy cannot bootstrap `/station`; reject that route on the LAN origin while allowing explicit laptop-loopback station creation. Test allowed Origin/Host and role constraints through the proxy, not only direct backend calls. Keep phone endpoints same-origin; do not use broad CORS as a shortcut.
- [ ] Resolve Human/MediaPipe/GenAI proposed pins and exact model files/licenses before code execution. Record hashes and conditions; if descriptor weights lack suitable terms, mark asset choice blocked and propose a verified equivalent to integrator, never seat-only identity. Run typecheck/build/clock tests; record network/runtime/model checks actually performed.

**Flow check:** phone clock handshake -> service alignment -> timestamps visible in a test snapshot; no medical record or real video. TLS setup changes require the user's action/authorization, not a silent install.
**Acceptance:** clock tests pass; phone connection instructions concrete; packages pinned; model licensing/asset status honest. Do not mark a model approved from the package code license alone.
**Evidence/status:** E1-P1A2-TEST1/DIFF1; phone compatibility remains unverified until P1-B.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(() => measurementSchema.parse({ ...phoneFixture, value: Infinity })).toThrow();
expect(roomSnapshotSchema.safeParse(emptyRoom).success).toBe(true);
```

### Recorded P1-A1 result

2026-10-24: 39/39 tests, typecheck and build passed; local synthetic shell/health/station and 14 fixtures at desktop/mobile verified. Frozen interface hashes, screenshots, before/after recoverable snapshots, changed-file manifest and local synthetic-only Lovable v2 package are recorded in E1-P1A1 evidence and apps/waiting-room/docs/foundation-checkpoint.md. A2 remains unstarted; no device/provider pass or final dashboard polish claimed.
