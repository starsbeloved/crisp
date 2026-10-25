# P18a report

Branch: `crisp-demo-p18a`. Changes stay in the camera and engine-test ownership paths.
No shared types, HTTP routes, dependencies, tags, stable branch, main branch, or integration branch changed.

## What works

- Face-box speed independently raises `fallSuspected`: downward speed above 1.5 face heights/second plus
  at least one face height of descent, or observed downward motion followed by face disappearance within
  one second. Horizontal/upward loss, slow descent, jitter, source gaps, cached frames, invalid boxes and
  large detector-size jumps do not count as falls in regression coverage.
- Fresh face samples at up to 4 Hz; timestamps describe captured pixels rather than async completion.
  Face detections use input 320 for large faces, 512 for medium faces, and 640 while searching or below
  80 overlay pixels wide. No extra dependency or model download.
- Pose-based nose/shoulder speed remains independent, including rapid nose descent before hips are low.
  Sustained head-drop and existing posture logic remain available.
- A confirmed event turns the recognized person's overlay red immediately and follows the existing
  observation → engine → SSE → Room/Command Center speech path. Unknown faces never request a check.
- A disappearing face retains its recognized visit briefly to report the observed event, without
  publishing stale face HR, waveform, or match score. No vital signs are fabricated.
- Debug text and streamed overlay show `faceVelocity` in face heights/second, `faceBox` dimensions,
  pose velocity in shoulder widths/second, and `face-drop`, `face-disappeared`, or `pose` trigger.
  A fall label takes precedence over “Learning posture”.

## What was verified and how

- `npm install`: completed; zero reported vulnerabilities. npm also reported three install scripts
  outside the existing allowScripts coverage. Approval settings were not changed.
- `npm test`: **54 files, 357 tests passed**. `npm run typecheck`: passed.
- New regression tests were observed failing before implementation. Coverage includes face-only
  events, disappearance with scheduling jitter, pose-only nose drops before/after reference learning,
  non-triggers, unknown identities and camera-to-engine red requests with null vital signs.
- `git diff --check`: passed. Production build passed; existing >500 kB bundle warning remains.
- Ran the requested `API_PORT=8831 WEB_PORT=5231 npm run demo` production server/build.
  Ran the existing production Chrome/DevTools replay benchmark before and after changes, using
  the dependency's sample photo, local model assets and temporary browser profiles:

  | 30-second replay benchmark | Before | Final detector tuning |
  | --- | --- | --- |
  | Six sampled overlay rates | 26.0–29.3 fps | 27.1–30.5 fps |
  | Skeleton line segments drawn | 12,628 | 12,455 |
  | Unexpected console/page/HTTP errors | 0 | 0 |

  This source is capped near 30 fps; the measurements do not establish a meaningful speedup.
- `node client/camera/p18a-production-browser.mjs` runs the optimized client against a separate,
  provider-disabled, memory-only API on **18831/15231**, and closes its servers/browser in `finally`.
  Both local origins are allowed; other browser requests are blocked. All images come from the
  bundled face-api sample; every monitored clip is labeled **REPLAY**.
  - Upper-body replay: actual descriptor enrollment, recognized visit + real GPU skeleton, slow
    downward movement → no request. No fabricated vital signs.
  - Face-only fallback: deliberately returns HTTP 503 for the pose model and asserts visible model
    failure and zero skeleton segments. Slow descent → no request; fast drop and downward loss →
    red + one speech invocation on both Room and Command Center within two seconds.
  - Final motion-to-Room-speech invocation: **646 ms** for face drop and **745 ms** for disappearance.
    These timings exclude initial model loading. Command Center speech also passed the two-second gate.
    Sampled fallback HUD rates were **25.6–28.5 fps**; upper-body replay was **30 fps**.
  - Expected model-fault HTTP/console messages are recorded separately; unexpected errors must be zero.
  - Visually inspected the final upper-body and red face-drop screenshots: identity, skeleton,
    REPLAY labeling, trigger text, visible pose fault for the fallback, and no invented HR/RR.
  - The script waits for face-model readiness before timing movement, and records attempted browser
    speech. It does **not** establish audible speaker output.
- Ignored artifacts: `apps/demo/output/p18a/{production.json,measurements.json,upper-body.png,slow.png,
  drop.png,disappear.png}`. Baseline/final traces and screenshots are in `output/p18a-before/` and
  `output/p18a-final/` for DevTools Performance import.

### Face-size measurement (replay, not physical distance calibration)

Detection/recognition was measured on identical 640×480 canvases at progressively smaller scales.
Recognition uses the existing descriptor-distance cutoff of 0.5. Approximate nominal face widths:

