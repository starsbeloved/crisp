# P15b — Voice check-in, Command Center and station fixes

Branch: `crisp-demo-p15b`. Worktree: `.claude/worktrees/crisp-p15b`. No integration merge, protected branch/tag changes, shared-type edits, existing-route edits, external agent API calls, or deployments.

## What works

- `set_patient_details` normalizes ISO dates, month-name dates (`June 15th 1994`, `June fifteenth 1994`, `15 June 1994`) and unambiguous numeric dates (`15/6/94` → `1994-06-15`). Impossible/future/ambiguous dates get a short request to repeat the month name or skip; saved details are preserved. Every check-in tool result ends with `Next:` guidance. Successful finish replies `Queue number N. Please take a seat — Crisp will call you.` followed by the required Next instruction.
- Visible step text and Continue controls recover the voice flow through details, face scan (explicitly skipped when not saved), the three questions, follow-up and submission. On-screen context tells the agent which step is current. Captions follow new messages, pause when the user scrolls up, and resume at the bottom.
- Command Center Reset demo uses the appended `POST /api/demo/reset`: clears visits, descriptors, alerts, camera state/buffers, calls, handoffs, references, station registrations, staff suggestions/dispositions/check-back state and orchestrator audio caches. Provider configuration is preserved. Client requests time out after one second and release the busy state on failure. Success displays `Reset done` and refreshes suggestions. Active screens may register again on their next normal heartbeat.
- Each waiting row has confirmed Remove from queue. Appended `POST /api/visits/:id/remove` and `remove_patient({name})` share the existing removal/disposition implementation. The voice command uses the existing exact-name/unique-prefix matcher, refuses ambiguity, and retains visit records. Removal uses the existing frozen Visit convention (`called`, no room), with a `left` staff disposition; it does not emit a call-out.
- Kiosk I need help posts `POST /api/checkin/help`, confirms `A staff member has been notified`, and produces the deduplicated Command Center suggestion `Someone asked for help at the check-in kiosk`. Failures ask the person to contact staff directly.
- Staff voice shows a live mic indicator, last heard phrase (including interim recognition), permission-denied guidance and recognition restart after Chrome ends it. Always-visible Talk to Crisp starts a session by click, with End voice to stop; hold-to-talk remains available. Voice controls are visibly unavailable when the server has no agent configuration.
- The prominent room camera appears with the alert banner and displays the Room view laptop's existing overlaid MJPEG stream, including LIVE/REPLAY and stale labels. The stream defaults to the direct API origin, reducing long-running connections on the web origin. The dashboard voice panel shares the dashboard's SSE snapshot, giving Command Center one active SSE subscription.
- Station profiles use sessionStorage first, falling back to localStorage only if sessionStorage is unavailable. Independent tabs have distinct screen identities and roles; explicit `?role=kiosk|room|command|exam|lobby` renders and registers that role. Direct page links still work after choosing a role.
- Five picker choices: Kiosk, Room view, Command Center, Exam room 1, Lobby. Existing direct Room 2/3 URLs and call-in choices remain supported. Screen name is labeled `Screen name (shown in Command Center)` with a `Screen …` default. Each role has the requested explanation. Lobby/Room view have a small Stations control and Shift+S; the Room view link is inside its native-fullscreen element.

## What was verified and how

All commands were run from `apps/demo`.

