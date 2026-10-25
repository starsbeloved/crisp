# P13b — Room view

Branch: `crisp-demo-p13b`. No merge into `crisp-demo`.

## What works

- `/room` opens this computer's camera with the existing face, skeleton, identity-correction,
  signal and privacy overlays. Camera processing and algorithms were reused unchanged.
- Desktop camera/hallway widths are 3:1. The hallway shows the called patient's first name,
  queue number, destination and Crisp. It receives no phone, DOB, complaint or vitals.
- The existing lobby voice implementation is reused read-only: ElevenLabs audio when ready,
  browser speech fallback on failure, one playback attempt per call ID after Enable sound.
  Crisp's talking state follows playback. Leaving the screen stops its audio.
- One SSE connection feeds both camera and hallway. Default camera ID is A; there are no
  Cam B / Both controls. Settings lists actual local camera devices.
- Fullscreen includes both panels; browser fullscreen changes update its button. A failed
  request leaves the room usable with a browser-fullscreen hint. Escape closes camera settings.
- Call-out and sound controls fit at 1280 × 720; mobile stacks the hallway below the camera.
- `/camera` remains available with its existing Demo view and a link to `/room`.

## What was verified and how

- `npm install`: succeeded, zero reported vulnerabilities, no dependency/lockfile changes.
  npm warned that three dependency install scripts were not approved; none was approved here.
- `npm test`: **149 passed, 23 files**, including all 138 original tests and 11 new component tests.
  New coverage includes public-name privacy, audio readiness, once-only playback, fallback,
  subsequent calls, audio cleanup, fullscreen failure/success and page-chrome restoration.
- `npm run typecheck`: passed.
- `npm run build`: passed. Vite reported the app's large JavaScript bundle (~2.4 MB minified).
- `node client/room/browser-check.mjs`: passed in real isolated Chrome against API 8801 /
  web 5201. It generated an in-memory MP4 visibly labeled **SYNTHETIC**, played it as
  **REPLAY**, and verified local JPEG uploads, dashboard MJPEG display, exactly one room SSE
  connection, a measured 3:1 layout, an API-driven fictional call, privacy, one browser-speech
  invocation across SSE updates/sound toggles, native fullscreen, Escape and mobile scrolling.
  It also verified capture/upload using Chrome's synthetic webcam, never the physical webcam.
  No unhandled page errors were observed. Providers were disabled for these browser checks.
- Screenshots were inspected at 1440 × 900, 1280 × 720 and 375 × 812. Artifacts are local,
  gitignored: `output/playwright/p13b-room-{desktop,laptop,mobile,mobile-hallway}.png`.
- `git diff --check`: passed. Changes stay within `CameraPage.tsx`, `client/room/**`, and
  the single authorized `/room` route conditional in `App.tsx`. Shared types are unchanged.

### Validation issues encountered

- One full-suite run hit the existing `server/store.test.ts` expiry test: its fresh timestamp
  is only 1 ms inside the boundary. It passed alone and subsequent complete runs passed.
- An accidental repository-root test command hit the historical missing `server/src/http.ts`
  import in `tests/http.test.ts`. Historical code was left untouched; required checks ran in `apps/demo`.
- The combined dev command hit this host's file-watch limit. Verification used a non-watching
  API process and polling Vite, both with `API_PORT=8801 WEB_PORT=5201`. Vite also served cached
  CSS until restarted; the final browser run used the current files after that restart.
- Browser-harness URL matching and an old fictional call were corrected before its final pass.
  Test-created fictional visits remain in this worktree's gitignored `.data`; no real patient
  data or fixture video was recorded, committed, or uploaded externally.

## What is not done

- The dashboard's empty-camera instruction is not changed because `client/dashboard/**`
  belongs to P13a. Room view itself is complete within P13b ownership.
- Physical camera recognition, real signal quality and audible ElevenLabs playback need a
  human rehearsal. Synthetic patterns verify transport/layout, not physiological accuracy.
- Station switching belongs to P13g; no station shell or server routes were changed here.

## Requests for integrator

1. In `client/dashboard/VideoPanel.tsx`, replace the empty-camera guidance/link with
   **“Open the Room view on the camera computer”**, targeting `/room`.
2. Preserve the `/room` route as `<CameraPage roomView />` when integrating P13g's routing.
   Station role changes should unmount the camera page so its existing capture cleanup runs.
   Keep any on-screen role switch above Room view's z-index 30; Shift+S may stay global.
3. Stabilize `server/store.test.ts` with a fixed clock rather than a 1 ms real-time margin.
4. No shared-type or API changes are needed by P13b.

## Human checks

- On the camera laptop, open `/room`, allow camera access, select the intended webcam,
  and check names/skeletons with consenting volunteers. Unknown faces should stay blurred.
- Verify low-quality signals say measuring/low signal rather than inventing a reading.
- Click Enable sound; call a fictional patient from Command Center. Check the correct name,
  queue number and room appear, and that ElevenLabs is audible once; exercise browser fallback.
- Enter/exit fullscreen at the actual filming resolution; verify camera settings and Escape.
- After P13g integration, switch Room view → Lobby/Kiosk and verify camera capture and
  call-out audio stop; switch back and verify capture starts again.
- Rehearse the three-laptop story, with a clearly labeled REPLAY fixture ready.
