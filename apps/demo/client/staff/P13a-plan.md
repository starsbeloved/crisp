# P13a implementation plan

Goal: extend the existing nurse voice path into Crisp Command Center with deterministic staff commands and human-confirmed suggestions.
Spec: .plans/codex/P13-crisp-agent.md (P13a, proactive agent, P13f, Demo v2), plus the user's explicit scope.

Architecture: commands share RoomStore, engine.onChecked and Orchestrator.onCall with existing buttons. Proactive suggestions and visit dispositions remain local to server/proactive.ts; GET /api/suggestions exposes them without changing shared types. Existing SSE remains unchanged; suggestion clients poll every five seconds. Browser wake recognition yields its microphone to the existing ElevenLabs nurse session and forwards the utterance after connection.

Constraints: no new dependencies, no provider changes, no frozen shared types or existing route changes; append routes only. Voice/wake off initially. Camera estimates and replay labeled; histories fictional. Every mutation needs a human command or Yes. Ports API 8807 / web 5207.

Review focus: ambiguous/duplicate names; stale/double suggestion acceptance; room occupancy and concurrent completion; mic cleanup/permission denial/self-triggering; synthetic preview must not mutate live data.

- [x] Commands: write failing name matching/action tests, implement exact then unique prefix, validate parameters and reuse existing action semantics; typecheck/test, commit and push.
- [x] Suggestions: write failing tests for all six rules, implement deduplication, dismiss/accept/revalidation, patient done, local dispositions and appended routes; typecheck/test, commit and push.
- [x] Staff UI: wake hook and tools tests first, reuse AskCrispVoice plumbing on dashboard/exam, cards/toasts/spoken confirmations, Patient done and fixture preview; typecheck/test, commit and push.
- [x] Verify full suite/build and real browser with fixture=1 plus curl actions; document tool schemas/prompt and report with Human checks; commit and push.

Ruling: completed/left visits remain in RoomStore, excluded from waiting using existing called status and cleared room, with authoritative disposition in local proactive store. This preserves records and the frozen contract; Command Center labels these explicitly instead of claiming they are with a clinician.
Ruling: hallway component/API delivered in client/staff; mounting it in client/room is an integrator request because that page is outside the user's edit scope.

Progress: commands, proactive API, wake/tool integration and initial real-Chrome acceptance flow are complete and pushed through 4a7ce4e. Native Node import regression covered. Review found and fixed delayed hallway expiry (starts at acceptance) and REPLAY labeling for missing-camera reminders. Browser chart voice fallback retained on /exam; activating it unmounts the nurse microphone to prevent competing listeners.

Final verification: 275 tests / 45 files, typecheck, production build and git diff --check pass. Real Chrome verifies fixture isolation, exam completion → next-patient call, records retention, no page errors, and once-only suggestion/summary announcements with simulated audio. Physical microphone and real provider speech remain Human checks.
