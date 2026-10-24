# Facial Camera Pulse Implementation Plan

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Estimate pulse from a stable tracked face without fabricating measurements in poor conditions.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** Classical POS, timestamped RGB, TypeScript/Vitest.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex rPPG worker. **Dependencies:** P1-A1 for pure tests; P3-A for real BoundFrame; clock service for submission.

**Scope boundary:** client/runtime/rppg.ts, tests/rppg.test.ts. Return device notes to integrator, the sole writer of docs/device-proof.md/ledgers. No camera acquisition/identity/event changes.

**Pre-flight:** Consume bound frames only. Use published POS method rather than a model trained from scratch. Never treat check-in pulse as a permanent offset or infer pulse from breathing.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P3-C1 — POS signal and window quality

**Interfaces:** `estimateCameraPulse(samples:TimedRGB[]):PulseEstimate` and `createCameraPulseRuntime(context,emit):SensorRuntime`; runtime samples landmark-defined cheeks/forehead excluding eyes/mouth from bound faceSkin and emits camera-pos Measurement only within one eligible identity epoch. No claim of universal skin-color segmentation.

- [ ] DSP tests: 30s RGB fixture with 1.2Hz component -> 72±2 BPM; <30s, flat, >=5% channel saturation, abrupt light step, >200ms gap or insufficient actual cadence -> null. Add illumination-only and harmonic-confusion fixtures. Runtime/image tests separately push BoundFrame sequences with identity discontinuity, stale metadata, invalid ROI and excessive head motion; assert buffer reset/null, not an impossible inference of identity from RGB alone. Run `npm run test -- tests/rppg.test.ts` red.
- [ ] Implement POS following temporal RGB normalization, projections `G-B` and `G+B-2R`, std-ratio mixing, and overlapping 1.6s subwindows. Use 30s usable trace, timestamp resampling to 30Hz, 0.7–3Hz band and spectral peak interpolation; require actual cadence >=15Hz and peak/noise >=3 with units/formula in contracts. Require all channels <5% saturation and per-frame face displacement/delta-time <0.75 face widths/second; this is a prototype motion gate, not clinical calibration. Missing/uncertain/expired association resets the buffer. Use the pinned reference POS code in device-experiments.md, not a similarly named invented formula.
- [ ] Emit estimates about every 2s after sufficient data, with window interval, quality metrics, method/source/epoch, and null values during invalid/collecting/stale state. Never keep last BPM looking live while moving. Run DSP tests/typecheck.

**Flow check:** local frame/ROI means -> POS -> Measurement -> ingest; no raw frame upload, new camera, or provider call. E3-P3C1-TEST1/DIFF1.

## P3-C2 — stationary reference comparison

- [ ] Run 3 stationary 30s attempts with real face video and independent simultaneous pulse reference if available. If phone is the only comparison, label agreement separately and document its own uncertainty. Keep attempt count and rejected windows.
- [ ] Target <=10 BPM absolute error and >=2/3 usable attempts. Turn head/move/occlude/change light and verify rejection/identity-window reset. Record framing, actual FPS, ROI pixels, lighting, timing, reference, errors, latency, and usable rate.
- [ ] Verify rendered values/quality/window timestamps in staff detail, not just console output. E3-P3C2-DEVICE1/UI1; update measured benchmark. Failure leaves rPPG acceptance incomplete and the value unavailable, never a synthetic backup.

**Acceptance levels:** module-ready = DSP and runtime/image tests/typecheck; integrated = P5 display/transport proof; device-validated = AC-05 stationary estimate + controls and fresh holdout comparison. P5 consumes module-ready code; its UI proof is not a prerequisite to integrating this packet. No clinical validation, stress detection, or 100-person claim.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(estimateCameraPulse(rgb72Bpm30s).bpm).toBeCloseTo(72, 0);
expect(estimateCameraPulse(flatRgb30s).bpm).toBeNull();
```
