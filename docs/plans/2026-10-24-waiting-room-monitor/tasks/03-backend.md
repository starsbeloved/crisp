# Local Visits and Check Requests Implementation Plan

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Persist correct check-ins and turn qualified posture observations into auditable staff requests.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** Node HTTP/SQLite, TypeScript, Zod, Vitest.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex backend worker. **Dependencies:** P1-A; P2-A/B are work-package groups; execute numbered slices below.

**Scope boundary:** server/{store.ts,ingest.ts,detector.ts,snapshot.ts}; HTTP route additions in server/http.ts only after integrator hands ownership over; tests/{store,http,ingest,detector}.test.ts. No shared/provider/UI edits.

**Pre-flight:** Inspect existing engine as a pattern only; new SQLite DB under .local/data/ separate from ECHO. UI consumer=Codex containers. Tests=:memory: or retained per-run isolated DB. No real users/secrets in tests.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P2-A1 — visits, questionnaire, seats, reload

**Interfaces:** `createVisit`, `getRoomSnapshot`, Visit/Answers types and visit/form/seat routes in contracts. Extend store.ts with explicit read/write methods, not shared mutable JSON objects.

- [ ] Add store/http tests for two unique visits, <=500-character reason, original answer preservation, unconfirmed proposed summary, explicit confirmed edit, seat assignment/clear, duplicate requestId, reload, and unknown visit 404. Run `npm run test -- tests/store.test.ts tests/http.test.ts` and record initial failure.
- [ ] Implement visits/idempotency tables and exact routes. Label seats as assigned metadata only. Body cap 256KiB; wrong role/foreign origin rejects; questionnaire role can write only its paired visit. Data survives service restart; face enrollment and all camera identity are not persisted as ready.
- [ ] Rerun tests, typecheck, build. Read the saved visit through a fresh service instance, not only the immediate POST result. E2-P2A1-TEST1/DIFF1; visits missing -> correct.

**Flow check:** API create/form/seat -> SQLite -> fresh read response; UI added P5-A. No real patient rows; isolated test DB retained.
**Acceptance:** original/confirmed values and seat metadata round-trip without cross-visit leakage.

## P2-A2 — scoped pairing and capture sessions

**Interfaces:** pair/join/capture routes; server binds visitId, purpose, source/run and captureId; phone may not choose another visit in a completion body.

- [ ] Write HTTP behavior tests: single-use 8-digit code expires at 120s; wrong purpose, reused code, two visits, cancelled capture, duplicate completion, visit switched on phone, and restart invalidate appropriately. Run target http tests to see failure.
- [ ] Implement ephemeral pairing/capture state, role-scoped HttpOnly SameSite cookies, server-side capture linkage, and persisted completed measurements. Correct idempotent retry returns identical stored result; same key/different payload is 409. New pairing invalidates the old unfinished capture. Do not log pairing/session values.
- [ ] Verify phone-compatible same-origin paths and exact status errors with fetch tests; after completion reload visit from SQLite. E2-P2A2-TEST1/DIFF1; pairing/capture missing -> correct. P1-B save device proof now eligible.

**Flow check:** station pair -> phone join -> create capture -> save -> station room read. Never return room-wide patient data to phone.
**Acceptance:** wrong patient cannot receive an old capture; failures visible and retries idempotent.

## P2-B1 — observation association, time, freshness

**Interfaces:** `ingestObservations` and `/bindings`, `/observations`; server computes alignment from valid ClockSync. Bindings maintain interval history for identityEpoch.