| Face width | Input 320 | Input 512 | Input 640 |
| --- | --- | --- | --- |
| 114 px | matches | matches | matches |
| 91 px | matches | matches | matches |
| 69 px | no detection | matches | matches |
| 51 px | no detection | matches | matches |
| 40 px | no detection | no detection | matches (measured box about 44 px; distance 0.41) |
| 29 px | no detection | no detection | no detection |

Thus this fixture loses recognition between approximately **40 and 29 px** at input 640;
input 512 loses it between about **51 and 40 px**. These are observations for one photo, not
universal thresholds. A full upper-body replay had a roughly **115–120×107–114 px** face box and
**30 fps** with a real skeleton. The exact 1–1.5 m webcam result still requires a person.

Shutdown checked: no listeners remain on **8831, 5231, 18831 or 15231**.

## What is not done

- Physical 1–1.5 m recognition, the smallest recognizable face on the filming webcam, real movement
  sensitivity and audible speakers remain human acceptance checks. No access to a person/camera was assumed.
- An isolated face-photo crop with pose enabled can make MediaPipe infer unstable bodies and trigger
  a pose alert. The fallback test explicitly disables pose; the separate upper-body test keeps the
  real model enabled and passes its slow-movement control. Use upper-body framing for filming and
  verify the normal-sit control below. No general false-positive rate is claimed.
- New motion remains a visual “may need a check” heuristic; it is not a diagnosis or a measured fall probability.

## Requests for integrator

- Merge `crisp-demo-p18a` into `crisp-demo` through the normal integrator workflow; this session does not merge it.
- Run the physical test below before filming and record the actual fps and face-box size at 1 m and 1.5 m.
  If identity disappears, step closer; do not present an unidentified person as recognized.
- Audit the noted MediaPipe behavior if planning to film tightly cropped faces with pose enabled.

## Exact human test script

1. In this worktree:
   ```sh
   cd apps/demo
   npm install
   API_PORT=8831 WEB_PORT=5231 npm run demo
   ```
   Open Chrome windows at `http://localhost:5231/check-in`,
   `http://localhost:5231/room?debug=1&cam=P18HUMAN`, and `http://localhost:5231/dashboard`.
   Permit camera access. Use Room as the only active monitoring camera.
2. Click **Start monitoring (sound on)** on Room and Command Center. Hear “Monitoring sound is on”
   from each. Each button must become **Monitoring · sound on**. Keep both windows visible.
3. In Check-in, enroll **Jason Miller** (or the filming volunteer's test name), complete the form,
   and note queue number **N**. Sit upright **1 m** away with head, shoulders and upper torso visible
   in good light. Wait for the name/#N and **Face models ready**. Require a visible skeleton,
   **Pose model: ready · GPU** (CPU fallback is allowed) and at least **10 overlay fps**.
4. Wait upright/still for five seconds. Record actual `faceBox`, fps and `referenceReady`.
   Repeat at **1.5 m**. Require the same visit and skeleton. If recognition stops, note the last
   recognizable box width/height and first unrecognized distance/size; step closer before continuing.
5. **Control:** slowly lower your head/upper body over **four seconds**, then return upright slowly.
   Stay supported in the chair. Require no new red request or fall speech. Confirm Console has no
   unexpected red errors. Allow short unrelated stillness/slump timers to reset before the next step.
6. **Face drop:** while safely seated, quickly lower your head and shoulders by about **one displayed
   face-box height in 0.3–0.5 seconds**, keeping your face visible, then remain low for one second.
   Do not actually fall or strike anything. Require `faceVelocity > 1.5`, `fallSuspected: true`,
   `trigger: face-drop` (or `pose` if that independent signal fires first), a red box/request within
   **two seconds**, and speech on both screens: “Fall-like movement detected. Jason Miller,
   number N, may need a check.” Each screen should say it once. No invented HR/RR may appear.
7. Return upright. In Command Center click **Acknowledge**, then **Mark checked**. Wait **61 seconds**
   for the existing re-arm interval, making occasional small normal movements to avoid a stillness alert.
8. **Downward disappearance:** from a recognized upright position, quickly lower your face at least
   half a displayed face height, then tuck/turn your head downward until the face detector loses it,
   all within **one second**. Keep your body supported; no actual fall. Require red + speech within
   **two seconds**, retained visit identity, and `trigger: face-disappeared` or the independent pose
   trigger. Hidden-face HR must become unavailable rather than displaying a stale number.
9. Record pass/fail separately for identity at both distances, skeleton, fps, normal movement,
   face-drop latency/trigger, disappearance latency/trigger, and actual audible speech.
10. Press **Ctrl+C** in the demo terminal and close the test camera windows to release the camera.
