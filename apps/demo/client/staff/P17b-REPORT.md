# P17b — Voice, exam room and filming records

## What works

- Wake listening accepts hey/hi/okay plus a complete word within two Levenshtein edits of crisp, including merged forms such as heychris. The recognized wake phrase is displayed separately from the command. Chrome recognition restarts after normal stops and transient start/network failures; denied microphone permission still requires staff action.
- A command returns an explicit instruction to confirm once and ask “Anything else?”. Staff farewells close the local voice session; eight quiet seconds after a completed command/prompt also close it. The timer pauses for agent speech, pending tools, and microphone activity. Wake recognition resumes when previously enabled, on both Command Center and Exam.
- One pure room helper normalizes 1 / Room 1 / room one, including legacy values received through the frozen call-in route. Staff call-in, occupancy, patient-done, records, exam gallery, exam candidates, station links and clinician labels agree. A new call-in replaces an older manual chart selection. Queue-number tooltips distinguish #1 from Room 1.
- Exactly Jason Miller (1990-03-12), Daniel Kim (1985-11-02), Anna Lopez (1997-07-21), with allergies, medications, problems and two prior visits each. History and historical vitals are labeled fictional. Name-only matches are labeled; a wrong DOB never falls back. Missing-history and allergy readback use the requested natural sentences.
- Doctor record requests carry the selected visit and room, preventing cross-room retrieval. Lobby is hidden from the station picker; its direct route and top navigation remain available.
- Filming reference: `.plans/content/demo-patients.md`.

## What was verified and how

- `npm install`: 144 packages, zero audit vulnerabilities. npm reported pending install scripts for @google/genai, fsevents and protobufjs; no blanket script approval was granted.
- Red/green regression tests cover fuzzy/merged wake matching, matched-phrase display, room aliases, occupancy, scoped retrieval, the three records and DOB matching, natural wording, newest-call chart selection, station choices, farewells, silence, speech/tool pauses, and microphone activity.
- `npm run typecheck`: passes.
- Latest full `npm test`: **320 passed, 5 failed (325 total)**. All five failures are obsolete expectations in the two server test files outside the allowed ownership; see below. Tests were not skipped, disabled, or made to accept old fictional identities.
- Production built and run on API 8822 / WEB 5222 with `API_PORT=8822 WEB_PORT=5222 npm run demo`. For provider-free automated runs, `PROVIDERS_ENV=/private/tmp/crisp-p17b-no-providers` was additionally set to an absent path. Real keys were not inspected or printed.
- `node client/staff/p17b-production-browser.mjs`: passed in installed Chrome with the optimized build and actual local API/SSE. Verified station choices; room-one call-in; automatic chart opening; exact queue/room label and tooltip; name-only match; allergy readback; both other demo records and two past visits; wrong-DOB rejection; Patient done clears chart; direct Lobby route. No browser console errors. This script requires a fresh isolated demo state with no existing filming names. It leaves its fictional visits retained and marked done.
- `node client/staff/p17b-production-voice-browser.mjs`: passed on the final rebuilt production bundle with the actual installed ElevenLabs SDK, a simulated Web Audio microphone stream, simulated browser recognition and a simulated provider WebSocket. On both surfaces, verified recognition restart, fuzzy/merged match display, initial command forwarding, command result's Anything else instruction, all four farewell forms, silence ending and wake resumption. No browser console errors. Actual microphone recognition accuracy and external provider speech were not exercised.
- `API_PORT=8822 WEB_PORT=5223 npm run dev:client` plus `node client/staff/p17b-voice-browser.mjs`: equivalent flow passed in Chrome with explicitly simulated SDK/recognition boundaries.
- All servers started here were stopped; no listeners remain on 8822, 5222 or 5223.
- Build retains its existing >500 kB bundle-size warning. An initial test command accidentally run at the historical repository root failed on missing `server/src/http.ts`; subsequent application validation used `apps/demo`.
- Headless macOS microphone acquisition stayed pending during an initial real-SDK test despite fake-device flags; the final harness supplies an actual silent Web Audio MediaStream and labels that boundary simulated.

## What is not done

- Five old tests remain red because editing outside P17b ownership is forbidden and permission to update them was not received during implementation:
  - `server/records.test.ts`: “seeds 4–6 fictional histories and requires exact name and DOB”; “never uses a unique prefix or an ambiguous checked-in name to guess a record”; “reads an empty recorded allergy list as None recorded”; “serves visit records and a room-scoped called-patient gallery without modifying the waiting-room gallery”. These still require Ama/Ben and the former record count/matching rules.
  - `server/commands.test.ts`: “lists waiting, returns recorded summary and exact DOB matched fictional history” still requires Ama's removed history.
- Real microphone/provider rehearsal and ElevenLabs account configuration remain for the integrator/user. The browser supplies the closure fallback and prompt instructions, but the provider must be configured to reliably ask Anything else and use its system end_call tool.
- Frozen `shared/types.ts` and `server/http.ts` were unchanged. No P17a voice wiring was edited. No merge, deployment, tag manipulation, or provider-account change was performed.

