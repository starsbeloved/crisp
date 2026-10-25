# P22b — kiosk pulse check handoff

Branch: `crisp-demo-p22b`. Scope: `client/checkin/**` and `client/camera/signals/**` only.
Resumed the existing three pushed implementation commits; no restart, merge, shared-type, route,
dashboard or engine changes. Software checks pass; full acceptance still requires the integrator
changes and real-camera trials below.

## What works

- A successful face scan enters Pulse check in both form and voice flows. The existing camera
  stream and video element stay open; the scan tool tells the agent to wait for pulse acquisition.
  Early voice answer/navigation tools cannot bypass the visible pulse step; finish waits for it.
- Cheek and forehead RGB are sampled on decoded frames using the existing sampler and POS tracker.
  A countdown, actual measured waveform, current quality and `camera estimate` label appear.
  Light, distance and motion coaching comes from measured inputs. A missing/different face clears
  the current number. No signal produces no numeric reading.
- Skip is always available and discards pulse samples. A usable reading allows Continue; otherwise
  the step automatically continues at 17 s with a usable reading, or by 25 s without one, with
  `Couldn’t get a clear reading — that’s okay.` The nominal countdown is 15 s.
- Accepted readings are collected at most once per second. Once a visit exists, the client sends
  them chronologically to the existing observation endpoint, with `cameraId: "kiosk"`, the new
  visit ID, acquisition timestamps and `source: "live"`. Recording input is labeled REPLAY and
  sent as `source: "replay"`. Uploads share a four-second deadline; an upload failure does not
  duplicate or undo the visit and displays an honest notice.
- `?debug=1` shows quality, peak/band spectral power ratio and sampled fps. Reference HR comparison
  appears and logs only in the browser; it is not posted as a reference or sent to providers.
  The check-in notice retains the measured value, quality and time after acquisition.

## Signal values used

The existing P3 prototype thresholds are retained; these are not calibrated on live trials.

- 10 s acquisition window; minimum input cadence 10 Hz; resampling 30 Hz; POS subwindow 1.6 s;
  spectral band 0.7–3 Hz (42–180 bpm). First number needs 10 s; waveform can appear from 5 s.
- Peak-lobe / remaining in-band power: good >= 2, fair >= 1, otherwise low. Debug's SNR is this
  ratio, not decibels. Median of five estimates; jumps >25 bpm need consistency within 10 bpm
  for 3 s. Robust four-sigma RGB rejection; reject >20% bad frames or bad runs >500 ms.
- Brightness >=50/255; source face width >=90 px. Tracker width changes >4% or brightness
  changes >8% cause a 500 ms motion hold. Kiosk face detection refreshes every 200 ms, requires
  exactly one face with score >=0.7, 68 landmarks, descriptor distance <0.5, and landmarks no
  older than 400 ms. Translation >4% of face width resets acquisition with 700 ms coaching.
- UI refresh <=10 Hz; detection never overlaps; decoded frames gate RGB sampling. Camera loss
  or tab hiding clears acquisition without extending the 25 s deadline. Skip/unmount cancels
  timers and frame callbacks; leaving acquisition releases the camera through the existing hook.

## What was verified, and how

2026-10-25, this worktree:

- `cd apps/demo && npm test`: **65 files, 426 tests passed**, zero failures.
- `npm run typecheck`: passed. `git diff --check`: passed.
- `API_PORT=8862 WEB_PORT=5262 PROVIDERS_ENV=/dev/null npm run demo`: Vite production build
  succeeded and API/preview started on 8862/5262. Existing >500 kB chunk warning remains
  (main JS ~2.46 MB before gzip). `/dev/null` disabled provider-file access for this verification.
- Existing temporary `p22b-browser.mjs` ran through the locally installed Playwright library,
  using **headless Google Chrome with a new temporary --user-data-dir** and Chromium sandbox
  enabled. No Playwright MCP, Chrome extension, existing Chrome connection or filming profile.
  External browser requests were blocked; voice transport and providers were mocked. No real
  microphone, reference device or webcam measurements were used.
- Unmodified production smoke: tap form, skip face, answer complaint, skip follow-up, saved queue
  number. A separately compiled fixture visibly labeled **SIMULATED TEST** replaced only face
  detection, canvas camera input and voice SDK transport; the actual sampler, tracker, controller,
  pulse UI, API, engine and dashboard ran.
- Fixture result: **71.95598 bpm, good**, from 1.2 Hz synthetic RGB; one camera open, no stop
  between scan/pulse, stop on leaving pulse; local reference comparison and no reference POST;
  390 px viewport had no document horizontal overflow. Desktop pulse screenshot inspected.
- Saved visit had `cameraId: "kiosk"`, expected HR and quality in API state; its actual dashboard
  row showed `HR · 72 bpm`. Skip worked; covered face showed Measuring and reached the 25 s
  no-reading continuation. Mocked voice scan returned pulse instructions, early answers did not
  bypass pulse, and skipping allowed follow-up and saved check-in. **Zero page errors.**
- Unit tests also cover acquired-number loss on cover/different identity, flat/dark rejection,
  unchanged deadline after camera readiness changes, timestamps, and no duplicate visit on
  observation upload failure. No callable subagent tool was available; review was local.
