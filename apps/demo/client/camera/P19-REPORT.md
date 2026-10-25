# P19 — Upper-body posture and Chrome resource use

Branch: `crisp-demo-p19`. Runtime checkpoints: `3465e81`, `87b1167`.
Only `client/camera/**` and `client/lib/face.ts` changed. No dependencies,
shared types, routes, tags, stable branch, merges, main pushes or force pushes.

## What works

- Recognized faces and normalized poses use the same unmirrored 640-pixel
  processing surface. Upper-body skeletons render and observed posture reaches
  the API even when hips are outside the frame.
- Posture reference learning and head-drop counters use observed head/shoulders.
  Hidden or extrapolated hips cannot veto those samples or supply torso-angle
  and hip-based fall evidence.
- Pose defaults to **CPU**. `?pose=gpu` explicitly selects GPU with CPU fallback.
- One offscreen processing canvas is reused for pose, face snapshots and pixel
  sampling; its longest dimension is capped at 640, including portrait sources.
  Native camera capture can retain detail, but inference never uses full-size video.
- Face inference takes an immutable tensor snapshot, uses the library's internal
  synchronous `tf.tidy` calls, and ends its own serialized tensor scope in `finally`.
  This avoids repeated crop canvases and cleans up tensors after failed inference.
- TensorFlow's WebGL texture-retention threshold is 64 MiB. This is a retention
  threshold, not a hard ceiling on live inference memory or existing cached shapes.
- Hidden/unmounted Camera and Room pages stop frame callbacks, stop camera tracks,
  close MediaPipe, dispose face models after pending inference, and release canvas
  backing storage. Returning reloads models and reopens the source. Late model or
  camera acquisition cannot reopen hidden resources.
- `?debug=1` shows FPS, delegate, JS heap when supported, tensor count/bytes,
  live TF GPU bytes, allocated texture pool, processing dimensions, identity and
  existing posture/fall counters. Unavailable memory APIs are labeled unavailable.

## Root causes and evidence

The supplied `body-1 / source: face` is evidence that face/body association already
succeeded. Existing detector boxes were scaled to overlay pixels before matching;
TinyFaceDetector's `inputSize` is not the coordinate system of its returned boxes.
The later posture geometry rejected every sample when extrapolated hips were
below the frame (`bodyVisible` required hip Y below 0.98). That reproduced
`referenceReady: false` and null server posture despite recognized visible shoulders.

The new hook regression uses **1280×720** video, face boxes in the actual detector
canvas's pixels, normalized nose/shoulders, and hips at **Y=1.25 / visibility=0.05**.
It failed on reference learning before the fix while identity and assigned pose
assertions passed. It now learns the reference and emits non-null posture for the
recognized visit. Separate coverage rejects invented fall evidence from jittering,
unobserved hips and counts an actual head descent.

