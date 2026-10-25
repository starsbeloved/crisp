# P17a report

Branch `crisp-demo-p17a`. Reviewed interrupted commits `72ba357`, `370c728`,
`bd9d48b`; continued with `a4541c6` (persistent debug panel) and `3ed71d4`
(red speech interruption and production browser checks). Only P17a-owned paths
changed. No shared-type/route edits, merges, tag changes, stable/main pushes,
or force pushes.

## What works

- GPU pose initialization with CPU fallback; visible HUD says loading, ready plus
  delegate, or error plus the failure message. Local model/WASM paths work in production.
- Video-cadence overlays; independent pose inference around 12 Hz; face inference
  at most 4 Hz searching / 2 Hz with tracks, with smaller inputs for large faces.
- Shoulder-only skeleton/body tracking and identity continuity through a hidden
  face. Fast descent plus low/absent posture flags falls; hidden-face head drops
  retain the visit. Unavailable vitals stay unavailable.
- `?debug=1` now has a persistent scrollable text panel outside Settings and the
  canvas: track, visit, source, referenceReady, slumpSec, headDropSec, fallSuspected,
  velocity, fps, model status. With zero tracks it explicitly displays every field.
  Per-track canvas debug remains in streamed frames.
- Room and Command Center have “Start monitoring (sound on)”, spoken confirmation,
  and a per-tab sessionStorage preference. Requests speak browser templates
  immediately. New red requests interrupt previous speech. Provider/SSE updates
  do not repeat a level. Provider speech is suppressed after the immediate template.

## Why the skeleton could disappear

The previous BodyTracker required both hips and both shoulders to have visibility
at least 0.3. useVision assigns a drawable pose only to an accepted body track;
a face-only track has no skeleton. Hidden seated hips could therefore silently
reject a valid shoulder pose. The partial-body commit removes that hip gate.
Comparing actual pre-P17 and current trackers with identical landmarks and hip
visibility 0.1 gave **0 renderable bodies before, 1 after**. The body test covers it.

No broken production asset path was reproduced: both the old CPU loader and new
GPU loader loaded and drew skeletons on the full-body replay. The original physical
scene is unavailable. Hip occlusion is a confirmed failure mechanism, not proof
that it was the sole cause of that incident; the HUD now exposes separate load errors.

## Verified and how

Final `npm test`: **51 files, 323 tests passed**. Final `npm run typecheck`: passed.
`git diff --check`: passed. All servers started for this task were stopped;
no listeners remained on 8821, 5221, 8822 or 5222.

Ran `npm install`, then `API_PORT=8821 WEB_PORT=5221 npm run demo` from apps/demo.
Production build and preview passed. Temporary Chrome test profile; 30 fps REPLAY
from a sample photo already bundled in face-api; no physical camera/private images.
Browser outbound requests blocked. Visually inspected the production screenshot:
real MediaPipe skeleton, visible model HUD, persistent debug panel and REPLAY label.

For the before comparison, compiled useVision.ts, tracking.ts and face.ts from
`72ba357^` into `/tmp/crisp-p17a-before`, without checking out/overwriting source.
Chrome DevTools timeline/CPU traces were captured through CDP for Performance-panel
import. Six five-second samples per run:

| Measurement | Before | After |
| --- | --- | --- |
| Overlay HUD fps range | 27.5–29.5 | 26.6–30.5 |
| Frames over approximately 30 s | 879 | 867 |
| Skeleton line segments drawn | 13,213 | 13,006 |
| Traced FunctionCall total | 9,222 ms | 7,819 ms |
| Longest FunctionCall | 58.1 ms | 45.3 ms |

Both exceed 10 fps; **no demonstrated fps gain** on this source-limited fixture.
Callback time decreased about 15%. This is a local replay benchmark, not a guarantee
for a two-person webcam scene. MediaPipe detection is synchronous, as documented in
[the official Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js).

Ignored local artifacts: `apps/demo/output/p17a/{production.png,production.json,performance.trace.json}`;
before artifacts in `apps/demo/output/p17a-before/`. The baseline logged the
informational XNNPACK CPU initialization line at console error level. The GPU
after-run had zero console errors, page exceptions or failed HTTP responses.

