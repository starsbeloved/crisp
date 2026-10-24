# Integration and Demo Verification Implementation Plan

**Revision gate:** Codex-only. Read [scope-amendment.md](../scope-amendment.md) and the [patient and nurse journeys](../../../superpowers/specs/2026-10-24-self-check-in-revision-design.md). TemperatureScenario/TemperatureCard integration and old AC-15 are retired; no temperature input/card/default/provider/speech. No Lovable/Antigravity import. Current code/schema still needs coordinated migration, not isolated removal. After review and interface freeze, acceptance must follow BOTH journeys: patient creates and completes the intended visit across kiosk/phone, then nurse selects that same visit/track, inspects the triggered evidence, acknowledges, checks and marks checked. Add the proposal's two-visit, takeover, permission, unavailable-signal, stale-audio, failed-save, kiosk-reset and one-camera tests. Component renders or mock-only data do not prove this path. Earlier conflicting instructions below are historical.

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Connect every lane into the real one-patient journey and report exact acceptance.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** Full local app and device/browser/API verification.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex integrator only. **Dependencies:** Relevant packet **module-ready** outputs + manifests. Do not wait for a packet's P5-dependent UI proof before integrating it; full acceptance separately requires all live sensing/provider paths.

**Scope boundary:** client/{App.tsx,styles.css}, runtime/{api.ts,frame-bus.ts,inference.worker.ts}, shared/view-model.ts, check-in/{CheckInPage.tsx,QuestionnaireForm.tsx,QuestionnairePage.tsx}, staff/StaffPage.tsx, operator/{SeatEditor.tsx,TemperatureScenario.tsx}, tests/integration.test.ts, tests/ui/{check-in,staff,dashboard}.test.tsx, tests/frame-bus.test.ts, docs/{demo-runbook.md,device-proof.md}; coordinated provider/route integration only. Packet 02 alone owns tests/ui/phone.test.tsx; P5 runs it and requests changes via that owner. Integrator alone edits combined device-proof notes/ledgers.

**Pre-flight:** Review incoming diffs/imports before merging. Preserve approved UI and old source. Same camera stream for sensing/live display; PPG phone separate. Operator controls separate from clinical staff evidence. Isolated synthetic test records retained; no uncontrolled real records/uploads.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P5-A1 — check-in and phone containers

Start thin containers after relevant module-ready P2-A/P3-A outputs, before final Lovable/Antigravity presentation. A minimal honest rendering is an integration harness, not a claimed finished dashboard. Use the same runtime/containers for the final design; do not build a parallel disposable app.

- [ ] Write UI/API tests: create visit -> face enroll -> three questions -> proposed/confirmed summary -> phone pair -> real/synthetic test capture result -> reopen same visit. Wrong pairing, old capture, provider failure, and second visit cannot mix information. Use exact routes/contracts, not hand-built UI-only records. Run `npm run test -- tests/integration.test.ts tests/ui/check-in.test.tsx tests/ui/phone.test.tsx` red.
- [ ] Implement Codex-owned form validation/state/confirmation and API container, mounting only supplied presentation atoms. Original answers readable if Gemini unavailable. Show unsupported phone or unverified face enrollment separately; never auto-complete missing gates. Use visit codes in both station/phone confirmation.
- [ ] Keep one persistent station camera runtime above views; switch enrollment → room mode explicitly, with new windows/reference after reposition. Build QuestionnairePage for the scoped questionnaire purpose with no camera access, plus a QR/link to the phone-accessible HTTPS page and manual short-code join. QR contains navigation only, not a session token. Integrator pins one small QR encoder if needed in P1-A; do not hand-roll QR or delegate forms to UI tools. Test phone questionnaire cannot read other visits or invoke PPG capture endpoints.
- [ ] Run tests/typecheck/build; actual phone save -> station read -> reload proves full path. E5-P5A1-TEST1/UI1. Data writes go only to intended visit; no mocked result replaces live phone proof.

## P5-A2 — staff live video, selection, trends, requests

**Interfaces:** `toDashboardView(snapshot,selection)` from shared/view-model.ts; DashboardView receives complete props/callbacks/videoSlot, no data interpretation inside Lovable component.

- [ ] Test selecting request maps to correct visit/track; uncertainty doesn't open another patient; ack/check persists; null readings break trends; expired/stopped video not labeled live; provider/audio status independent; keyboard selection/actions work. Test 1280x800 and 390px layouts with actual shell.
- [ ] Wire same room stream into videoSlot, calibrated overlays, source quality/times, current vs assigned location, and event lifecycle. Use 1s room polling with generation/revision guard so out-of-order responses cannot revert state; cancel on unmount. Pair live local stream watchdog with service status, never claim the backend supplies remote live video.
- [ ] Wire ReferenceControl reset and current pose/activity display before an event. Test checked → new generation → old pose rejected → new reference; show collecting, never silently reuse the old reference. Render original answers, measurement intervals, action pending/errors, provider failures and null trend gaps using ui-plan.md.
- [ ] Integrator owns independent capture/inference scheduling and worker message adapters; functions/DOM objects are not transferable, so instantiate model/context adapters in their execution realm and send only serializable metadata plus transferred bitmap. Test slow inference, immutable frame lifetime, stale metadata, cross-stream ordering and binding-before-window submission. Then measure actual combined load in D2, including live UI.
- [ ] Wire audio updateSnapshot/invalidateLocal, cancellable Audio adapter, reload dedup, enable/mute/test tone, and server last-second eligibility checks. Test location change and acknowledgement during real or controlled delayed playback; a test of queued-audio suppression alone is insufficient.
- [ ] Review Lovable export for APIs/hooks/packages/derived clinical copy and Antigravity atoms for unexpected logic; integrate only allowed files. Run UI/integration tests/typecheck/build, and observe actual live feed -> matched person -> selected record -> sustained slump -> visible request -> Gemini explanation -> ElevenLabs speaker -> acknowledge/check.