A production run also exposed a separate GPU pressure mechanism: **22.5 MiB** of
live tensors coexisted with about **949 MiB** of allocated cached textures. Tensor
cleanup alone did not free this cache. The bundled TF implementation defaults to
never deleting released textures; the retention flag now limits reuse. This
matches [TensorFlow's flag definition](https://github.com/tensorflow/tfjs/blob/master/tfjs-backend-webgl/src/flags_webgl.ts).
No original Chrome crash dump was supplied, so this establishes reproducible
memory pressure, not a forensic attribution of the user's specific crash.

## Verification

- `npm install`: completed, zero reported vulnerabilities. Existing warnings:
  deprecated `node-domexception` and three install scripts outside allowScripts;
  approval settings were not changed.
- `npm test`: **59 files / 403 tests passed**.
- `npm run typecheck`: passed. `npm run build`: passed. `git diff --check`: passed.
  Existing bundle-size warning remains.
- Ran the requested `API_PORT=8841 WEB_PORT=5241 npm run demo`. The production
  smoke script ran against that preview with real local models: CPU skeletons,
  **26.4–29.0 fps**, zero unexpected console/page/HTTP errors.
- The sustained headless-Chrome acceptance script uses the same optimized `dist`, an isolated
  memory-only API on **18841**, and production preview on **15241**. Providers are
  disabled, browser requests outside those local origins are blocked, and only the
  public sample already bundled with face-api supplies pixels. No physical camera,
  private images or existing visits are used. Every monitored clip is labeled REPLAY.
- The sustained run enrolls a real descriptor, recognizes that visit from a
  **1280×720 upper-body replay**, counts actual skeleton strokes, and checks real
  server posture at every sample. CDP forces GC before retained-heap samples;
  debug heap values show normal allocation noise separately. GPU process RSS is
  a process footprint, not a measurement of total dedicated GPU memory. TF live
  GPU bytes and texture-pool bytes are measured separately.
- Chrome launch required approved execution outside the filesystem sandbox;
  Chrome's own browser sandbox remained enabled. The blocked initial launch is
  separate from a crash while running Room.
- Browser startup exposed a fixture-routing bug: a wildcard matched `video=` in
  the Room URL and served the MP4 as the page. The fixture route now matches only
  the URL pathname. Failed preliminary attempts are not counted as a completed soak.

### Sustained measurement

Completed **600 seconds**, **21 samples**, Chrome **155.0.8059.85**, with no Chrome
quit. The same recognized visit had non-null posture at every sample. Actual
MediaPipe skeleton strokes continued throughout; the production screenshot was
visually inspected. Sampled overlay rate: **25.8–30.7 fps**.

| Time after warmup | Post-GC JS heap | TF GPU texture pool | GPU-process RSS |
| --- | ---: | ---: | ---: |
| 0 s | 14.322 MiB | 77.2 MiB | 276.797 MiB |
| 60 s | 15.527 MiB | 77.2 MiB | 283.844 MiB |
| 300 s | 15.486 MiB | 80.9 MiB | 283.031 MiB |
| 600 s | 15.542 MiB | 77.2 MiB | 222.000 MiB |

Retained heap grew **0.015 MiB** between minutes 1 and 10. The sampled texture
pool stayed **77.2–80.9 MiB**, including in-flight inference; live TF GPU tensors
stayed **22.5–26.2 MiB**, with **164 tensors** between calls. These measurements
show a plateau on this fixture, rather than sustained memory growth.

The ten-minute measurement completed, but its **post-run** hide/resume assertion
initially failed on `Failed to load resource: net::ERR_FAILED`. A short diagnostic
rerun located the request at **https://odml.pa.googleapis.com/v1/log**, emitted by
MediaPipe during close; the local-only test had deliberately blocked it. It also
confirmed that face recognition recovered. The final harness answers only that
telemetry URL with a local 204 response; it sends nothing externally. This test
harness correction did not change the production runtime.

Full measurements and screenshot: ignored `output/p19/{soak.json,progress.json,
production.png}`. The original post-run failure remains in `failure.json`.
The subsequent lifecycle check has separate artifacts under
`output/p19-lifecycle-final/`; it checks no frames while hidden, model reload,
and recognition of the same visit after return. **That final check passed**,
with zero unexpected console/page/HTTP errors. No production runtime changes
were made after the ten-minute run. All task-started servers were
stopped; no listeners remain on 8841, 5241, 18841 or 15241.

Reproduce from `apps/demo`, with Chrome installed:

```sh
npm run build
node client/camera/p19-production-browser.mjs
```

The script runs for at least 600 seconds after model/identity warmup, samples every
30 seconds, checks FPS and retained-memory bounds, verifies pagehide/pageshow, and
closes its browser and both servers in `finally`.

## Not done / requests for integrator

- Physical-camera sensitivity, real room lighting/distance, and audible output
  still need the human script below. The public sample is a tilted photograph;
  its pose jitter does not supply a four-second stable upright reference. Reference
  learning is covered by the realistic hook regression, not claimed from that photo.
- This is a single Room-camera production soak. It does not establish indefinite
  stability or a bound for every multi-camera/tab/device configuration.
- Camera/Room pages release resources on hide. Keep the monitoring window visible;
  a hidden camera tab intentionally stops monitoring until it returns.
- No integrator code changes requested. Integrator can merge the packet after
  review; this branch has not been merged.

## Exact human acceptance script

1. In this worktree:
   ```sh
   cd apps/demo
   npm install
   API_PORT=8841 WEB_PORT=5241 npm run demo
   ```
   In Chrome open `http://localhost:5241/check-in` and
   `http://localhost:5241/room?debug=1&cam=P19HUMAN` in separate visible windows.
   Check in as **P19 Human Test**, enroll your face, and note your queue number.
   Complete check-in; keep Room visible and allow its camera.
2. Sit upright about **1.5 m** away with face and both shoulders visible and hips
   **below the frame**. Require your name, one body track with your visit ID,
   a skeleton attached to that body, `Pose model: ready · CPU`, and **≥10 fps**.
   Hold still for **5 seconds after recognition**; require `referenceReady: true`.
   In DevTools Network, inspect `POST /api/observations`: your visit must have a
   non-null `posture`. No red model-loading/application errors may remain.
3. Slowly turn/lean over roughly two seconds while keeping shoulders visible.
   Require skeleton alignment with the visible body. Turn your face away briefly:
   body tracking must retain the name; unavailable HR must remain unavailable.
   Return upright. Normal sitting/standing must not trigger a fall request.
4. Click **Start monitoring (sound on)**. Hear its confirmation. Safely lower your
   head below the shoulder line for **4 seconds**, without falling. Require
   increasing `headDropSec`, retained visit, a red check request and one spoken
   request. Return upright; acknowledge/mark checked in Command Center if needed.
5. Keep Room visible for **10 minutes** with small ordinary movements. At minutes
   **0, 1, 5 and 10**, record FPS, JS heap, live TF GPU and TF GPU pool from debug.
   Require no Chrome quit, responsive controls and ≥10 fps. Compare settled lows
   of heap/pool rather than individual inference peaks; memory must plateau.
6. Switch Room to a **background tab for 5 seconds**, ensuring no other tab is using
   the camera. The camera indicator must turn off. Return: the source and models
   must reload and recognition/skeleton resume. Repeat once, then navigate away
   from Room; the indicator must turn off again. In a separate optional check,
   `http://localhost:5241/room?debug=1&cam=P19GPU&pose=gpu` must report GPU or a
   visible CPU fallback. Close that window after checking it.
7. Close the test browser windows and **Ctrl+C** the demo terminal. Record separate
   pass/fail results for upper-body skeleton/name, reference learning, server
   posture, normal-motion control, head-drop request/speech, memory/FPS and cleanup.
