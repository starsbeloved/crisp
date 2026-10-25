# P3 signal tracker

Pure TypeScript; no DOM, models, network, provider calls, or dependencies on the historical app.
`index.ts` preserves the P0 `createSignalTracker()` interface with optional local display metadata.

## P13d sensing robustness (2026-10-24)

- Face sampling now averages two inner cheeks and a forehead patch above the brows, clipped to the detected face.
  `cheekPatches` / `meanCheekSample` keep their existing names for callers; they include all three regions.
- `hrBpm`, `hrQuality`, and waveform remain **current evidence only**. Dark/small/moving/stale input still
  withholds the number immediately. The existing observation adapter sends only these current fields.
- Optional `SignalReading.hrDisplay` is **display only**: accepted camera estimate, quality with 3 s drop/recovery
  hysteresis, age, retained flag, and a label. A retained value says `72 bpm · last good reading · 12 s ago`.
  It expires after 30 s measured from the accepted estimate's timestamp, never from repeated `read()` calls.
  Initial acquisition still needs 10 s of RGB; reset clears both cached display and current evidence.
  Source gaps restart signal collection while retaining the explicitly aged display for the same identity.
- `signalDisplayLabel(reading)` formats that HR display and says **`Breathing: not measured`** unless a
  current fair/good breathing rate exists. It is exported from `signals/index.ts` for the integrator.
- Breathing now gates shoulder displacement independently at 0.001 normalized units per nominal 30 Hz frame,
  in addition to the existing whole-body stillness/visibility checks. Shoulder sway, missing shoulders, pose
  gaps, and gross motion clear the rate immediately and require a new 20 s still collection window.
- `server/engine/config.ts` supplies the demo thresholds: head drop 3 s, slump 8 s, stillness 30 s,
  abnormal vital evidence 20 s. Fall cues retain the existing immediate detection and 1.5 s hold so a
  1 Hz observation sender can relay them. Slump alone remains amber; red fusion still needs current vitals.

### Requests for integrator (outside P13d ownership)

1. In `client/camera/output.ts`, replace the body of `vitalLabel` with a call to `signalDisplayLabel` from
   `./signals/index.ts`. The canvas overlay already calls `vitalLabel`, so this activates both the aged HR
   label and `Breathing: not measured`. Keep `makeObservation` unchanged: never serialize the display cache.
2. In `server/engine/index.ts`, import `ENGINE_THRESHOLDS` from `./config.ts`. Use `headDropSec` in both
   evaluation and evidence (currently 5); `slumpSec` in both evaluation and evidence (currently 10);
   `stillSec` (30), `abnormalMs` (20_000), and `evidenceGapMs` (3000) at their existing threshold checks.
   Do not scale or falsify the actual measured posture durations. Add engine boundary tests at 3 and 8 s,
   including a recovered 3 s bend that does not reach the slump threshold and low-quality vitals that
   cannot upgrade a slump to red. The config is **not active** until these consumers are updated.
3. If the staff dashboard should retain aged HR too, P8 needs optional last-accepted HR/time metadata in
   shared vitals plus a display consumer. No shared-type change is required for the local camera display.

These UI and engine files are outside the packet's Owns list, so P13d leaves them for integration. The
existing camera banner therefore still uses its old wording and head-drop/slump alert thresholds until
the two wiring changes above land. Synthetic tests/browser fixtures validate software behavior, not
camera accuracy; real camera/reference rehearsal is still required.

### P13d verification and handoff

- Baseline: 138 tests passed; TypeScript passed. After P13d: **149 tests passed**, including 11 new
  regressions in `robustness.test.ts`; TypeScript and `git diff --check` passed.
- Test-first reproduction: 7 new checks failed on the original implementation (missing display retention,
  missing forehead pixels, and a false breathing estimate during shoulder sway); implementation passed them.
  The observation-boundary test confirms cached HR metadata never enters `makeObservation` output.
- Actual Chrome on `http://localhost:5203/client/camera/signals/browser-fixture.html`: **14/14 passed**.
  The reproducible fixture visibly labels **SYNTHETIC**. It measures 72.003 bpm from generated RGB and
  15.000 breaths/min from generated shoulders, samples a real canvas, checks the 3 s display drop/recovery,
  the 12 s aged label, 30 s expiry, reset, sway/occlusion rejection, bend recovery and a fall cue at 0.5 s.
