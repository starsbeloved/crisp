# P15a — Camera fixes and filming checks

## What works

- TinyFaceDetector uses input size 512 / confidence 0.4 and the full captured frame. The camera requests 1280×960; the browser can negotiate its supported size.
- MediaPipe lite tracks up to two poses with detection, presence, and tracking thresholds 0.3.
- A face-confirmed visit follows an unambiguous torso for up to 60 seconds without a face. A missing body (>1 second), ambiguous crossing, removed gallery entry, or conflicting face clears the claim. Face reappearance confirms identity again. Everything is keyed by visitId.
- Body observations have a null face match score and no current HR or pulse trace. Breathing/posture remain independently available when measured.
- A stable seated reference takes four seconds. Normal standing and returning to the learned seat height does not count as a fall. Missing or stale pose never adds seconds to evidence.
- Camera labels include queue numbers. `?debug=1` shows visitId, face/body source, referenceReady, slumpSec, headDropSec, stillSec, and fallSuspected.
- Open/acknowledged requests remain on the person and in a red Room/camera bar until checked. Replay requests are labeled REPLAY. Existing thresholds are already wired: head drop 3 seconds → red; slump 8 seconds → amber, with existing vital fusion.

## Verified and how

- `npm install`: completed, zero reported vulnerabilities. npm noted three dependency lifecycle scripts awaiting its allow-scripts review; no approval settings changed.
- `npm test`: 286 tests in 48 files passed, including body continuity, same-name visits, expiry/crossings, stand/sit, and the complete tracking → posture → observation → engine chain.
- `npm run typecheck`, `npm run build`, `git diff --check`: passed. Build reports a >500 kB bundle warning.
- Real Chrome, Vite :5211 and isolated in-memory API :8811, providers disabled: face and pose models loaded; synthetic head and slump scenes each passed 6/6 browser checks. Existing visit/observation routes accepted REPLAY inputs, SSE delivered the request to Room and Command Center, and the camera overlay rendered an amber box with an eight-second slump reason. Head-drop request was red in Command Center. No fabricated vital numbers were supplied.
- One full test run failed `server/store.test.ts > RoomStore camera snapshots > drops cameras whose last frame is at least five minutes old`; subsequent full runs passed. That existing test gives its fresh camera only 1 ms of margin and reads the real clock twice.

## What is not done

- Physical webcam acceptance at 1.5–2 m, real two-person recognition, and ≥8 fps are unverified. Chrome initially stayed on “Opening camera…” and ultimately reported **Permission denied**; native Chrome control was not approved. Synthetic verification does not establish optical accuracy or real performance.
- The full pose model was not added: poor lite-model accuracy could not be established without live input, and model assets are outside P15a's owned paths.
- `npm run dev` hit `EMFILE` on this machine. API and Vite were run separately; Vite needed restarting to serve edited modules reliably.

## Requests for integrator

- Run the Human checks below before filming and report actual range/fps. If lite still loses seated bodies with visible shoulders/hips, evaluate the licensed full pose model in `public/models/pose/`.
- Stabilize the existing store-expiry test with a fixed clock in its owning packet.
- Integrate the P15a branch; this session does not merge it.

## Human checks

Use Chrome and keep **Room visible throughout**. Put Command Center in a second window beside it (not a hidden tab). These are demo checks, not medical validation. Do not stage a physical fall.

### Start

From `apps/demo/`, use these in separate terminals if the combined dev command hits EMFILE:

```sh
API_PORT=8811 WEB_PORT=5211 npm run dev:server
API_PORT=8811 WEB_PORT=5211 npm run dev:client
```

If Node watch itself hits EMFILE, use this API command instead:

```sh
API_PORT=8811 WEB_PORT=5211 node server/main.ts
```

The memory-only verification process was stopped after testing; the regular API and Vite were left running on 8811/5211. Synthetic visits were never written to the regular store. Stop these existing processes before starting another server on those ports. Refresh Chrome after restarting Vite if edits appear stale.

