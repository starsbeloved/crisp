# P13g — Transferable stations

## What works

- `/station` offers Kiosk, Room view, Command Center, Exam rooms 1/2/3, and Lobby. The browser remembers its ID, laptop name, and role. `/station?choose=1` always opens the picker.
- Shift+S or a two-second press on the bottom-left corner opens the picker. A short pointer click does nothing. Typing Shift+S inside a field is left alone; keyboard activation of the corner is also supported.
- Switching roles navigates to the existing page in a new document. The previous page and its media/voice resources are torn down. The shell itself never opens a camera or microphone.
- Immediate registration and ten-second heartbeats; thirty seconds without a heartbeat marks a station offline. The System popover lists names, roles, rooms, and online/offline status. Failed list requests show unavailable status.
- Existing pages remain available directly. No patient data or provider credentials are included in station metadata. No changes to `shared/types.ts`.

## Verified and how

- `npm install`: completed; audit reported zero vulnerabilities. npm reported pending install scripts for `@google/genai`, `fsevents`, and `protobufjs`; no script approvals were changed.
- `npm test`: 178 tests passed across 24 files. New tests cover the actual HTTP endpoints, validation, heartbeat replacement, thirty-second boundary, per-server isolation, role URLs, storage failure/corruption, picker persistence, shortcut/press behavior, heartbeat teardown, System portal, unavailable status, and App routing.
- `npm run typecheck`: passed.
- `npm run build`: passed, with Vite's warning about a minified chunk larger than 500 kB.
- Real Chrome at `http://localhost:5205`: visually inspected the picker and System popover; named the station Laptop B; selected every role; checked Kiosk → Exam room 1, `/station` reopening the saved Exam/Lobby role, Shift+S, two-second corner press, and a short corner click leaving the dashboard unchanged.
- Used `curl` against API port 8805 to register `Laptop A (fixture)` as a Room view station. The real System popover showed it online and later offline after heartbeats stopped. Laptop B's role changed in place without duplicate rows.
- Lobby contained no video element. Actual Room/Exam camera recognition was not exercised: those parallel pages are not present in this branch.

## Not done / limitations

- P13b's Room page and P13f's Exam page are absent from this worktree. Their destinations show an explicit unavailable message until integration. Room offers the existing `/camera` link as a fallback. No fabricated chart or camera output was added.
- Physical webcam/microphone teardown across the newly merged Room and Exam pages and the three-laptop LAN rehearsal require the human checks below. Unit tests verify child cleanup and heartbeat cancellation; document navigation releases the old page.
- Use one active station tab per browser origin. Multiple tabs share the same station ID and role preference. Different origins/ports have independent browser storage.
- Registry metadata is in memory and starts empty on server restart; active clients re-register at the next heartbeat. Offline rows remain for the server session. Browser storage restrictions prevent remembering a role and are disclosed in the picker.
- The standard dev launcher hit Node's `EMFILE` watcher error in this environment. Browser validation used two processes, both with the required ports:

```sh
API_PORT=8805 WEB_PORT=5205 PROVIDERS_ENV=/nonexistent/providers.env node server/main.ts
API_PORT=8805 WEB_PORT=5205 CHOKIDAR_USEPOLLING=1 node node_modules/vite/bin/vite.js
```

## Requests for integrator

- Preserve `StationShell` around App content when resolving the parallel changes to `client/App.tsx`.
- App discovers named exports `RoomPage` from `client/room/RoomPage.tsx` and `ExamPage` from `client/exam/ExamPage.tsx` through Vite globs. Confirm those filenames/exports after merging; reconcile any duplicate route additions from P13b/P13f. Direct imports can replace the optional globs once both pages exist.
- The existing `.system-popover` receives `StationStatus` through a portal from the shell, so dashboard files were untouched. If P13a replaces that element, import `StationStatus` from `client/station/StationStatus.tsx` into the new System popover and remove the shell's `SystemStations` mount to prevent duplication.
- No shared type change is needed. HTTP additions are an import, a per-server registry, and two appended routes before the existing 404; existing route bodies are unchanged.

### Station API contract

- `POST /api/stations`: `{ id, role, room?, name? }` → one presence object, HTTP 200. ID: 1–80 letters/digits/underscores/hyphens. Name: optional, trimmed, 1–60 characters. Roles: `kiosk`, `room`, `command`, `exam`, `lobby`. Only `exam` accepts/requires `room`, a string `"1"`, `"2"`, or `"3"`. Unknown fields/invalid input return 400.
- `GET /api/stations`: `{ stations: [{ id, name, role, room?, lastSeenAt, online }] }`. `lastSeenAt` is a server timestamp; `online` means a heartbeat was seen less than 30 seconds ago. Responses use `Cache-Control: no-store`.

## Human checks

- [ ] After merging P13b/P13f, choose Room view and all three Exam rooms; confirm actual pages load instead of unavailable messages.
- [ ] With fixture cameras, switch Kiosk face scan → picker → Exam room 1 → Lobby. Confirm the previous video tracks and voice session stop, the camera indicator goes out on the picker/Lobby, and only the new role opens its camera.
- [ ] Open one `/station` tab per laptop on the same server origin; name them Laptop A/B/C. Confirm three distinct entries in System, correct rooms, and offline status within a polling interval after 30 seconds without a heartbeat.
- [ ] Rehearse Laptop B's Kiosk → Exam room 1 switch with Shift+S; reload `/station` and confirm Exam room 1 reopens.
- [ ] Verify LAN camera/microphone permissions and recognition in the merged app using the project's existing secure-context setup. Keep REPLAY/SYNTHETIC and fictional-record labels visible for fixtures.
