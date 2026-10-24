# Phone Fingertip PPG Implementation Plan

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Capture real contact PPG on one phone and save a quality-controlled pulse to its paired visit.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** Browser MediaStream/canvas, TypeScript, classical DSP.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex sensing worker. **Dependencies:** P1-A; save proof additionally requires P2-A.

**Scope boundary:** Only client/phone/{PhonePage.tsx,capture.ts,ppg.ts}, tests/phone-ppg.test.ts, tests/ui/phone.test.tsx. Return device notes to integrator; integrator alone writes docs/device-proof.md and canonical ledgers. Request API/contract changes through integrator. P5 imports the phone page, never concurrently edits its test file.

**Pre-flight:** Use designated phone; verify rear-camera/torch capabilities, camera permission, HTTPS and illumination before promising it. Consent required for actual finger acquisition. No AI provider, extra sensor, or app-store app. Data locally processed; derived result only.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P1-B1 — capture and safe phone UI

**Interfaces:** `startPhoneCapture(video,onSample)` -> async stop handle; api.ts supplies api.join/api.createCapture/api.completeCapture/api.cancelCapture; a capture retains its original visitId/captureId even when UI selection changes.

- [ ] Write lifecycle tests: denied camera, no torch, failed applyConstraints, stop/unmount/error all release tracks/torch; hidden tab interrupts capture; duplicate finish does not submit twice. UI shows collecting/unsupported/retry, never a placeholder BPM. Run `npm run test -- tests/ui/phone.test.tsx` expecting missing implementation.
- [ ] Implement rear camera selection and capability/settings inspection; request torch and verify on the actual device. Capture central 40% ROI channel means with monotonic timestamps at target 30 samples/s; stop after at most 60s. Do not assume permission or browser feature support. Use gentle finger placement and an immediate stop control.
- [ ] Exclude first 2s settling; require a contiguous eligible 30s interval. Gaps >200ms, tab backgrounding, or coverage loss reset the unfinished signal window rather than concatenating discontinuous data. Torch stops at finish/cancel/error/unmount.
- [ ] Run lifecycle tests/typecheck; on actual phone verify visible illumination, real waveform response to finger on/off, interruption, and stop. Record phone model/browser, secure origin, measured frame intervals, attempt duration, and unsupported cases. Do not expose certificate/key contents.

**Flow check:** paired phone -> permission/torch -> real frame means -> local waveform/progress; capture token stays immutable. Until P2-A, use clearly synthetic pairing fixtures for software tests only.
**Acceptance:** real-device capture works or specific blocker remains recorded; unsupported flow never claims pulse. E1-P1B1-TEST1/DEVICE1/UI1; update phone capture status only.

## P1-B2 — pulse extraction and paired saving

**Interfaces:** `estimateContactPulse(samples:TimedRGB[]):PulseEstimate`; generate Measurement with method `phone-camera-contact-ppg`, provenance live_phone, server captureId and clock sync. No room identity epoch required for the paired phone.

- [ ] Add deterministic DSP tests: 30s timestamped 1.2Hz fixture -> 72±2 BPM; irregular sampling within cadence/gap bounds remains in tolerance; flat, all candidate channels >=5% saturated, <30s, >200ms gap, low periodicity and unsupported dominant frequency return null BPM. A clipped red channel with usable green is not rejected solely for red. Use normalized RGB/per-channel saturation and peak/noise definition in contracts. Test no-finger/coverage/movement separately with capture-image sequences and actual phone controls; a periodic RGB array alone cannot prove a finger is present. All fixtures explicitly synthetic. Run `npm run test -- tests/phone-ppg.test.ts` before implementation.
- [ ] Select the highest usable periodic unsaturated RGB channel from the same capture, detrend, resample to 30Hz using actual timestamps, band-limit 0.7–3Hz, estimate spectral peak with interpolation and beat-interval agreement. Require peak-to-noise ratio >=3 and >=80% beat intervals within ±20% of median; expose these engineering gates in metrics. No valid peak outside 42–180 BPM is reported as safe/normal; report unsupported/unavailable. No training.
- [ ] Render derived waveform and quality; submit only a usable completed reading to `/captures/:id/complete`. On failure show unsaved with explicit retry bound to original capture, not current visit. Cancelled/repaired capture cannot complete. Store only summary/metrics by default; bounded derived waveform is for local display, not raw-video upload.
- [ ] Exercise offline retry after sync expiry using the capture's original server-retained mapping, including duplicate committed completion, capture expiry and service restart. Never change measurement timestamps to make it fresh or reassign visit. New capture after expiry is explicit. Freeze settings after calibration, then record all three fresh holdout attempts from device-experiments.md D3.
- [ ] Run phone DSP/UI tests/typecheck. Complete 3 stationary attempts with simultaneous reference if available, plus no-finger/movement controls; target <=5 BPM error and >=2/3 usable attempts, reporting every attempt and reference limitations. Confirm automatic save -> staff visit -> reload; swapping visits midcapture never misassigns it. Device target failure stays incomplete.

**Flow check:** actual finger -> local trace/DSP -> bound API write -> staff read/reload. In-memory synthetic unit tests; retained device notes only, no raw finger video by default.
**Acceptance levels:** module-ready = DSP/lifecycle/transport-adapter tests; integrated = save/read/reload via P2-A and thin P5; device-validated = actual phone targets and controls. P5 consumes module-ready code before final device/UI proof, so no circular dependency. E1-P1B2-TEST1/DEVICE1/UI1; integrator records only evidence actually obtained.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(estimateContactPulse(samples72Bpm30s).bpm).toBeCloseTo(72, 0);
expect(estimateContactPulse(flat30s).bpm).toBeNull();
expect(estimateContactPulse(samples29s).quality).not.toBe('usable');
```
