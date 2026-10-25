# P13a report — Crisp staff companion

## What works

- Crisp Command Center heading; shared Chrome wake listener on Command Center and exam. Crisp/Chris/Crispy, continuous en-US, opt-in/off initially, visible mic status, permission errors and hidden-page cleanup. Recognition yields its mic before nurse voice starts; the post-wake command is sent once after connection. Existing hold-to-ask path and exam browser chart fallback retained.
- Nine registered client tools: digest plus eight deterministic server tools. Name matching is exact → unique prefix → disambiguate. Duplicate names never act. Call-in uses existing lobby/audio/handoff orchestration; acknowledge/checked use existing request semantics and engine reset. Tool responses appear as toasts; the nurse prompt instructs one spoken confirmation.
- Six proactive rules: room free/FIFO next; over 45 min + worsening; missing camera sighting for 10 min; chart ready after handoff; shift summary on request through the existing grounded Gemini/Template provider; hallway check-back at 30 min. Yes revalidates current conditions, Not now suppresses that event. Latest pending card can be accepted without id.
- Exam Patient done releases the room without deleting the visit or fictional history. Done/left are local dispositions exposed by GET /api/suggestions; frozen Visit/shared types remain unchanged. Accepted hallway messages are anonymized and last 10 minutes from acceptance.
- Preview cards under /dashboard?fixture=1 → Load demo fixture mutate only local synthetic state. Camera values stay quality-gated and labeled; replay-derived departure cards say REPLAY. No diagnosis or clinical queue ranking.

## What was verified and how

- `npm install`: completed; 0 vulnerabilities. npm reported existing unapproved dependency install scripts and the node-domexception deprecation; no approval policy was changed.
- `npm test`: **275 passed, 45 files**. New coverage includes exact/prefix/duplicate names, invalid inputs, occupied rooms, no mutation on ambiguity, same alert actions, all six suggestion rules, stale/duplicate acceptance, latest-card acceptance, reset, retained records, replay labels, delayed hallway expiry, appended HTTP routes, native Node TypeScript loading, wake cleanup/permission denial, tool toasts and session forwarding.
- `npm run typecheck`, `npm run build`, `git diff --check`: pass. Build still warns about an existing large main bundle (~2.4 MB minified).
- Real installed Chrome via `client/staff/verify-browser.mjs`, against isolated API **8807** / Vite **5207**: Command Center heading; fixture Yes stays local; wake off on both surfaces; Ama's fictional chart and penicillin allergy; Patient done returns exam to idle; Room 1 free card calls Ben on Yes; no one waiting afterward; Ama's record remains available; no browser page errors.
- Chrome announcement check uses **simulated speech output**, verifies one chart-ready announcement across suggestion refreshes and one requested shift-summary announcement. An immediate-completion queue bug was reproduced under browser-style React batching, fixed, and covered by a regression test.
- Curl: health OK; local dispositions report Ama done; list_waiting reports zero after Ben call; get_record still returns Ama's exact-DOB fictional history. No provider credentials were inspected or printed.
- Screenshots inspected: `/tmp/crisp-p13a-browser/command-center-fixture.png`, `command-center-live.png`, `exam-chart.png`.
- Environment: default npm dev hit EMFILE in Node's watcher; verification used a plain native Node API process and Vite separately. Vite served cached modules after edits in this hidden worktree, so it was restarted and curl verified the corrected module before the final browser run. One earlier existing store snapshot test hit its 1 ms boundary; focused and final full reruns passed. No out-of-scope fixes were made.

## What is not done

- Real ElevenLabs nurse-agent registration/configuration and physical microphone recognition/actual speaker output were not exercised. Voice lifecycle was verified with a simulated agent/recognizer in unit tests; real Chrome UI and simulated output were verified separately.
- Hallway display mount is outside this packet. The anonymized endpoint and ready-to-mount `HallwayCheckBack` component are delivered; a 30-minute check-back is proposed, then published only after staff Yes.
- Suggestions/dispositions are in memory and reset with the server or demo reset. No durable EHR, clinical scoring or automatic clinical actions are claimed.

## Requests for integrator

1. Register all nine tools and replacement nurse prompt from `.plans/elevenlabs-nurse-agent-update.md` on the nurse agent. Keep provider keys server-only.
2. Mount `client/staff/HallwayCheckBack.tsx` in the room-view hallway panel. Preserve its public-safe queue/initial-only messages.
3. Rename the shared app navigation's “Crisp Command Center” label to “Crisp Command Center” (`client/App.tsx` is outside P13a).
4. If broader lifecycle statuses are desired after the demo, integrate done/left into shared types deliberately. This packet preserves the frozen waiting/called contract: retained completed/left visits have room=null and their actual disposition is in GET /api/suggestions.

## Human checks

- Configure the real nurse agent, then enable Listen for Hey Crisp in Chrome. Test “Hey Chris, call Ama to Room 1” and bare “Hey Crisp” followed by a request; verify one call, toast and spoken confirmation. Repeat on `/exam?room=1`.
- Select the fictional Ama record (DOB 1994-06-15); “Hey Crisp, any allergies?” must read the recorded penicillin line and label it fictional. Test duplicate names, missing room, mic denial/retry and End voice.
- Enable dashboard voice; each new card speaks once. Try Yes, Not now and “Hey Crisp, yes” with a single unambiguous current proposal.
- With hallway mount added, approve a 30-minute check-back and confirm no full name, complaint or vitals appear publicly.

## Git

All work belongs on crisp-demo-p13a and is pushed there in small commits. No integration merge, main push, force push, checkpoint tag change or crisp-demo-stable change.
