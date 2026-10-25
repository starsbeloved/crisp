# P13f — Exam room and fictional records

Branch: `crisp-demo-p13f`. Entry: `/exam?room=1` (also rooms 2/3).
Development verification used API `8804`, web `5204`, and no provider credentials.

## What works

- Five invented histories, matched by exact full name (ignoring case and outer whitespace) plus exact DOB. Missing DOB, wrong DOB, partial names and unknown patients never guess a history.
- Room-specific call-in preloads the chart with an explicit “on the way / arrival not confirmed” banner.
- Local exam camera recognition uses only called patients assigned to this room. A single clear face must match across three consecutive detector passes, with separation from the next identity. It confirms arrival and selects the chart. No exam frames or video are uploaded.
- Camera tracks stop on unmount, disabling recognition, disconnection or leaving a role, including when camera permission resolves after unmount. A local video input supports labeled REPLAY recognition.
- Read-only chart: name, DOB, age, staff-only phone, queue number, wait until call-in; verbatim check-in and follow-up; labeled Gemini/Template summary; timestamped camera estimate, check requests and nurse actions; labeled SBAR handoff; fictional allergies first, medications, problems, prior visits and historical vitals.
- Low quality and stale current camera values are hidden. Historical sample numbers are not plotted because the shared history lacks quality metadata. Stored handoffs containing numeric low-signal values are replaced in the exam view by a labeled template using the recorded answers and timeline.
- “Listen for Hey Crisp” is off by default. Browser voice handles exact-name chart retrieval and verbatim allergy read-back; unsupported questions do not generate clinical answers. “Read recorded allergies” provides a button fallback. Missing history says “No prior record found”; only an existing empty allergy list says “None recorded”.
- Optional existing nurse agent integration provides `get_room_digest` and `get_record({name})`. The agent button is available only when the existing agent service is available. Wake listening and the agent session are mutually exclusive. The agent disconnects on leaving the page or losing the state connection.
- Record responses and allergy replies belong to their visit, so delayed replies and patient switches cannot reuse another chart’s history.

## Verified and how

- `npm install`: completed; 0 reported vulnerabilities. npm reported allow-scripts notices for the existing `@google/genai`, `fsevents` and `protobufjs` packages; no script-approval policy changed.
- `npm test`: **160 tests passed in 27 files**, including 22 new P13f tests. Existing demo tests remain green.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vite reports the application bundle exceeds 500 kB (approximately 2.4 MB minified).
- `git diff --check`: passed.
- Chrome at `http://localhost:5204/exam`: real SSE/API flow with explicitly SYNTHETIC check-in data and REPLAY observations. Verified idle room; call-in preload; original answers and follow-up; age/phone; allergies-first fictional history; recorded nurse acknowledge/check actions; safe handoff fallback; hidden low-signal numbers; wrong DOB → no history; selecting another chart; room 2 excludes room 1; empty recorded allergies → “None recorded”; room 3 remains idle.
- Automated tests exercise exact record lookup, malformed requests, room-specific gallery, duplicate names, no prefix matching, calendar age, wake parsing, low/stale values, delayed responses, allergy reply isolation, three-frame arrival confirmation, late camera permission cleanup and stopping/restarting voice during speech.
- Screenshot: `/private/tmp/crisp-p13f-exam-desktop.png` (fictional/SYNTHETIC test data only).

### Environment notes

- Normal `npm run dev` encountered `EMFILE` with the parallel sessions. Verification used `node server/main.ts` without watch and Vite’s explicit `server.watch.usePolling: true`, with both required ports set. No project-wide configuration changed.
- An initial `npm test` was accidentally run from the repository root and exercised preserved legacy tests; it failed on the missing legacy `server/src/http.ts`. All required tests above were then run from `apps/demo`. No legacy files changed.
- One full demo run hit the existing `server/store.test.ts` clock-boundary flake: its “fresh” fixture is only 1 ms inside expiry, so wall-clock advancement can expire it before the assertion. The isolated rerun and final complete 160-test run passed. That test was not changed outside packet ownership.
- Browser local-file selection was blocked: the browser approval gate dismissed the permission request and did not grant authority to select the local video. The upload control was not bypassed. A two-second SYNTHETIC no-face fixture is available at `/private/tmp/crisp-p13f-synthetic-no-face-v2.mp4`; it is not committed.

