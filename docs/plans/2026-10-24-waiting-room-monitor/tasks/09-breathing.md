# Camera Breathing Implementation Plan

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Estimate respiratory rate from visible torso movement as a separate quality-controlled channel.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** Local torso patch motion, classical filtering, TypeScript.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex respiration worker. **Dependencies:** P1-A1 for tests; P3-A/B for torso bounds and quality.

**Scope boundary:** client/runtime/breathing.ts, tests/breathing.test.ts. Return device notes to integrator, sole owner of docs/device-proof.md/ledgers.

**Pre-flight:** Consume bound selected torso only. Need sufficient image texture/visible chest motion and stationary body; no inference of heart rate from respiration. No model training, microphone, radar, or video upload.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P3-D1 — motion trace and respiratory estimate

**Interfaces:** `estimateBreathing(samples:ScalarSample[]):BreathEstimate` and `createBreathingRuntime(context,emit):SensorRuntime`; torso bounds derive from the same selected track's fresh pose. No independent identity guess. Runtime extracts image quality/trace; DSP accepts scalar displacement in pixels and cannot infer texture or identity.

- [ ] DSP tests: 45s 0.25Hz scalar displacement -> 15±1.5 breaths/min; <45s, flat, unsupported dominant frequency, >200ms gap and slow linear drift -> null. Runtime tests separately supply image sequences with low texture, brightness changes, subpixel sinusoidal translation, ROI jitter, gross movement, stale pose or changed identity; assert quality/reset. Run `npm run test -- tests/breathing.test.ts` red. A scalar sine test is not an image-acquisition test.
- [ ] Prototype extraction: 3x3 grid of 24px patches in the selected torso, integer ±4px normalized cross-correlation search between successive frames plus three-point parabolic refinement around an interior correlation peak for subpixel displacement. Reject search-boundary/flat peaks. Pixel luminance is 0..1; require patch standard deviation >=0.02, NCC >=0.8 and best-vs-other-local-peak margin >=0.05. Require >=5 valid patches, use median vertical displacement, integrate and detrend. These initial engineering gates need D3 evidence, not claimed validation.
- [ ] Hold patch anchors in image coordinates within a window; compensate ROI-coordinate changes explicitly rather than counting crop jitter as breathing. Reset when anchors leave the usable torso, identity/pose metadata expires, or gross pose/global image motion appears. Test <1px oscillation recovery and moving ROI with a static source image; the latter must not manufacture breaths. If this method cannot separate ordinary respiration from drift on the actual camera, stop and revise the extraction plan with evidence before building around it.
- [ ] Use contiguous 45s trace, actual cadence >=15Hz, timestamp resampling at 15Hz, 0.1–0.6Hz band, periodic peak estimation and peak/noise >=3 per contracts. Reject unsupported rates rather than label safe. Emit camera-torso-motion Measurement every ~2s after sufficient data, with texture/NCC/gap metrics. A separate buffer/quality state is required even when rPPG is usable.
- [ ] Run tests/typecheck and actual visible-chest trace check. E3-P3D1-TEST1/DEVICE1. Flow: camera torso -> local displacement -> breathing observation; no DB inside estimator.

## P3-D2 — real breathing comparison

- [ ] Collect 3 stationary 45s attempts with synchronized timed observer counts or a separately consented short reference recording; raw recording is optional and must not be silently persisted. Reference breaths/min = counted breaths *60/45; document boundary-count uncertainty.
- [ ] Target <=3 breaths/min error and >=2/3 usable attempts. Test posture adjustment/gross movement, hidden torso, and low texture; invalid windows must become unavailable with reason. Do not ask for breath-holding/hyperventilation.
- [ ] Verify staff display labels/quality/windows; record camera distance, torso pixels, clothing/texture, measured FPS, usable rate/error. E3-P3D2-DEVICE1/UI1. A failed method remains explicitly incomplete; no pulse-derived or invented replacement.

**Acceptance levels:** module-ready = scalar DSP plus image/runtime quality tests; integrated = P5 display/transport; device-validated = AC-06 real camera estimate with manual reference and movement controls. P5 starts from module-ready outputs, not its own downstream proof. Run acquisition probe early and separate calibration from holdout attempts.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(estimateBreathing(displacement15Bpm45s).breathsPerMin).toBeCloseTo(15, 0);
expect(estimateBreathing(flat45s).breathsPerMin).toBeNull();
```