## Requests for integrator

1. Update the two named server test files to the three filming patients and current matching rules, then run the full suite. New regression coverage is in `client/staff/p17b-records.test.ts`. Replace Ama fixtures with Anna / 1997-07-21, expect Anna Lopez's Penicillin history, assert exactly three records, permit unique first-name matching when DOB is omitted, and keep mismatched DOB/ambiguous visit rejection checks. The former Ben empty-allergies example must be replaced with the current fictional records' assertions (or an explicitly constructed empty-list fixture).
2. Apply the following settings to the **nurse/staff agent** (used by both Command Center and Doctor). Merge these fields into its existing configuration; preserve existing client tools and the check-in agent's workflow. No account changes were applied in this packet.

```json
{
  "conversation_config": {
    "turn": {
      "turn_timeout": 30,
      "silence_end_call_timeout": -1
    },
    "agent": {
      "prompt": {
        "built_in_tools": {
          "end_call": {
            "type": "system",
            "name": "end_call",
            "description": "",
            "params": { "system_tool_type": "end_call" }
          }
        }
      }
    }
  }
}
```

Append these exact lines to the nurse/staff system prompt:

```text
Use the client tool for every staff command. Speak its returned message once, then ask: "Anything else?"
If the user says "no", "that's all", "thanks", or "stop", call the system tool end_call immediately. Do not ask another question.
After "Anything else?", wait quietly for a new request. Do not repeat the question or send silence nudges; the app ends the session after 8 seconds of silence.
For get_record, read the returned message exactly. A missing record must be described as "I don't have earlier records for <first name> in this demo system."
Use only recorded facts. Camera values are estimates; replay must be labeled REPLAY. Never diagnose or rank patients clinically.
```

`turn_timeout: 30` prevents the provider's default seven-second nudge from resetting the app's eight-second timer. The app owns the timeout specifically after a completed exchange; leave the provider's global silence hangup disabled. `end_call` is a **system** tool, not a client tool. Official schema: [End call](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/end-call), [conversation turn timing](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow), [agent API fields](https://elevenlabs.io/docs/api-reference/agents/get).

3. Merge P17a first and P17b second as specified by the packet, rebuild, run the human rehearsal, and let the integrator manage any checkpoint tag.

## Exact human test script

1. From `apps/demo`, run `API_PORT=8822 WEB_PORT=5222 npm run demo`. Open Chrome DevTools Console and keep it visible. For live voice, use the configured provider env; do not use the absent env-path override above.
2. Open `http://localhost:5222/station?choose=1`: expect Kiosk, Room view, Command Center, Exam room 1, and no Lobby choice. Open `/lobby` directly: it still works. Top-bar links are unchanged.
3. Use a fresh filming state if #1 is required (reset only a disposable demo using its on-screen confirmation). Open `/exam?room=1` in another tab. At `/check-in`, choose tap check-in and enter **Anna**, DOB **1997-07-21**; complete check-in, skipping the face scan if appropriate. Leave today's reason in the patient's own words. She should be queue #1 in a fresh state.
4. On `/dashboard`, click **Listen for Hey Crisp**, grant microphone permission, then say **“Hey Chris, call Anna to room one.”** Expect “Matched wake phrase: Hey Chris”, confirmation, then “Anything else?”. Expand **With clinician**: expect **#1 · Anna — Room 1**. Hover #1: **Queue number**. Switch to the already open Exam tab: Anna's chart has opened without a camera match. It says her arrival has not been confirmed and labels history **Demo records — fictional**.
5. In Exam, enable **Listen for Hey Crisp**. Say **“Hi Kris, any allergies?”** Expect **“From Anna's demo record: allergic to penicillin.”** Say **“No.”** Expect End voice to disappear and wake listening to resume. Repeat using **“Okay Christ, any allergies?”**, replying **“that's all”**, **“thanks”**, and **“stop”** on separate sessions.
6. Wake Crisp again, request allergies, then remain silent after “Anything else?”: expect automatic session closure after about eight quiet seconds and wake listening to resume. Repeat once on Command Center with **“Hey Crisp, list waiting.”** Also give a spoken follow-up while the timeout would expire: it must not cut off active speech.
7. Click **Patient done** for Anna. Check in **Jason Miller / 1990-03-12**, call him to Room 1, and verify Penicillin, medications, problem list and two past visits. Mark done. Repeat with **Daniel Kim / 1985-11-02**, expecting Latex.
8. Mark done; check in **Anna** with **no DOB**. Call to Room 1 and expect **matched by name only**. Mark done; check in **Anna** with wrong DOB **1997-07-20** and call to Room 1: expect **“I don't have earlier records for Anna in this demo system.”**, with no fictional allergy list shown. If repeated first names prompt clarification in staff voice, use the selected visit's on-screen Call in action.
9. Leave wake listening idle through Chrome's automatic recognition stop; it should restart. Check the Console for errors. Close the test tabs and stop the demo process with Ctrl+C when finished.
