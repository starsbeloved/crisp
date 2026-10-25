# P13c — Check-in flow fixes

Branch: `crisp-demo-p13c`. All changed project files are under `client/checkin/`.

## What works

- Welcome offers **Talk to Crisp** and **I’d rather tap**, with no separate Start. Either choice moves directly to the name step.
- Name step collects optional DOB and phone before the face step. Calendar dates and phone formatting are validated without guessing. Details stay editable during voice check-in, survive partial complaint corrections, submit through the existing visit API, and clear for the next patient.
- Flow remains name/details → face → three questions → adaptive follow-up → done. Face skip and staff-help paths remain available.
- Form and voice use the existing `/api/checkin/follow-up` endpoint. Both show the returned question, **Gemini follow-up** or **Template fallback**, and “Because you mentioned …” quoting the patient's own words without interpreting them.
- Voice tools require `get_follow_up_question` before saving a follow-up or finishing; an invented question or changed complaint requires the correct follow-up. A declined follow-up remains optional.
- Consecutive voice tools read current name/answers before React renders. The done screen keeps the voice session mounted for eight seconds so Crisp can say the actual server queue number, then releases the microphone. Reset/unmount also releases it.
- Voice startup awaits the SDK promise so a rejected start reaches the existing tap fallback.

## What was verified and how

From `apps/demo/`:

- `npm install`: completed; audit reported zero vulnerabilities. npm reported three package install scripts pending approval; no approval or package changes were made.
- Baseline: 138 tests passed. Final `npm test`: **149 tests passed across 22 files**.
- `npm run typecheck`: passed. `git diff --check`: passed.
- `node client/checkin/agent/browser-check.mjs`: real Chrome, API **8802**, web **5202**, providers disabled, fictional patient details and an in-memory video labeled **SYNTHETIC** and **REPLAY**. Verified immediate mode choice, invalid-phone handling, DOB/phone persistence across Back, decoded replay frames with no false enrollment, face skip, all three questions, real server Template response and explanation, saved visit through SSE, real queue number, reset clearing details, populated lobby without DOB/phone, unavailable-voice fallback, 375px width without horizontal overflow, and reduced motion.
- `node client/checkin/agent/browser-voice-check.mjs`: real Chrome with only the ElevenLabs SDK/signing and Gemini response boundaries simulated, explicitly labeled **SYNTHETIC voice session — provider simulated**. Verified registered tools, DOB/phone display, required follow-up call, Gemini-label display using a fixture response, exact-question answer, real visit creation/queue result, and microphone-release timing. No live provider, microphone, or provider account was used.
- Screenshots visually inspected: mobile identity form, template follow-up, simulated voice follow-up. Browser screenshots are generated under `/private/tmp/crisp-p13c-*.png`.
- Also opened the real SDK welcome page in normal Chrome; both mode choices rendered.

Run notes: one initial test command was issued from the historical repository root and failed on its missing `server/src/http.ts`; all demo runs were then issued from `apps/demo` and passed. Earlier browser harness failures (overbroad replay URL matching and a queue-order-dependent lobby assertion) were corrected before the final passing runs. Browser evidence also caught and verified fixes for stale consecutive-tool reads and premature voice teardown. Vite served stale transformed modules after edits in this environment; the browser checks used a refreshed server. The unavailable-voice test intentionally receives HTTP 503.

The repeatable browser checks use the repository's installed Playwright package and a temporary Chrome session. The replay video contains no person; positive recognition/enrollment with a volunteer is a human check. Tests for enrolled descriptors and the real server gallery remain green.

## What is not done

- Live ElevenLabs speech and live Gemini generation were not exercised. The provider account configuration must expose the new identity tool before the complete spoken flow can work.
- Real webcam permission prompts, consent, cross-camera enrollment/recognition, and the three-laptop rehearsal remain human checks.

## Requests for integrator

1. Register a **client tool** named `set_patient_details`, waiting for its response. Parameters:
   - `dateOfBirth`: optional string or null; confirm **YYYY-MM-DD** with the patient; never infer an ambiguous date.
   - `phone`: optional string or null; preserve the patient's confirmed number; null if declined.
   - Partial calls update only the supplied field, so DOB and phone may be saved separately or together.
2. Tighten the check-in agent prompt: name/`set_name` → “What's your date of birth?” → “And a phone number we can reach you on?”/`set_patient_details` → consent/`start_face_scan` → reason, onset, trend/`save_answers` → **mandatory** `get_follow_up_question` → explain it follows from the patient's own words → ask its exact returned question → `save_follow_up` (or honor a decline) → `finish_check_in` → speak the returned queue number. Client contextual guidance mirrors this; account-side tool registration is still required.
3. Keep DOB/phone confined to appropriate staff-facing views and out of lobby/hallway UI when integrating P13f/P13g. The existing lobby check passes. Existing shared types and server validation already accept both fields; **no shared type changes are requested**.
4. Merge this branch through the integrator workflow. This session does not merge into `crisp-demo`.

## Human checks

- With the registered tool and updated agent prompt, speak the complete Ama scenario using fictional DOB/phone. Confirm Crisp asks both identity questions and the adaptive follow-up, shows why, and says the displayed queue number fully.
- Allow camera/microphone access on the filming browser. Confirm a real face enrolls and the camera releases after leaving the face step or changing station.
- Switch Talk → Tap after speaking identity details; correct a DOB/phone, then finish. Confirm the details reach the staff/exam view and are absent from public screens.
- Rehearse the three-laptop sequence and cross-camera match with a consenting volunteer. Check failure fallback and clean reset between patients.
