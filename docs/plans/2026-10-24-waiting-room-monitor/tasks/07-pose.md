# Pose and Activity Observations Implementation Plan

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Produce quality-controlled posture features for the deterministic event service.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** MediaPipe Pose Landmarker Lite VIDEO, TypeScript.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex pose worker. **Dependencies:** P1-A1; local model manifest P1-A2; real frame/identity path P3-A.

**Scope boundary:** client/runtime/pose.ts, tests/pose.test.ts. No event service/UI/shared types edits.

**Pre-flight:** Selected single-person camera region; shoulders/hips/nose and sufficient leg geometry visible for seated assessment. Missing visibility stays unknown. The UI thread must remain responsive; bounded cadence or worker through the integrator scheduler.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P3-B1 — pose/association and movement quality

**Interfaces:** `extractPose(frame,control,context):Promise<PoseFrameResult>` and `resetPoseReference(control)` from contracts; exports local feature helpers only for this file/tests. Return source-time observation plus torso bounds/poseMotion tagged to the inference frame. The central scheduler may cache eligible pose metadata, never pretend it is new inference on every sampled frame. Default numPoses=1 applies only to the selected unambiguous person's region, not a crowded room.

- [ ] Test missing landmarks, visibility <0.7, multiple candidate people, wrong identity epoch, and large torso movement -> no usable seated evidence. A synthetic upright stationary sequence is usable. Run `npm run test -- tests/pose.test.ts` red.
- [ ] Compute shoulder midpoint/width, torso vector, head-to-shoulder displacement normalized by shoulder width, and median shoulder/hip movement per second. Pose geometry must support seated state (visible hips/knees with bent legs); otherwise seated=null, not a guess from pulse. Mark gross body translation >0.15 shoulder-widths/second moving. Head droop alone does not become walking; activity is stationary/moving/unknown.
- [ ] Verify feature tests and real camera framing. More than one subject candidate or insufficient geometry yields unknown, with reason visible via observations. E3-P3B1-TEST1/DEVICE1. Flow: bound frame -> model landmarks -> structured pose; no DB/provider call in helper.

## P3-B2 — personal reference and relative slump

**Interfaces:** pose owns reference feature values and referenceReady; P2-B owns timed request lifecycle. Pose publishes explicit quality/activity/seated/qualifyingSlump and source timestamps; it never creates requests itself.

- [ ] Test usable upright reference <10s not ready, >=10s ready; normalized head descent >=0.12 shoulder widths or torso-angle change >=15° relative to median reference qualifies only with stationary/seated/usable binding. Gap >1s, moving, ambiguity, or changed epoch resets unfinished reference/candidate feature state. Run red.
- [ ] Implement prototype feature thresholds. Invalid observations break unfinished reference continuity; never skip elapsed missing time into a 10s reference. `resetPoseReference(control)` clears feature history on new server generation/epoch. Include referenceGeneration on every pose; no matching control means no arming. Expose thresholds/features and collecting/ready reference state; no fatigue/unconsciousness label or clinical meaning for angles.
- [ ] Add reset round-trip test with fake server: checked response generation 2 → runtime reset → old generation 1 packet rejected → 9,999ms new reference not ready → 10,000ms ready. Repeated polling of generation 2 must not continually reset it. Verify current posture/activity visible without any event and stale after >1s.
- [ ] Run pose tests/typecheck. On the actual subject, collect reference and exercise brief posture adjustment, face-visible gradual slump, standing/moving, and missing landmarks. Feed resulting observations to P2-B and verify 10s hold there, not duplicated here. E3-P3B2-TEST1/DEVICE1; record if model geometry cannot meet the gate.

**Acceptance:** interpretable posture/activity evidence with real quality failures; timing remains in one service. Real participant demonstration may reveal thresholds/framing unsuitable; revise with recorded evidence, not silent per-demo shortcuts.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(poseAfter9999ms.referenceReady).toBe(false);
expect(poseAfter10000ms.referenceReady).toBe(true);
expect(poseWithMissingHips.quality).not.toBe('usable');
```