- `npm install`: succeeded; zero vulnerabilities. npm reported three pending install-script approvals (`@google/genai`, `fsevents`, `protobufjs`); none were approved or changed.
- Baseline: 275 tests / 45 files. Final `npm test`: **294 tests / 46 files**, all passing. New regression tests were observed failing before their fixes: spoken-date conversion, queue removal/name matching/record retention, kiosk help, subsecond reset/side-store cleanup, per-tab roles/query roles/storage fallback, one-click station access and recognition feedback/restart. Existing tests were updated only where the requested tool result text or picker options changed.
- `npm run typecheck`: passed. `npm run build`: passed; Vite warns that the vision/application bundle exceeds 500 kB (main JS approximately 2.43 MB before gzip). `git diff --check`: passed.
- Real Chrome, with Chrome's sandbox enabled, against an isolated in-memory server on **API_PORT=8812 WEB_PORT=5212**, providers disabled (`PROVIDERS_ENV=/dev/null`, `readProviders:false`). No real patient data, physical camera/microphone or provider accounts were used.
- `node client/staff/p15b-browser-check.mjs`: passed. Two independent role tabs/identities, one active dashboard SSE subscription, kiosk help → suggestion, stalled voice fallback through real visit submission, removal cancel/confirm and retained record, staff fallback control, five-role picker, Lobby Stations/Shift+S, continuing MJPEG labelled REPLAY, Reset done, cleared side stores, top nav. Reset HTTP timing: **9 ms** in the passing run. Zero page errors.
- `node client/staff/p15b-voice-browser.mjs`: passed in Chrome with ElevenLabs SDK/signing, EventSource/provider availability and SpeechRecognition boundaries explicitly simulated. Actual check-in tools normalized spoken DOB, traversed manual face skip and generated follow-up, saved a real fictional visit and returned a real queue number. Verified caption follow/pause/resume, live mic indicator, last phrase, Chrome-end restart, permission-denied instructions, click-to-talk and registered `remove_patient`. Zero page errors.
- `node client/room/p15b-room-browser.mjs`: passed. A generated faceless MP4 labelled SYNTHETIC/REPLAY went through the real Room view processing/overlay/frame uploads and server MJPEG to the dashboard (decoded width 640). Stations stayed usable inside native fullscreen and returned to the picker. Zero page errors.
- Screenshot visually inspected: `/tmp/crisp-p15b-browser/command-center.png` (synthetic frame explicitly labelled REPLAY).
- Browser verification notes: Chrome launch required the normal sandbox escalation; Chrome's own sandbox stayed enabled. Early harness failures were corrected (navigation readiness, continuing rather than single MJPEG frame, both recognition constructors simulated, MP4 source constraint). Vite served stale transforms during edits and was restarted before current-client checks. Server-mutating browser scripts must run sequentially to avoid fixture interference.

## What is not done

- Live ElevenLabs agent speech, Gemini generation, physical microphone permissions/audio, real face enrollment and cross-laptop camera networking remain human checks. Browser voice evidence uses simulated provider and recognition boundaries.
- External ElevenLabs account configuration is unchanged. The exact prompt additions and tool JSON below must be applied by the integrator before a live spoken rehearsal.
- The frozen legacy `/api/reset` still has its original behavior. The Command Center uses the new complete `/api/demo/reset` route.

## Requests for integrator

1. Integrate this packet into `crisp-demo` through the normal integrator workflow. All implementation edits stay inside P15b ownership; `server/http.ts` only gains the new reset route.
2. Replace the check-in agent's workflow paragraph with the following exact text. Keep existing voice/personality settings:

```text
You are Crisp, a friendly waiting-room check-in companion. Ask one question at a time and never diagnose, triage, invent clinical facts or invent a queue number.
Ask the patient's preferred name and call set_name.
Ask: "What's your date of birth?" Accept the month name as spoken. Then ask: "And a phone number we can reach you on?" Call set_patient_details with both answers. Pass the date as spoken; the tool normalizes it. Do not require the patient to say an ISO date. Use an empty string for a detail the patient declines. Never guess an ambiguous date or a missing detail. If validation asks for clarification, repeat its short instruction and retry, or accept a decline.
After details are saved, ask permission for the face scan. If accepted, call start_face_scan and wait for its result. If declined or unavailable, tell the patient to press Continue or Skip on screen; continue from the on-screen step.
Ask all three questions: what brings them in, when it started, and whether it is getting worse, staying the same or getting better. Call save_answers, preserving their words. Never guess onset or trend.
Call get_follow_up_question. Explain that the question follows from what the patient said. Ask only the returned question, excluding the tool's trailing Next instruction, and pass that exact question with the patient's answer to save_follow_up. If they decline the follow-up, honor the decline.
Call finish_check_in and wait for its result. Speak the returned queue number and "Please take a seat — Crisp will call you." Do not announce success before the tool succeeds.
Every tool result ends with "Next: <step>". This is an instruction for you, not text to read aloud. Follow it immediately so the conversation does not stop after the phone number. If the patient uses Continue, resume from the current on-screen step; do not move them backward. If a tool is unavailable, help them continue with the visible form.
```