## What is not done

- Physical cross-webcam face recognition and microphone/speaker rehearsal were not verified in this session. Arrival confidence and media cleanup are tested with deterministic detector/media fixtures.
- Browser replay selection could not be completed because of the browser approval gate described above.
- Live ElevenLabs doctor-agent playback/tool invocation was not exercised; no account or remote agent settings were changed.
- EHR/FHIR integration is the pitch’s next step; the records in this packet are fictional in-memory examples.

## Requests for integrator

1. Preserve the permitted `/exam` import/route in `client/App.tsx` while integrating P13g. `ExamPage` reads `?room=N` and releases media when unmounted.
2. Preserve the appended `handleExamRequest` dispatch before the final 404 in `server/http.ts`. It adds only:
   - `GET /api/records?visitId=…`
   - `POST /api/records/get_record {name, room?, visitId?}`
   - `GET /api/exam/gallery?room=N` (called patients only; the waiting-room gallery is unchanged).
3. P13a/agent configuration: declare the nurse agent’s response-bearing client tool `get_record` with required string `name`. `createExamVoiceTools` is exported for reuse. Read `allergyText`/`readBack` verbatim and label demo records fictional; do not interpret records. The browser retrieval commands work independently of that provider configuration.
4. Fix `server/providers/index.ts` handoff generation at the source: its current template embeds `hrBpm`/`rrBpm` even for low signal. The exam view guards this, but other consumers still receive the existing handoff.
5. No shared type change is required for current functionality: DOB/phone already exist. If complete historical camera charts are wanted later, retain signal quality and LIVE/REPLAY provenance per `VitalsPoint` and alert. Current shared history does not retain that evidence; this packet does not invent it.
6. Stabilize the existing `server/store.test.ts` camera-expiry test with a frozen clock; its current real-time 1 ms margin can fail under parallel load.

## Fictional seed identities

Use these exact names and DOBs at check-in. Phone is not part of history matching.

| Name | DOB | Recorded allergy |
| --- | --- | --- |
| Ama | 1994-06-15 | Penicillin, recorded 2023 (demo record) |
| Ben | 1988-11-02 | None recorded |
| Cara | 1975-03-21 | Latex, recorded 2022 (demo record) |
| Dev | 2001-09-10 | Peanuts, recorded 2020 (demo record) |
| Elena | 1962-12-04 | None recorded |

## Human checks

1. Check Ama in with **1994-06-15**, enroll her face on the kiosk webcam, then call her to Room 1. Open `/exam?room=1` on the exam laptop. Confirm “on the way”, then walk into its webcam and confirm “face recognized”. Test an unknown face and two faces: neither should select a different chart.
2. Choose a local consenting-volunteer video with the REPLAY input (or the synthetic no-face fixture above), verify REPLAY stays visible, then choose Use webcam and switch the station role. Confirm the camera indicator releases. The synthetic no-face fixture must never confirm arrival.
3. Enable Listen for Hey Crisp and say “Hey Crisp, pull up Ama’s chart”, then “Hey Crisp, any allergies?”. Confirm the recorded Penicillin sentence is read without clinical commentary. Turn listening off during speech and re-enable it.
4. Configure the existing nurse agent’s `get_record` tool, then test Talk to Crisp. Confirm its mic closes on role change/disconnection.
5. Rehearse Ama and Ben across all three laptops, including DOB mismatch/no history and the station switch from kiosk to exam room. Remove rehearsal visits using the existing authorized demo workflow before filming.