- Browser startup initially needed sandbox escalation. The first browser run stopped on duplicate
  names from prior persisted test visits; using a unique test name and visit-ID selector fixed
  the harness. No application change was needed for that failure.

Local, uncommitted evidence: `/private/tmp/crisp-p22b-tests.log`,
`/private/tmp/crisp-p22b-pulse-desktop.png`, `/private/tmp/crisp-p22b-pulse-mobile.png`,
`/private/tmp/crisp-p22b-dashboard.png`. The mobile full-page capture has a rendering artifact;
only the overflow assertion is claimed for mobile. Throwaway browser script is excluded from
commits, as requested. Test visits are explicitly named SIMULATED in this worktree's ignored
local room data; no data was deleted.

## What is not done / requests for integrator

1. **Real acquisition acceptance remains unverified:** four still-face trials at ~50 cm in filming
   light, at least three fair/good results within 15 s, comparison against a watch/oximeter,
   and actual voice-provider conversation. Synthetic RGB proves software behavior, not accuracy.
2. **Retain a timed kiosk reading in Command Center.** `QueueRow.tsx` and `PatientDrawer.tsx`
   hide estimates older than five seconds. A human normally spends longer answering questions
   after pulse collection, so the number can already be hidden at visit creation. Show a
   separately labeled `Kiosk camera estimate · measured at <time>` using `lastSeenAt`; never
   present it as current evidence or relax current-evidence alert gates. No dashboard timestamp
   display was added because dashboard files are outside P22b ownership.
3. **Ingest acquisition time for kiosk history/baseline.** `server/http.ts` passes `Date.now()` to
   `engine.ingest`; `collectBaseline` and history use that arrival time. Sequential retrospective
   uploads therefore collapse to one history point and one baseline sample. The browser observed
   `history.length === 1`, `baselineHr === null`. Preserve the individual observation timestamps
   for retrospective kiosk history/baseline without running retrospective alert evidence as if
   it were current. Even with timestamp handling, a usual 17 s session yields fewer than the
   existing ten good baseline samples; choose an explicit kiosk-baseline policy or let later
   live samples complete the baseline. Do not fabricate more samples or stretch upload timing.
4. Changes in 2–3 belong to P8/integrator; server/engine/dashboard/shared files were not edited.
   Full P22b acceptance must not be declared until these and the real trials pass.

## Exact human test script

1. From this worktree run `cd apps/demo`, then
   `API_PORT=8862 WEB_PORT=5262 npm run demo`. Use the existing configured provider setup for
   the real voice check. Open `http://localhost:5262/check-in?debug=1` and, on the nurse screen,
   `http://localhost:5262/dashboard`. Do not run room-camera monitoring for these isolated trials.
2. Choose **I’d rather tap**, enter `P22b real trial 1`, leave optional details blank, Continue,
   permit the camera, and sit about 50 cm away with frontal light. After Face saved, confirm
   Pulse check starts without another camera permission/open. Start timing at Pulse check.
3. Stay still. Confirm a live wave and an actual `bpm · good/fair · camera estimate` within 15 s.
   Read the watch/oximeter; type its value in **Reference HR**, select **Compare locally**, and
   record time-to-reading, camera HR, reference HR, quality, SNR and fps. A blank/noisy trial
   counts as a miss; never substitute the reference as the measured value.
4. Continue (or let it continue automatically), type `Headache`, Continue, then **Skip question
   and check in**. Confirm a real queue number and the pulse/time notice. On the dashboard,
   find this exact visit. After integrator changes, confirm the saved kiosk number and actual
   measurement time remain visible with a historical camera-estimate label after >5 s.
5. Repeat steps 2–4 with names `P22b real trial 2`, `3`, `4`. Acceptance is >=3/4 fair/good
   readings within 15 s. Record the individual results; there is no asserted accuracy result yet.
6. Start another enrolled check-in, cover the camera throughout Pulse check: no number should
   appear; by 25 s it must continue with the clear-reading failure message. In a separate trial,
   acquire a number, then cover your face immediately before automatic continuation; the current
   number must disappear. Reduce light/move back/move sideways in additional trials and confirm
   the corresponding coaching, then normal reacquisition when still and well lit.
7. Start another check-in, save the face, press **Skip** during pulse, and finish the form.
   Confirm a queue number and no kiosk vitals for that skipped visit. Confirm camera access
   ends when leaving pulse and another check-in starts with a fresh countdown.
8. Reset/start a new check-in, choose **Talk to Crisp**, give an alias, decline optional details,
   and consent to the face scan. Confirm Crisp mentions the pulse check and the screen runs it.
   Let one reading complete, answer complaint/follow-up, and confirm a queue number and correctly
   associated kiosk reading. Repeat with pulse **Skip**; conversation/form continuation must work.
   If voice keeps talking, the on-screen pulse step must still stay present until completion/Skip.
9. If a real local recording is available, open `/check-in?debug=1&video=/fixtures/<file>.mp4`.
   Confirm REPLAY is visible and any saved observations have `source: "replay"`; do not count
   recording results toward the four live trials.
10. Stop the demo with Ctrl-C and confirm ports 8862/5262 are no longer listening. This packet
    does not merge, deploy, or modify checkpoint tags or `crisp-demo-stable`.
