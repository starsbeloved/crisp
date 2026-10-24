# Camera Runtime and Enrolled Identity Implementation Plan

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Show live video and attach observations only to the correctly enrolled visit.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** Browser MediaStream/canvas, pinned Human face models, TypeScript.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex identity worker. **Dependencies:** P1-A1 interfaces; approved/hash-pinned face weights from P1-A2 before model use; P2 for service binding.

**Scope boundary:** client/runtime/{camera.ts,identity.ts}, client/check-in/FaceEnrollment.tsx, client/staff/video-overlay.ts, tests/identity.test.ts; integrator owns frame-bus/config/assets.

**Pre-flight:** Use consenting demo people only. One room camera owner; no upload. Face descriptors remain memory/session-local. Unknown people and low confidence must be represented explicitly. Calibrate on actual enrolled/unknown volunteers; fail closed when distributions overlap.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P3-A1 — live frame owner and video coordinates

**Interfaces:** `startRoomCamera(video,onFrame)` and FramePacket from contracts; the integrator's frame bus delivers frames to identity/pose/physiology consumers. Video element belongs to Codex, passed as videoSlot to DashboardView.

- [ ] Test permission failure, stop/unmount, video stall, and coordinate transform for contain/letterbox plus optional mirror. Test a normalized rectangle transforms to the actual displayed image bounds rather than the full container. Run `npm run test -- tests/identity.test.ts` red first.
- [ ] Implement camera acquisition against the integrator-owned frame-bus/worker scheduler. Capture/ROI sampling is not serialized behind identity/pose inference. Use immutable bitmap snapshots and lifetime rules, cached metadata stamps/age gates, and late-result rejection exactly as contracts.md. Targets are identity 5Hz, pose 10Hz, sampling 30Hz with >=15Hz actual usable cadence; D2 measures them together. Drop work rather than queue stale frames; last decoded frame >1s old marks video stale. Promise alone does not move synchronous inference off the UI thread.
- [ ] Test one persistent foreground station stream across check-in/monitor mode changes; hidden tab, reposition or stream restart resets signal/reference continuity. No independent camera request from StaffPage or a second station tab. A held bitmap must not change as the source video advances; dispose all temporary frame/worker copies.
- [ ] Show live local video and correctly aligned overlays; stopping stream changes label within 1s. Run identity tests/typecheck/build and actual permission/stall UI checks. E3-P3A1-TEST1/UI1; camera missing -> correct only with live proof.

**Flow check:** camera permission -> frames -> local video/overlay; no DB or provider upload. Old frame never labeled current.
**Acceptance:** single owner, monotonic frame time, stop behavior and overlay alignment proved.

## P3-A2 — enrollment, calibration, matching, identity epochs

**Interfaces:** `enrollFace(visitId,frames)` and `identifyFrame(frame):Promise<BindingInput[]>`; integrator assembles BoundFrame and sends clocked BindingBatch via api.updateBindings. Keep faceSkin ROIs separate from torso and record inference-frame timestamps rather than stamping cached results current.

- [ ] Write matching tests: one enrolled descriptor recognized; unknown rejected; near tie uncertain; track lost/new source/occlusion/reassignment increments identityEpoch and clears signal histories; visit never selected by seat. Add a test for entering unknown second person while first is tracked. Run red.
- [ ] Use locally hosted licensed/hash-pinned Human detection/descriptor assets. Enrollment requires one usable face and >=3 distinct captures; reject multiple faces. Collect genuine/unknown similarity samples. Set threshold midway between min genuine and max unknown only if separation >=0.10; otherwise calibration fails. Require winner margin >=0.10 and 3 consecutive eligible matches before confident attachment. Record these as demo engineering rules, not identity probabilities.
- [ ] Track continuity with descriptor agreement and bounding-box continuity; if confidence cannot be maintained, mark uncertain and change epoch. Do not invent person tracking through an occlusion. Publish patient-specific BoundFrame only for one matched subject; multiple/ambiguous candidates invalidate physiological association. A face-visible seated slump is the initial demo motion.
- [ ] Test metadata expiry during a slow model call, occlusion/large ROI motion between inference frames, delayed result from a previous epoch and empty active-track batch. Fail closed on expired/unverifiable association; invalidation resets buffers before a new eligible window. Record detection latency honestly; cached metadata is not proof that an unseen entrant cannot appear between checks. A separate held-out unknown/reappearance test follows calibration.
- [ ] Implement optional configured seat rectangles and observed region labels. Assigned seat remains separate. Test moved seat, unknown seat occupant, and overlap/uncertain regions. Run tests/typecheck and actual two-person recognition/unknown/reappearance test. Record calibration samples/counts, false assignments, device/framing, model hashes; do not save actual face descriptors in ledgers.

**Flow check:** check-in visit selection -> local enrollment -> room face match -> Binding -> patient/track display; backend receives binding metadata, not descriptor/video. Restart requires reenrollment.
**Acceptance:** AC-02/03/14 behavior; unknown/uncertain never borrows another visit. E3-P3A2-TEST1/DEVICE1/UI1. Face descriptor licensing or calibration failure stays an explicit blocker, never seat-only substitution.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(unknownBinding.visitId).toBeNull();
expect(ambiguousBinding.state).toBe('uncertain');
expect(bindingAfterLostContinuity.identityEpoch).not.toBe(bindingBeforeLoss.identityEpoch);
```
