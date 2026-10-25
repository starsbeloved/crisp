# P1 check-in report

## What works

- Welcome → preferred name/alias → optional face enrollment → complaint, onset and trend → optional follow-up → server-confirmed queue number.
- Five accepted face descriptors are averaged; multiple faces, small faces, low confidence and invalid descriptors are rejected. Retake, Skip, scan timeout and camera cleanup are implemented.
- Models load and run a blank-canvas warm-up on page mount.
- `useCheckIn()` implements the frozen controller, with synchronous latest values for consecutive voice calls. `CheckInContext` wraps the form and `CrispAgentSlot`, which mounts P7's existing `agent/CrispAgent.tsx`.
- Duplicate finish calls share one request; failures retain answers and allow retry. Done resets every field after ten seconds.
- A corrected complaint discards its old follow-up; late form question requests cannot overwrite a newer voice question.

## Verified and how

- `npm install`: succeeded, zero reported vulnerabilities. npm reported dependency install scripts awaiting approval; no script approval was granted.
- `npm test`: 20/20 passed, including P0 server tests. Controller tests exercise voice tool ordering, scan averaging/rejection, camera release, cancellation/timeout, retry, duplicate submits, reset and follow-up races.
- A controller integration test uses a synthetic detector and the real HTTP server: saves a 128-dimensional descriptor, then reads the matching gallery entry from `/api/gallery`. This does not establish real-video detection accuracy.
- `npm run typecheck`: passed.
- `npm run build`: passed, with Vite's >500 kB JavaScript chunk warning (face-api is included in the app bundle).
- Real Chrome, API 8781 / web 5181: completed the tap flow with face skipped, saw server-confirmed queue #1, then saw the same named visit in the dashboard queue. A second flow on the final source confirmed complaint corrections clear the old follow-up and skipping the question creates queue #2, followed by automatic return to Welcome.
- Chrome viewport checks at 390×844 and 1280×800: no horizontal overflow; question chips measured 44 px high; heading measured 30 px on desktop.
- Missing replay video is visibly labeled REPLAY; the patient can skip and continue.
- `git diff --check`: passed.

## Not done

- Successful single-face and two-face video replay acceptance could not run: this checkout contains neither `public/fixtures/checkin.mp4` nor `public/fixtures/room.mp4`. No successful real face enrollment or recognition is claimed.
- Voice conversation is P7's packet. Provider-backed follow-up is P6's packet; the server's existing template fallback works.

## Requests for integrator

- Supply the consenting single-face `apps/demo/public/fixtures/checkin.mp4` and two-face `room.mp4` fixtures, then run the packet's real replay acceptance against the merged camera code.
- P7 should consume `CheckInContext` from `controller-types.ts`; its agent already mounts inside this provider. No frozen interface or route changes are requested.
- The normal `npm run dev` hit `EMFILE` in Node's watch mode. Verification used separate commands, both with `API_PORT=8781 WEB_PORT=5181`: `node server/main.ts` and `CHOKIDAR_USEPOLLING=1 npm run dev:client`. Provider keys were disabled for checks with an absent `PROVIDERS_ENV` path. Vite hot reload also missed edits, so the Vite process was restarted before final browser checks.
- Consider splitting the face-api bundle after integration if startup size matters; the production build succeeds.

## Human checks

- Enroll using a real webcam, including Retake and Skip.
- Leave the face step and confirm the physical camera is released and can be opened by `/camera`.
- Confirm the room camera recognizes the enrolled person after P2 is integrated.
- After P7 integration, check the real microphone, speaker, voice tools and simultaneous field corrections.

## Execution record and rulings

- Workspace and branch verified: isolated `crisp-p1` worktree, `crisp-demo-p1`; initial tracked working tree clean.
- Preflight: only `client/checkin/**` owned; `agent/`, `controller-types.ts`, shared types, HTTP routes and package metadata remain untouched.
- Ruling: `NewVisitInput` carries `via` inside `answers`, so the controller maps its `via` there using the frozen contract. Cost if wrong: P0/P8 must revise the shared contract and both consumers.
- Step 1: form/controller and enrollment checks green; committed/pushed as `24744af`.
- Final review: self-review (no subagent tool available). Found stale follow-up retention and a late-response overwrite; both reproduced RED, fixed, and verified GREEN in the 20-test suite.
- Deferred minors: none in P1's implementation. Missing fixtures, hardware checks and the shared bundle warning are listed above.
