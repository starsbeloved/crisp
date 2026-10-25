# P22c — Gemini sees

Branch: `crisp-demo-p22c`. Worktree: `.claude/worktrees/crisp-p22c`.

## What works

- The existing `POST /api/alerts/:id/vision` now sends one inline JPEG to the configured Gemini model and requests structured JSON. No route or shared type changed.
- The prompt limits output to visible posture/scene, at most 25 words, and asks for "Unclear image" when uncertain. The validator rejects patient names, proper names, identity/demographic terms, medical inferences and excessive length. Rejected or failed responses return `Image description unavailable`, source `template`.
- The existing transport supplies two attempts of at most 2.5 seconds each via an abortable race, retries only transient failures, and sets no short SDK request deadline. Identical alert/image requests share a cached result; image bytes are excluded from cache keys, results, disk and logs.
- System's existing opt-in checkbox stays off by default. Its disclosure reads: "Sends one alert frame to Google Gemini; not stored". Enabling it describes each open red request once, including amber-to-red upgrades. Turning it off stops automatic requests for subsequent alerts.
- A red request has a recorded-frame thumbnail and a manual **Describe frame** button even when automatic sending is off. Successful output reads **✦ Gemini sees:** with a Gemini source label. Failures use Template and allow manual retry. Card and drawer share the request/result; simulated preview requests never send images.
- Existing Apple Design CSS and layout remain intact. Only small mounts in DashboardPage, CrispBubble, SystemStrip and replacement of the old drawer vision stub were needed. No dependency changes.

## Verification

- `pwd` and `git branch --show-current`: confirmed the assigned worktree and `crisp-demo-p22c`; initial worktree was clean.
- `cd apps/demo && npm install`: succeeded, 0 vulnerabilities. npm reported a `node-domexception` deprecation and three package lifecycle scripts pending approval; no approval/settings changes were made.
- Test-first provider verification: 26 expected failures against the original stub, then 27 passing vision tests. Existing provider regressions also pass.
- Test-first consent verification: 5 expected failures against an empty component, then 6 passing interaction tests. Tests live under the owned `server/providers/**` directory.
- Full suite, with real provider credentials disabled:

  ```sh
  PROVIDERS_ENV=/nonexistent/providers.env GEMINI_API_KEY= ELEVENLABS_API_KEY= ELEVENLABS_AGENT_ID= npm test
  npm run typecheck
  ```

  Result: **451 tests passed in 65 files**, typecheck passed. SDK/network calls in added tests are mocked.
- Production verification:

  ```sh
  PROVIDERS_ENV=/nonexistent/providers.env GEMINI_API_KEY= ELEVENLABS_API_KEY= ELEVENLABS_AGENT_ID= API_PORT=8863 WEB_PORT=5263 npm run demo
  ```

  Vite built successfully (183 modules); API listened on `127.0.0.1:8863`, optimized frontend on `127.0.0.1:5263`. Build reports the large-chunk warning; it was not suppressed.
- Isolated real Chrome exercised that production frontend and real local API with four explicitly named **SIMULATED** visits, REPLAY observations and a generated illustration. Only vision responses were mocked. Verified: default-off sends zero requests; manual consent; shared drawer result; automatic new red request; 501 fallback and retry; turning off prevents further automatic sends. Four vision POSTs total, zero JavaScript page errors, no horizontal overflow at 1440×1000 or 390×844. Local screenshots: `apps/demo/output/playwright/p22c-desktop.png` and `p22c-mobile.png` (ignored, synthetic UI evidence).
- One separately authorized **manual real-key** check used the existing vision route on an ephemeral in-memory server, with only a generated SIMULATED illustration. No tests loaded real credentials. Evidence at `2026-10-25T08:25:42.013Z`:

  ```text
  provider describeSnapshot ok 1891
  HTTP 200; elapsed 1895 ms; source gemini
  An illustration showing a person leaning far backward over a chair.
  ```

  The illustration was intended to show forward leaning. This verifies the real multimodal request, validation, source and timing; it does not establish visual interpretation accuracy. The JPEG stayed in memory and was not logged or saved. Credentials stayed server-side and were never printed.
- `git diff --check` passed. Both implementation checkpoints were committed and pushed (`15780e9`, `c4bc030`). No merge, protected branch or tag changes.
- All servers and isolated Chrome sessions started for verification were stopped; final port checks are recorded in the completion message. Four labeled simulation records remain in this worktree's ignored `.data`; no existing data was deleted.

## What is not done

- A physical webcam/consenting-volunteer red event was not exercised. Browser tests generated red events through real observation ingestion; provider success in the production UI was mocked. The separate manual request used real Gemini on a synthetic drawing.
- The existing route can use the current camera frame when no replay frame exists. That pre-existing route behavior remains unchanged.
- Consent is scoped to this dashboard tab and resets off on reload. No image storage or cross-tab consent system was added.

## Requests for integrator

- Run the live-camera script below before filming and assess whether Gemini's scene description matches the actual frame. If the provider is uncertain or rejects output, keep the honest fallback.
- Merge this branch using the normal integration process. There are no requested code changes outside P22c ownership.

## Exact human test script

1. In this worktree run:

   ```sh
   cd '/Users/ducthanhnguyenpham/Coding/APPLE HEALTH DEVICE/.claude/worktrees/crisp-p22c/apps/demo'
   npm install
   API_PORT=8863 WEB_PORT=5263 npm run demo
   ```

   The normal server-side provider env file must be configured for the real Gemini check. Do not paste keys into the browser or terminal output.
2. Open `http://localhost:5263/dashboard`. Open Developer Tools → Network and filter `vision`. Open **System**. Confirm **Gemini sees alert frame (opt in)** is unchecked and the disclosure is visible. Close System. Ignore the four pre-existing, clearly named SIMULATED verification visits.
3. Open `http://localhost:5263/check-in` in another tab. Use the tap form to check in a consenting volunteer with a new name and complete face enrollment. Open `http://localhost:5263/camera?cam=A`, allow the camera, and keep the camera tab visible. Confirm the volunteer is recognized.
4. While seated and in view, have the volunteer lean forward so the head is below the shoulder line for at least 5 seconds. Wait for a new red **Check requested** card for that volunteer. Return to the dashboard: there should be **zero automatic vision POSTs** while the toggle is off.
5. Click that card's **Describe frame**. Confirm exactly one `POST /api/alerts/<id>/vision`. A normal success should arrive in roughly 3 seconds with response `source: "gemini"`; verify the displayed **✦ Gemini sees:** text against the recorded thumbnail. Unavailable/invalid output must show **Image description unavailable** and **Template**, never a fabricated description. Open the volunteer's drawer and confirm it shows the same result without another POST; close the drawer.
6. Open System and enable the checkbox. Mark the volunteer's existing request checked, let the volunteer sit upright, and wait at least 61 seconds for re-arming. Repeat the seated head-lowering event with the camera tab visible. On the new red request, confirm exactly one automatic vision POST without clicking Describe frame. Room updates and opening/closing the drawer must not add POSTs for this request.
7. Turn the checkbox off, mark checked, sit upright, wait at least 61 seconds, and repeat once more. Confirm no automatic POST; the manual button remains available. Reload the dashboard and confirm the checkbox resets off.
8. Stop filming-mode servers with **Ctrl-C** in the terminal that ran `npm run demo`. Confirm neither port is listening:

   ```sh
   lsof -nP -iTCP:8863 -sTCP:LISTEN
   lsof -nP -iTCP:5263 -sTCP:LISTEN
   ```
