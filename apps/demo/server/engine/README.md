# P4 handoff

## What works

`ingest` selects one observation per visit, updates vitals/history, collects good
baseline samples, and opens or upgrades fusion alerts. `onChecked` records the
check, resets baselines/posture, and suppresses new alerts for 60 seconds.
Acknowledged alerts remain acknowledged when upgraded; falling sensor levels do
not close alerts.

The local `EngineVitals` adapter stores baseline samples and sustained intervals
under `_engine` on each vitals object. This survives existing RoomStore JSON
persistence without editing shared types or creating another store. Resetting
the room naturally resets this memory.

## Verified

- `npm test`: 30 passing tests (24 engine, 6 existing server smoke).
- `npm run typecheck` and `git diff --check`: passed.
- Real HTTP/SSE on API 8784: normal HR plus short lean produced none; 118 bpm for
  21 seconds produced amber; adding a 12-second slump upgraded the same alert to
  red; acknowledge/checked worked and an immediate fall stayed suppressed.
- Chrome at web 5184 displayed the synthetic test visit and streamed HR/RR.
  Test inputs were tagged replay; no providers or webcam were used.

## Not done / requests for integrator

- P2/P3 sensing and the full alert dashboard are not implemented on this branch.
  Repeat the film scenarios after integration.
- Review provider handling of upgrades to acknowledged alerts: the current
  orchestrator discards explanations unless status is `open`. Also ensure an
  earlier asynchronous explanation cannot overwrite the explanation for an
  upgraded alert. These files are outside P4 ownership.
- `npm run dev` hit `EMFILE` in Node's watcher. Browser checks used the API without
  `--watch` and Vite with `CHOKIDAR_USEPOLLING=1`, always API_PORT=8784 WEB_PORT=5184.

## Human checks

With P2/P3 merged, use a webcam to check normal sitting, a short lean, sustained
slump, and safe head-drop/fall-like movement. Compare camera HR to a reference
device. Verify microphone/voice and speaker playback with the owning packets.
