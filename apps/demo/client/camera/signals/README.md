# P3 signal tracker

Pure TypeScript; no DOM, models, network, provider calls, or dependencies on the historical app.
`index.ts` preserves the P0 `createSignalTracker()` interface.

## Input contract for P2 / integrator

- One tracker per recognized track/visit. **All `t` values and `read(now)` use the same millisecond clock.**
  Replay should use video time in milliseconds, consistently for both pushes and reads.
- `FaceSample.rgb` is mean cheek RGB on the **0–255 scale**. Brightness is also 0–255.
  P2 owns skin-ROI sampling; this module never reads an image.
- Pose landmarks use MediaPipe indices (nose 0, shoulders 11/12, hips 23/24), normalized x/y,
  visibility 0–1. Supply landmarks for this person only. Other landmarks are not required.
- Push each frame and read at about 1 Hz (or faster for display). Estimates refresh at most once a second.
  Samples with duplicate/backward timestamps are ignored. A gap over 1 s restarts collection and counters;
  reads over 1 s after the last sample return null, never a stale number.
- Call `reset()` on identity reassignment, replay seek, or Mark checked. It clears all data and the pose reference.
  The frozen API has no reset event subscription; P2/P8 must wire this call.

## Heart rate and waveform

The POS projections/overlap-add and numerical helpers adapt the older `sensing/rppg.ts` and `dsp.ts`.
Window: 10 s; resample: 30 Hz; POS subwindow: 1.6 s; Hann-windowed FFT; band: 0.7–3 Hz.
The input cadence must be at least 10 Hz; interpolation cannot restore undersampled physiology.
The first numeric HR needs 10 s. `hrSecondsCollected` reports contiguous elapsed seconds capped at 10.

Outlier RGB is detected with a robust four-sigma local deviation and interpolated between good samples.
A window with over 20% bad samples, an unbridgeable bad run over 500 ms, insufficient data, flat signal,
or a dominant out-of-band oscillation is rejected. Dark/small current faces withhold estimates immediately.

**Final prototype quality thresholds:** peak-lobe power divided by remaining in-band power:
`good >= 2.0`, `fair >= 1.0`, otherwise `low`. The peak lobe is the Hann main lobe, ±1.5 natural frequency bins.
The same thresholds apply to respiration. These values are checked on synthetic data only;
they have **not** been tuned or validated on a live webcam or UBFC recording.
Smoothing uses the median of the last five accepted estimates. A change over 25 bpm is withheld until
consistent (within 10 bpm) for at least 3 s; then the median history restarts at the observed new rate.

`pulseTrace` is a windowed-sinc FIR band-passed POS signal, the latest up to 6 s resampled to 60 values
and normalized to −1…1. It can appear after 5 s if its spectrum is usable; it is null with low quality.
No periodic wave is synthesized from the heart-rate number.

## Breathing and posture

Breathing uses shoulder midpoint y divided by shoulder width, detrends, resamples at 15 Hz,
and finds a spectral peak in 0.1–0.7 Hz. Window: up to 30 s; first result after 20 s. Gross pose motion
restarts breathing collection. Breathing never consumes face RGB or HR.

Posture learns median torso angle and nose-to-shoulder offset during the first 10 s of stable visible
upright pose. A reference is retained over ordinary occlusion; `reset()` relearns it.
There is no seated classifier in this packet: the reference assumes the patient starts seated.
Coordinates are normalized; the frozen input contains no frame aspect ratio for pixel-space correction.

- Slump: torso angle change >= 15° or head descent >= 0.12 shoulder widths.
- Head drop: nose below shoulder midpoint.
- Stillness: mean motion of nose/shoulders/hips < 0.003 normalized units per nominal 30 Hz frame,
  corrected for actual elapsed time.
- Fall-like motion: shoulder/hip center drops > 0.25 frame height within 1 s, with both centers descending;
  or hips cross the bottom edge while shoulders descend > 0.12. Observed fall flags remain for 1.5 s
  so a ~1 Hz observer can send the event. This is a motion cue, never a diagnosis.
- Recovery/occlusion clears continuous counters. A 3 s bend cannot reach 10 s slump duration.

Hints: brightness < 50 → `too dark`; face width < 90 px → `move closer`; a rapid >4% width change or >8%
brightness change → `hold still` for 500 ms. Width/brightness are **proxies**: `FaceSample` has no face
coordinates, so pure sideways translation cannot be detected from this interface.

## Verification and offline CSV

From `apps/demo`: `npm test` and `npm run typecheck`.

```
node scripts/ubfc-eval.ts /path/to/samples.csv
node scripts/ubfc-eval.ts /path/to/seconds.csv --seconds
```

CSV header: `t,r,g,b,refBpm`; times default to milliseconds, RGB 0–255. Blank reference values are allowed.
The CLI evaluates at ~1 Hz and prints MAE only for actual estimate/reference pairs and their count.
It does not download UBFC. A no-reading result prints `MAE: unavailable`, not zero error.

Human checks after P2 integration: resting face reaches reference HR ±5 bpm within ~15 s; periodic waveform;
covered face shows low signal; brief bend recovers without a sustained slump; safe staged rapid downward
motion shows a fall cue. Test on the actual camera, lighting and frame rate used for filming.
