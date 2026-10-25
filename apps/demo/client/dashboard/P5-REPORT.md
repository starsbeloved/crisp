# P5 — dashboard and lobby handoff

Branch: `crisp-demo-p5`. Changes are confined to `client/dashboard/**` and `client/lobby/**`.
`AskCrispVoice.tsx` remains the P0/P7 stub. No shared types, routes, dependencies, or package files changed.

## What works

- SSE queue, red/amber/arrival ordering, FLIP movement, acknowledged outline, checked reset, room chooser, and collapsed called visits.
- System strip, provider configuration/fallback labels, camera frame age/fps, hidden-window warning, STALE after two seconds, REPLAY labels, and direct API stream option.
- Honest HR/RR labels: rejected readings and stale readings never appear as current numbers; pulse animation uses the accepted estimate.
- Crisp explanation with source, dismissal, fixed-height bubble area, 5 fps replay, and SVG history charts with NEWS2 bands and dashed baselines.
- Patient drawer with original answers, follow-up, summary, signal quality, timeline, reference HR/paired MAE, handoff/copy, and opt-in snapshot description (hidden after 501).
- Text Ask Crisp, P7 voice mount, and voice queue with once-only attempts per alert/version or lobby call. Audio errors fall back to browser speech; a new queued alert does not interrupt the current announcement.
- Public lobby: first name for the active call, the provided room label exactly once, initials for waiting visits, sound opt-in, and talking mascot state.
- Development-only `/dashboard?fixture=1` fixture. Load, mark checked, then **Trigger synthetic request** to see the row rise. All fixture data/actions stay in the labeled SYNTHETIC preview. Replay images are explicitly synthetic illustrations.

## Verified and how

- `npm run typecheck`: passes.
- `npm test`: 11 tests pass, including existing API smoke/replay tests and new UI privacy, rejected-signal, queue-order, and audio regression tests.
- `npm run build`: passes; Vite warns about the existing large combined client bundle.
- Real Chrome: dashboard screenshots at 1440×900 and 1280×800; no horizontal overflow. Additional 375px check has no horizontal overflow.
- Created a labeled synthetic visit through `/api/visits`; two labeled JPEG replay streams uploaded through `/api/frame`; observations through `/api/observations`. Verified two images, REPLAY badges, hidden-camera warning, and stale indicators after uploads stopped.
- Browser reference entry: camera estimate 84, reference 80 → MAE 4.0 bpm and one paired sample. Latest source also verified that stale estimates disable pairing.
- Browser text Ask Crisp returned the server fallback with Template tag.
- Browser Call in → Room 2: visit moved to With clinician; lobby displayed first name and Room 2 with no surname or complaint.
- In-memory harness using the unchanged P0 server: injected a labeled synthetic alert after the queue loaded; observed the red row rise over SSE; browser Acknowledge and Mark checked hit real endpoints, reflected status, and restored arrival order. This harness uses no provider keys or persisted patient data.
- Snapshot opt-in against the P0 501 response hid the button and displayed an unavailable message.
- The historical repository-root test command was accidentally run once. Its `tests/http.test.ts` fails because legacy `server/src/http.ts` is absent. The requested `apps/demo` suite is green; history was not edited.

## What is not done

- Real Gemini/ElevenLabs requests, real sensing, and P7 microphone interaction were not exercised; this branch builds against their P0 stubs.
- No real alert video was available in the P0 engine stub. Replay rendering was exercised with labeled synthetic images; the existing MJPEG capture test covers server replay indexing.
- No Claude Design mockup was present in the packet; components are separate for the integrator's visual pass.

## Requests for integrator

1. Ensure the sensing engine writes `null` history values for rejected/low-quality HR/RR samples. `VitalsPoint` has no per-point quality, so P5 cannot recover the quality of previously recorded samples. The UI hides an affected trace while its current quality is low/none, but accepted current readings cannot certify historical values.
2. Apply the same quality/freshness guard server-side to `/api/reference`: P0 copies the raw latest HR even if low/stale. P5 prevents that submission in the drawer; the server should also protect other callers.
3. On this Mac, the ordinary dev command hit `EMFILE`, and an environment-only polling flag did not invalidate Vite transforms. API without Node watch plus explicit Vite `server.watch.usePolling: true` worked. Consider exposing that fallback in the owned development launcher/config.

## Human checks

- Real webcam/Continuity Camera streams, recognition and signal quality during motion/poor lighting, including leaving the camera window visible.
- Hear dashboard and lobby announcements on real speakers after the one-click enable controls; verify ElevenLabs voice and browser fallback, once per event.
- Test the P7 hold-to-talk microphone flow after integration.
- Compare real camera HR to the pulse reference; the synthetic MAE check verifies wiring only.

## Local verification environment

All development servers used `API_PORT=8785 WEB_PORT=5185`. Provider access was disabled with a nonexistent `PROVIDERS_ENV` for these checks. No keys were opened or printed.
The normal API was restored after the temporary in-memory harness. The worktree's ignored runtime state retains the explicitly synthetic called test visit and stale test camera records; no cleanup/deletion was performed.

If the regular dev command hits the watcher limit, run these from `apps/demo` in separate terminals:

```sh
API_PORT=8785 WEB_PORT=5185 node server/main.ts
```

```sh
API_PORT=8785 WEB_PORT=5185 node --input-type=module <<'JS'
import { createServer } from 'vite';
const server = await createServer({
  configFile: 'vite.config.ts',
  server: { watch: { usePolling: true, interval: 200 } },
});
await server.listen();
server.printUrls();
JS
```