The production speech check uses a separate real memory-only API (:8822), optimized
preview (:5222), generated landmarks, and disabled providers. It verifies head drop
→ red → SSE → speech on both screens; fast drop then absent pose → red; slow sitting
→ no alert; repeat suppression; sound preference after reload. Initially a fall
waited **9,445 ms** behind another alert. After the fix it took **144 ms** from POST
to speech API invocation on both screens. This measures invocation, not audibility.

Reproduce from the worktree root with Chrome installed:

```sh
# With production demo already running on 8821/5221:
node apps/demo/client/camera/p17a-production-browser.mjs
# Starts/closes its own memory-only API and optimized preview:
node apps/demo/client/room/p17a-alert-browser.mjs
```

## Not done / requests for integrator

- Physical-camera recognition, movement sensitivity and audible speakers need the
  human test below. Static tilted-photo replay is not a reliable posture-calibration
  fixture; synthetic upright sequences learn referenceReady after four stable seconds.
- `server/store.test.ts` has a timing race: its “fresh” fixture is only 1 ms inside
  the cutoff. It failed once under parallel testing, then the full suite passed.
  Integrator: freeze the clock or increase the fresh fixture's margin. Outside P17a
  ownership; untouched.
- Existing build warning: main JS chunk exceeds 500 kB. npm reports zero
  vulnerabilities and warns about three install scripts outside allowScripts.
  No dependencies, build configuration or approval settings changed.

## Exact human acceptance script

1. In this worktree run:
   ```sh
   cd apps/demo
   npm install
   API_PORT=8821 WEB_PORT=5221 npm run demo
   ```
   Use Chrome. Open `http://localhost:5221/check-in`,
   `http://localhost:5221/room?debug=1&cam=P17HUMAN`, and
   `http://localhost:5221/dashboard` in separate visible windows. Keep only Room
   running camera monitoring. Allow camera access.
2. Click **Start monitoring (sound on)** once on **each** monitoring screen. Hear
   “Monitoring sound is on.” Both buttons must say “Monitoring · sound on”. Refresh
   each once; preference must persist. If Chrome requires a new gesture after reload,
   toggle off/on and hear confirmation.
3. Check in as **Ama Test**, enroll your face, complete the form, note actual queue
   number **N**. Sit upright **1.5 m** from Room camera in good light, shoulders and
   torso in frame. Wait **5 seconds after your name appears**. Require skeleton +
   **Ama Test / #N**, “Pose model: ready · GPU” (or CPU), and **≥10 overlay fps**.
   Debug visit must be your ID; referenceReady must become true. Stay still longer
   if necessary. DevTools Console must have no red application/model-loading errors.
4. **Normal sitting control:** stand carefully over about two seconds, then sit
   normally over about two seconds. Require no new request or warning speech.
   Wait upright for referenceReady again.
5. **Head drop:** lean until your nose is below the shoulder line in the camera
   image, with shoulders visible, and hold **4 seconds**. Require increasing
   headDropSec, retained name even if face disappears (source: body), **red**, and
   speech on both screens: “Head below shoulders. Ama Test, number N, may need a
   check.” Each screen speaks once; continued frames/providers must not repeat it.
6. Return upright. In Command Center **Acknowledge**, then **Mark checked**. Wait
   **61 seconds** for the existing re-arm interval. Continue small normal movements
   so prolonged stillness does not create another request. Confirm upright posture.
7. **Controlled fall-like motion:** use a stable chair, helper, and padded supported
   crouch position beside it. Do not actually fall or strike the floor. Quickly lower
   shoulders/nose into that supported low position (or below view); stay low one
   second. Start a timer with the motion. Require fallSuspected true, retained visit,
   **red within 2 seconds**, and “Fall-like movement detected. Ama Test, number N,
   may need a check.” on both screens. Hidden face must not create invented HR/RR.
8. Return upright; acknowledge. Move completely out of view. With Settings closed,
   require a persistent debug panel and no-track row showing **all fields**, FPS and
   model status. Return: rows reappear. Repeat with shoulders visible and face turned
   away: per-body fields must remain visible.
9. In DevTools **Performance**, record ten seconds of normal sitting. Save the trace;
   note HUD fps. Require responsive controls and **≥10 overlay fps**. Confirm streamed
   Command Center video includes the skeleton.
10. **Ctrl+C** the demo terminal and close test windows to release the camera. Record
    separate pass/fail results for skeleton/name, reference learning, fps, normal sit,
    head drop, controlled-fall latency and audible speech.