**Acceptance:** AC-09/13; no duplicate camera/event engine; labels, measured values, provider failures preserved. E5-P5A2-TEST1/UI1/DIFF1.

## P5-A3 — optional seats and temperature scenarios

- [ ] Test assigned B4 while actual region C2 -> show both and announce C2; no verified current region -> uncertainty. Test enabling 38°C scenario sets persistent banner/per-value simulated labels in UI/history/Gemini and any speech; disabling restores “Not measured,” not 37. Scene/visit switch cannot carry another person's fixture. Run tests/ui/staff.test.tsx and integration tests red.
- [ ] Implement Codex-owned SeatEditor and TemperatureScenario operator controls and scenario route/store history. Scenario overlay stays separate from live timeline and detector inputs. Do not add fever triggers or real SpO₂/temperature acquisition. Use Antigravity TemperatureCard only with already prepared props/labels/tone.
- [ ] Verify DB write -> reload/history -> correct labels and context; clearing active overlay retains labeled history. Run tests/typecheck/build and screenshots for live-only and mixed-mode scenario. E5-P5A3-TEST1/UI1; AC-14/15.

## P5-B1 — required automated and adversarial gates

- [ ] Run `npm run test`, `npm run typecheck`, `npm run build` inside the app. From workspace root rerun legacy `npm test` and report its known missing-http failure separately; do not repair or hide ECHO during this scope. If new code causes another failure, return to the owning task.
- [ ] Execute AC-01..15 matrix, including second-person/occlusion/seat changes, delayed clocks/network, frozen stream, low-quality phone/rPPG/breathing, AI failure/instruction-like questionnaire, stale audio, and synthetic provenance. Record exact test/device evidence for each criterion; mocks count for behavior only, not live sensing/provider proof.
- [ ] Confirm no secrets/raw face/video sent to providers or committed/exported into UI; inspect actual request shapes without printing credentials. Check provider snapshots contain only allowed facts. UI remains usable on camera/provider failure.

**Acceptance:** AC outcomes recorded passed/failed/not-run with exact reason and proof; required failure prevents full-completion claim. E5-P5B1-TEST1/UI1/DIFF1.

## P5-B2 — measurement and rehearsal

- [ ] Follow master-plan predeclared phone/rPPG/breathing targets with three attempts each, count all usable/rejected attempts, compare reference windows synchronously, record actual errors/FPS/latency. Do not induce unsafe physiology; ordinary stationary breathing and acted face-visible slump suffice.
- [ ] Run D1–D4 in device-experiments.md. Freeze thresholds after calibration, then collect fresh holdout attempts without deleting failed runs. Measure overlapping phone/rPPG agreement separately from independent reference error. Check simultaneous face/torso/leg framing and combined compute, not three isolated algorithms at incompatible camera distances.
- [ ] Rehearse complete journey once live: enroll -> answer -> phone pulse -> wait/live recognition -> brief adjustment/no request -> >=10s slump/one request -> explanation/voice -> staff action -> identity or stream failure. Optional 38°C scene is explicitly separate/labeled.
- [ ] Extend rehearsal through restart/reload, two visits, new-reference rearm and unknown-person entry. Verify the actual displayed patient/track/evidence after each transition, not just event counts. Record Gemini accepted versus fallback counts and real speaker success separately; record unchanged physiology during slump without manufacturing a change. Include 200% zoom, keyboard actions and UI performance under active sensing.
- [ ] Write docs/demo-runbook.md with exact startup commands, secure phone URL setup, model manifest, camera framing, consent/permission steps, reference method, expected screens, restart reenrollment, failure recovery, and which features actually passed. Refresh status/evidence/benchmarks, review changed files and all acceptance against spec.

**Acceptance:** working portions demonstrable and limitations explicit. Full completion requires all required acceptance including real sensor/provider proof; no final claim from static fixtures. E5-P5B2-DEVICE1/UI1; actual measured benchmark rows only. P5-C/D/E final review/Trash-only dead-work review/closure follow master plan; no deletion to make checks green.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(savedReading.visitId).toBe(originalPairedVisit.id);
expect(renderedTemperatureSource).toBe('Simulated — not measured');
expect(liveOnlyTemperature).toBe('Not measured');
```