- `npm run build` passed. Existing large-bundle warning remains (main chunk exceeds 500 kB).
- `npm install` completed, audit reported zero vulnerabilities. npm warned that install scripts for
  `@google/genai`, `fsevents`, and `protobufjs` were not approved; no approval setting was changed.
- `API_PORT=8803 WEB_PORT=5203 PROVIDERS_ENV=/dev/null npm run dev` hit `EMFILE` in watch mode.
  Verification used separate processes, both with `API_PORT=8803 WEB_PORT=5203 PROVIDERS_ENV=/dev/null`:
  `node server/main.ts` and `CHOKIDAR_USEPOLLING=1 npm run dev:client`. No provider credentials were read
  from the private file and no provider requests were made by the browser fixture.
- Review: local diff/ownership self-review; no callable subagent tool was available in this session.
  No routes or shared types changed. P13d's two integration requests above remain outstanding.

### Human checks

- After the integrator wires the label, test a still face against the reference device in filming light.
  Cover the face: the display must show the aged last estimate, expire at 30 s, and never create HR alerts
  from that cached value. Check 3 s quality drop/recovery and reset on identity/source changes.
- Hide a shoulder or move: breathing must be `not measured`. Still visible pose must recollect a fresh
  20 s window; do not assume an accurate breathing rate from the synthetic tests.
- After the integrator wires config and boundary tests, rehearse a safe staged fall (red within 1–2 s),
  head below shoulders (red after 3 s), sustained slump (8 s), and a brief bend that fully recovers.
  Do not treat these motion cues or camera estimates as a diagnosis or interpretation.
- Rehearse actual REPLAY video and recognition on the filming laptops; this session used synthetic signal
  fixtures, not a webcam, reference device, face-recognition video, or a full three-laptop rehearsal.

## Input contract for P2 / integrator

- One tracker per recognized track/visit. **All `t` values and `read(now)` use the same millisecond clock.**
  Replay should use video time in milliseconds, consistently for both pushes and reads.
- `FaceSample.rgb` is mean cheek/forehead RGB on the **0–255 scale**. Brightness is also 0–255.
  P2 owns skin-ROI sampling; this module never reads an image.
- Pose landmarks use MediaPipe indices (nose 0, shoulders 11/12, hips 23/24), normalized x/y,
  visibility 0–1. Supply landmarks for this person only. Other landmarks are not required.
- Push each frame and read at about 1 Hz (or faster for display). Estimates refresh at most once a second.
  Samples with duplicate/backward timestamps are ignored. A gap over 1 s restarts collection and counters;
  reads over 1 s after the last sample return null in the current-evidence fields. `hrDisplay` may retain
  an explicitly aged value for up to 30 s.
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
and finds a spectral peak in 0.1–0.7 Hz. Window: up to 30 s; first result after 20 s; minimum input cadence: 2 Hz. Gross pose motion
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

## Packet verification record (2026-10-24)

- `npm test`: 46 passing tests (40 P3 + 6 existing server smoke tests). Includes noisy 72/110 bpm,
  irregular timing, RGB glitches, >20% bad samples, ten-second gaps, waveform onset/normalization,
  large-jump confirmation across bad quality, breathing 9/15/30 per minute, pose sequences,
  undersampling rejection, fall expiry during occlusion, and CSV CLI execution.
- `npm run typecheck`: passed. No frozen interface or route changes.
- Actual Chrome: 10/10 synthetic browser checks using the Vite-served production module. Measured
  72.003 / 110.001 bpm and 15.000 breaths/min; checked waveforms, flat input, gap/restart, slump/recovery.
  This proves browser execution, not webcam accuracy. No video fixtures were available.
- `API_PORT=8783 WEB_PORT=5183 npm run dev` hit `EMFILE` in Node's watch mode. Browser verification
  used Vite on 5183 and a temporary synthetic-only harness on 8783, with no provider file or camera input.
- Final review was self-review; this session had no callable subagent tool.
- Still pending: real webcam/reference validation, recorded-video/UBFC evaluation, and P2/P8 wiring.
  P2/P8 should use the input contract above and reset trackers on Mark checked or identity/source changes.
