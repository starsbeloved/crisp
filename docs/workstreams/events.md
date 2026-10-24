# Event/backend workstream

## ROUND 2 — ACTIVE: final integration owner

2026-10-24. Human authorized this existing session to implement all remaining integration under `docs/plans/2026-10-24-waiting-room-monitor/final-integration.md`. Preserving the 406-test baseline and main's later changes. Owning App/staff/dashboard/styles/API/shared/HTTP/main/backend/environment/Vite/integration tests and final ledger; four other existing sessions retain their explicit Round 2 paths until they report ready/stopped. No new agents/chats or cross-chat messages. Starting independent server/config/API work, then mounting the actual vision, sensing, media and voice exports. Device consent, dependency network approval and actual provider calls remain separate gates.

### Round 2 interface additions ready

- App now mounts `StationVisionProvider` around `/check-in` and `/vision`; `/questionnaire` uses the real patient continuation. StaffPage mounts real `StaffCamera` and `VoiceControls`; nurse action initiation changes the rendered action epoch immediately, cancelling pending provider work before the action resolves. Mounted integration regression and existing action tests: 4/4 pass. Optional assigned-seat editing uses the existing authenticated API, same-input retry keys, and keeps observed location unchanged.
- Native startup blocker found while media lane remains ACTIVE: `node -e "import('./server/http.ts')"` fails `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` in `server/media.ts:5` because native Node strip-only mode rejects constructor parameter properties. Awaiting that lane's ready/stopped checkpoint before a surgical fix. Vite build and typecheck currently pass, demonstrating why native entrypoint verification is also required.
- Update: media owner has corrected that native syntax concurrently; new native-entrypoint regression now passes. Native API port 8787 is already served by an existing process, so the attempted duplicate start exited EADDRINUSE without affecting it. Real browser synthetic check-in `Patient 48e2f68f` declined consent, preserved originals through the disabled-summary fallback, completed and appeared in staff with the same answers. No camera/provider/device operation.
- Integration review in progress: plain anchor navigation can leave the SharedWorker without a document owner between check-in and Vision, losing session-memory enrollment. App will retain a single provider through local operator navigation after the vision owner stops. Current `StationVisionProvider` effect depends on mode and disposes its worker/client but retains the disposed adapter in state; this also needs a surgical transition regression/fix. Still leaving ACTIVE vision paths untouched.

- `POST /api/wr/questionnaire-summary {visitId,answers}` now implemented, result `QuestionnaireSummary` with `confirmed:false`. Current station, own active kiosk editor, or own current phone questionnaire editor only; rejects completed/expired/revoked/taken-over access, including after asynchronous generation. Explicit visitId must match current patient/kiosk lease; station observes that same editor lease. `createWaitingRoomServer` accepts injected `summarize(answers,signal)`; default remains disabled.
- `server/main.ts` wires real existing provider functions only through explicit server `WR_ENABLE_GEMINI=true` / `WR_ENABLE_ELEVENLABS=true`. Config requires corresponding key/model and voice fields; no secret values are logged. Merely having a key does not enable calls. No actual network provider operation was performed. Disabled Gemini can supply labeled factual fallback if explicitly enabled speech is configured.
- Patient session adds optional typed `contactMeasurement` containing only that active visit’s latest saved contact pulse; no room tracks or other patients. Completed session readback remains revoked. Public phone listener now rejects all staff/check-in/vision/gallery pages and private API/media/provider-audio routes before proxying.
- Vite uses `WR_PHONE_ORIGIN` for `import.meta.env.VITE_PATIENT_ORIGIN`, avoiding the previous QR/backend origin mismatch. Conflicting `VITE_PATIENT_ORIGIN` override fails startup. Existing project certificate/trust checks remain unchanged.
- Regression evidence: `npm run test -- tests/integration-config.test.ts tests/provider-http.test.ts` → 6/6 passed, RED→GREEN for new endpoint/authority/config behavior.

2026-10-24 — **module-ready checkpoint; stopped for main integration**. Exclusive ownership during this assignment: `apps/waiting-room/server/{http,store,ingest,detector,snapshot}.ts`, matching store/http/ingest/detector/patient-session tests, and this note. No other files edited. No new dependencies, workers, deployment, Git operation, deletion or device proof. Main may now integrate these files; this session is no longer writing them.

## Integration surface (frozen routes)

- Station `POST /api/wr/bindings` accepts `BindingBatch` v1, full source/run track snapshot; server aligns all times with authenticated clock service.
- Station `POST /api/wr/observations` accepts `{measurements,poses}` v1; return `{accepted,duplicates,rejected}`. Streams order independently; clients must await binding acceptance through window end.
- Station `POST /api/wr/requests/:id/acknowledge {requestId}` returns `CheckRequest`.
- Station `POST /api/wr/requests/:id/check {requestId}` returns `{request,referenceControl}`. Clients MUST apply the returned/GET-room generation through `resetPoseReference` before submitting new poses.
- `RoomSnapshot` v2 contains latest poses even without requests, reference controls, historical measurements and persisted request lifecycle. Stale values are explicitly null in current views; historical evidence remains immutable.
- Server exports: `createIngestService({store,clocks,now})` with `updateBindings(principal,body)`, `ingestObservations(principal,body)`, `getRoomSnapshot()`, `getObservationHistory()`, `buildAlertSnapshot(eventId)`, `acknowledge(eventId,requestId)`, and `markChecked(eventId,requestId)`. `reducePosture(state,observation,nowMs)` and `expirePosture(state,nowMs)` are pure. Main retains clock/shared/API/providers and transport wiring.