1. Open `http://127.0.0.1:5211/check-in`. Enroll volunteer A alone, named **Jason**, and record their queue number. Enroll volunteer B alone, also named **Jason**, and record the second queue number. Each uses their own real face scan. Close the check-in tab after both finish.
2. Open `http://127.0.0.1:5211/room?debug=1` and allow camera access. The verification ended with **Permission denied**: if necessary, use Chrome's site controls beside the address to allow Camera for this local origin, then reload. Open `http://127.0.0.1:5211/dashboard` in the second window. Camera settings must say **Face models ready · Pose model ready**.
3. Place two chairs **1.5 m from the lens**, about **0.8 m apart**, centered left and right in the image. Use bright frontal light. Frame both faces, shoulders, and hips. Keep bodies separated in the image. Do not judge HR range from identity range: distant skin can honestly show measuring/low signal.

### Episode 1: range and head drop

| Time | Action / required result |
| --- | --- |
| 0–5 s | Both sit upright, facing the lens. Both get a skeleton and the correct **Jason · #queue** label. Confirm the two queue numbers are different. |
| 5–10 s | Stay seated, with small natural movements. `referenceReady` becomes true after four stable seconds; “Learning posture…” disappears. Check overlay FPS is **≥8** for at least five seconds. |
| 10–14 s | A gently folds forward until the **nose is visibly below the shoulder line**. Hold for four seconds while the torso stays visible. `source` becomes body if the face disappears; visitId must stay A's. `headDropSec` rises. |
| By 15 s | Red person box/banner and red Room bar; the same A queue number has a red request in Command Center. HR may become unavailable; it must not turn into a made-up value. B keeps their own identity. |
| 15–20 s | A returns upright. Request remains visible. Acknowledge it: the Room banner remains. Then **Mark checked** on A's row. The Room request banner clears when no other requests remain. |

### Episode 2: normal stand/sit, then sustained slump

1. After **Mark checked**, wait **65 seconds** before testing another request on that visit. Keep movements natural during the wait so a 30-second stillness request is not accidentally the test. Clear any incidental request and restart the 65-second cooldown.
2. Sit upright for **5 seconds**. Stand over **1 second**, remain standing **2 seconds**, and sit over **1 second** into the same chair. No fall, head-drop, or slump request should open from that action. Wait **5 seconds** upright.
3. Lean the upper body forward while keeping the nose **above** the shoulder line. Watch `slumpSec`; if it stays zero, increase the forward lean gently. Start the hold timer when the debug counter starts, then hold for **9 seconds**. Do not let the nose go below shoulders, which deliberately triggers the faster red path.
4. At eight seconds of observed slump, expect an **amber** person box and amber Command Center request, allowing about **2 seconds** for observation/SSE delivery. Room's request bar is red whenever any request is open. If sustained abnormal measured vitals already exist, the fusion rule can correctly upgrade this to red.
5. Return upright, then Mark checked. Do not continue the pose just to extend the count.

### Episode 3: 2 m and identity continuity

1. Move both chairs to **2 m**, still separated and in frontal light. Face the camera for **5 seconds**, then maintain normal sitting for **10 seconds**. Confirm both queue labels, skeletons, and ≥8 fps. Record failure honestly if either is lost.
2. A turns the face away for **10 seconds** while the torso stays visible and stationary; B faces the lens. A should keep their own visitId with body tracking and a null face score; B should keep theirs. Turn back and allow **3–5 face detections** to confirm again.
3. Have A leave the frame for **2 seconds**, then return. A must identify again; an unconfirmed replacement body must never inherit the old visit. Ambiguous overlaps are allowed to show identifying instead of a guessed name.

### Software-only reproduction

`http://127.0.0.1:5211/client/camera/browser-fixture.html` runs labeled synthetic inputs. Both buttons must show 6/6. The API button creates fictional visits and REPLAY observations, so use it only on a disposable memory-only verification server. It is not the filming/live-camera acceptance check.