- [ ] Test duplicates, out-of-order higher seq time reversal, invalid units, 100-row cap, expired sync, >2000ms future data, delayed old windows, unknown/mismatched visit/epoch, and a window straddling identity change. For a valid 5,001ms-old window, assert current state stale with null current value while history retains original. Run tests/ingest.test.ts red first.
- [ ] Implement per-source/run validation, bounded 10-minute observation history, source/receipt clock separation, and full-window association. Only station can write room observations/bindings. Phone capture cannot inject poses. A missing/disconnected stream never resurrects an old number as live. New run/epoch resets window continuity.
- [ ] Implement contracts.md per-source/run/**stream** ordering, not one counter across modalities. Test interleaved pose/rPPG/breathing seq=1, overlapping measurement windows and conflicting duplicate IDs. Test BindingBatch with 90s skew, empty/full snapshot loss, heartbeat expiry, retired run, uncertain update followed by delayed old match, and windows crossing uncertainty bounds. Bindings are aligned on the server, never compared as raw source times to aligned measurements.
- [ ] Include latest pose/activity/reference/quality in RoomSnapshot even with no request. Test postureWithoutRequestRoom → toDashboardView.pose and >1s stale pose; historical triggering facts remain immutable. Phone historical readings keep their measurement interval and are not displayed as current camera pulse.
- [ ] Verify tests/typecheck; GET room from two successive polls demonstrates stale/current transition. E2-P2B1-TEST1/DIFF1; state ingestion missing -> correct.

**Flow check:** fixture or real frame observation -> validation/alignment -> current/history snapshot; only accepted live matched windows attach to a patient.
**Acceptance:** one occupant's data never transfers through seat/track changes; delayed time does not become fresh.

## P2-B2 — deterministic posture timing

**Interfaces:** export `DetectorState`, `DetectorResult`, `reducePosture(state,observation,nowMs)` from detector.ts; output zero/one request command. Detector owns time lifecycle; pose owns only features.

- [ ] Write exact assertions: <10s reference never armed; 10s usable reference armed; 9,999ms qualifying slump no request; at 10,000ms one; repeat frames no duplicate; >1,000ms pose gap resets; timer expiry with no frames resets; moving/unknown/ambiguous/replay/synthetic input cannot satisfy live hold. Run tests/detector.test.ts red.
- [ ] Implement aligned-time progression plus service heartbeat expiry. Source quality/identity/reference disqualification immediately breaks candidate. Require usable stationary seated pose and referenceReady; no physiological thresholds or Gemini decisions. One open episode/request; matched binding and evidence snapshot captured atomically.
- [ ] Test exact boundary and bad-input matrix; compare visible event creation time to candidate hold. E2-P2B2-TEST1; detector missing -> correct. No UI/provider work required for this pure slice.

## P2-B3 — persisted staff lifecycle and snapshots

**Interfaces:** CheckRequest, `buildAlertSnapshot`, acknowledge/check routes; provider inputs use eventId+snapshotVersion. State changes increment room revision; only semantic eligibility/context changes listed in contracts increment provider snapshotVersion. Routine bounding-box/timestamp refresh does not invalidate it.

- [ ] Test open -> acknowledged -> checked persistence, duplicate actions, camera loss keeping open request, missing physiology showing absent, and checked detector requiring a fresh 10s reference before rearm. Immutable triggering facts cannot mutate when later observations arrive.
- [ ] Implement check_requests/staff_actions persistence and fresh evidence snapshot generation. Keep original triggering facts and current context distinct; saved open requests after restart show identity/location unverified and no pending old audio.
- [ ] Implement ReferenceControl generation in check response and GET room. Reject old-generation poses after check, including late packets with higher seq. Test server check → client resetPoseReference → fresh contiguous 10s reference → rearm; a server flag alone cannot clear browser feature history. Duplicate check must not increment generation twice.
- [ ] Test 10s of unchanged identity/location with moving bounds/heartbeat while Gemini is pending: version stable and result accepted. Real location/identity/epoch/camera-continuity change invalidates pending explanation/audio; acknowledgement/check cancels eligibility. Freeze snapshot facts so live numeric refresh does not keep regenerating prose.
- [ ] Verify API actions then restart/read; run store/http/ingest/detector tests and build. E2-P2B3-TEST1/DIFF1. Provider lanes can now consume real snapshots.

**Flow check:** detector -> DB request -> room queue -> staff action -> DB -> fresh read; UI wiring P5-A. Retain test DBs, never permanent cleanup.
**Acceptance:** visible/auditable lifecycle independent of provider availability, no silent recovery claim.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(otherVisit.id).not.toBe(firstVisit.id);
expect(requestsAt9999ms).toHaveLength(0);
expect(requestsAt10000ms).toHaveLength(1);
expect(requestsAfterDuplicateFrames).toHaveLength(1);
```