## Initial inspection

Existing SQLite visit/contact persistence and combined patient/kiosk sessions preserved. Initial scoped tests: 5 store tests passed; 25 HTTP tests could not bind loopback in sandbox (`listen EPERM`). Requested narrow loopback test permission. No implementation assertions inferred from that failure.

These initial gaps were reproduced and fixed: expired kiosk revokes linked phones/grants; completed kiosk session returns `{visit:null}` and only the original finish receipt retry; completed questionnaires reject new writes; join attempts are limited to 10 per 60 seconds per origin/address (429). Kiosk create retry IDs are now session-scoped, preventing a known public request ID from claiming another kiosk's visit. A new patient pairing revokes legacy phone/questionnaire sessions for that visit as well as old patient sessions.

## Integration notes from implementation

- Routes above are implemented. `createIngestService` is wired internally by HTTP. Provider owner can compose its `buildAlertSnapshot(eventId)` and current room version/eligibility checks; no provider HTTP routes were added in this lane.
- Request `trackId`/`identityEpoch` and `facts` record the original trigger. A safely reidentified visit can have a different **current** track in `AlertSnapshot.binding`; refreshed `event.location` and `snapshotVersion` follow that verified current visit. Staff selection/overlays should resolve the visit's unique current binding rather than requiring its track to equal the original event track. Mark checked returns a control for that current matched track, even after a genuine identity epoch/track change.
- A new epoch must not backdate before the prior track's last verification/closed boundary. Same epoch after loss/expiry is rejected; transport must start a fresh identity epoch. Empty binding snapshots close all source/run tracks. Binding heartbeat must remain within 1 second of last verification.
- Clock resync within one run preserves the original epoch's aligned start while aligning fresh verification/measurement times with the new valid sync. A new run cannot backdate into the previous run's interval. Bindings and observation windows use the combined clock uncertainty bounds; await sufficient binding coverage **beyond** an observation endpoint when uncertainty is nonzero. Otherwise the observation is rejected rather than assigned speculatively.
- `/check` both advances generation and sets a server-time lower bound: old-generation poses and pre-check frames relabeled with a new generation cannot supply the fresh reference. It clears the current visit's detector, including when that visit moved to another genuine track/epoch. Nurse actions never imply medical recovery.
- Client sends per-stream sequence allocation and schema-valid IDs (`[A-Za-z0-9_-]`, max 96). During inspection, sensing pose IDs used colons (`source:run:pose:seq`), which the frozen `idSchema` rejects. Main/sensing owner must normalize producer IDs; this lane does not widen shared schemas or edit sensing.
- Room measurement arrays retain original historical values, intervals and provenance. The existing `toDashboardView` suppresses stale/ineligible current numbers (including the valid-but-5,001ms-old case). `getObservationHistory()` also returns the originals; latest room poses are explicitly stale/unknown after 1 second. No fabricated measurement or patient is emitted by production code.

## Evidence and changed files

Changed only the 5 owned server files, `tests/{store,http,ingest,detector,patient-session}.test.ts`, and this note. Added native SQLite `check_requests` and `staff_actions` tables; existing visit/contact data stays intact. Pairing/camera identity/clocks/windows remain ephemeral. Restored open/acknowledged requests retain immutable facts but current binding/location becomes unverified and version advances; no pending speech is restored.

Final checks from `apps/waiting-room/`:

```sh
npm run test -- tests/store.test.ts tests/http.test.ts tests/ingest.test.ts tests/detector.test.ts tests/patient-session.test.ts
# 5 files passed; 72 tests passed; exit 0 (ephemeral 127.0.0.1 permission granted)
npm run typecheck
# exit 0, no diagnostics
```

A scoped TypeScript check of all owned server/tests also passed. Earlier whole-project typechecks caught in-progress foreign-provider/vision files; those diagnostics were resolved by their owners before the final check. No foreign files were fixed in this session. Whole-suite/build verification remains main's gate per `parallel-build.md`; this worker ran only owned tests. SQLite test databases remain recoverably retained under `apps/waiting-room/.local/test-runs/backend-P2A/`.

Red→green coverage includes 90-second source skew, independent streams, exact/conflicting retries, time reversal, overlapping windows, unknown visits/epochs, two-patient swaps, uncertainty/loss/backdating, retired runs, valid resync, clock expiry/future timestamps, invalid units/101 rows, phone role rejection, delayed historical freshness, pose visibility, exact 10-second reference/hold, >1-second gaps and timer expiry, synthetic/replay exclusion, immutable facts, stable 10-second provider context despite heartbeat/box jitter, location/identity/camera invalidation, persisted acknowledge/check/restart, current-track reidentification, generation rearm and kiosk/session/privacy cases.

## Remaining integration/device work

Main owns camera/clock observation transport, nurse selection/actions, provider routes/jobs and playback validation. The internal sensing service is ready for provider snapshot access when main resumes HTTP ownership. Sensor producer IDs must satisfy shared schemas. Preserve verified current binding/epoch and generation controls; do not send a latest-only measurement before full binding coverage is accepted.

No camera or phone was opened, no model accuracy/actual enrollment/pulse/breathing/combined-load measurement or provider/speaker call was tested here. Unit and local HTTP tests establish module behavior only. Face model licensing/calibration, actual-device signal quality, HTTPS reachability, full live nurse flow and audible delivery retain their separate acceptance gates.