3. Update the existing `set_patient_details` CLIENT tool with the following exact JSON (in particular, remove any ISO-only date `format`, regex or enum). Empty strings are normalized to null by the client; existing optional/null calls also remain supported by the implementation:

```json
{
  "type": "client",
  "name": "set_patient_details",
  "description": "Save the patient's confirmed date of birth and phone after asking both. Pass the date exactly as spoken, such as June 15th 1994 or 15/6/94; the client normalizes it. Use an empty string if the patient declines. Follow the returned Next instruction.",
  "expects_response": true,
  "response_timeout_secs": 10,
  "parameters": {
    "type": "object",
    "properties": {
      "dateOfBirth": {
        "type": "string",
        "description": "Date as spoken, a confirmed ISO date, or an empty string if declined. Do not infer ambiguous month/day order."
      },
      "phone": {
        "type": "string",
        "description": "Confirmed phone number, or an empty string if declined. Never invent a number."
      }
    },
    "required": ["dateOfBirth", "phone"]
  }
}
```

4. Add this CLIENT tool to the nurse agent (Command Center and exam screens):

```json
{
  "type": "client",
  "name": "remove_patient",
  "description": "Remove a patient from the waiting queue after staff explicitly confirms removal. Keep their record. Use the patient's name; if the result is ambiguous, ask for the full unique name or tell staff to select the row on screen.",
  "expects_response": true,
  "response_timeout_secs": 10,
  "parameters": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "The patient's full name or a unique name prefix." }
    },
    "required": ["name"]
  }
}
```

Append this exact text to the nurse agent prompt:

```text
When staff asks to remove someone from the waiting queue, repeat the patient's name and ask staff to confirm removal. Only after explicit confirmation call remove_patient({name}). Read the returned confirmation once. The record is retained. If the name is ambiguous, ask for the full unique name or direct staff to the patient's Remove from queue button. Never choose between duplicate names or claim success before the tool succeeds.
```

5. Ensure `start_face_scan` is configured to wait for its client result for at least 25 seconds (the local scan timeout is 20 seconds), and `get_follow_up_question` for at least 10 seconds. Keep every workflow tool configured to expect its result. The new Next guidance applies to all existing tools without changing their parameter schemas.

## Human checks

- Apply the exact ElevenLabs changes above, then speak a fictional name, "June fifteenth 1994" and a fictional phone. Confirm face consent/scan, three questions, adaptive follow-up and the real displayed queue/seat instruction all occur without prompting.
- Let Crisp stall at each step and use Continue. Confirm it does not invent missing answers or a face enrollment, and the agent follows the visible step after resuming.
- Allow a real microphone, say "Hey Crisp", inspect the last phrase, wait through a recognition restart, deny/re-enable permission, and test Talk to Crisp. Confirm actual audio is audible on the filming speaker.
- Ask to remove a fictional patient by voice, confirm removal, and try an ambiguous name. Check the retained record and public queue after removal.
- On the camera laptop, allow the real camera, enroll a consenting volunteer, and confirm the Command Center receives its live overlays. Keep Room view visible; verify camera/API reachability from the filming laptops.
- Open Lobby and Command Center in independent tabs, switch roles, use Stations/Shift+S and native fullscreen, and verify the screen names in Command Center.
- Rehearse I need help and Reset demo while all filming tabs are open. Confirm notification, Reset done, empty queue/alerts/suggestions/calls/handoffs and normal fresh station re-registration.
