# P1-A1 foundation checkpoint — 2026-10-24

Status: **module-ready, with local synthetic shell integration verified**. The user explicitly approved beginning the revised plan and bounded this session to P1-A1 plus a local synthetic-only Lovable package. No P1-A2/P2/P3 implementation was begun. P1-A overall remains incomplete because A2 is unrun. No Git repository exists; no Git initialization, worktree, commit, push, external project, upload or deployment occurred. No subagents or other chats were contacted.

## Implemented boundary

- Isolated React/Vite/TypeScript app in `apps/waiting-room/`; original ECHO source/tests/scripts preserved. Root adds only `wr:dev`, `wr:test`, `wr:typecheck`, `wr:build`; ignore rules add the new app's `.local/` and `dist/`.
- Frozen schemaVersion 1 domain types, strict schemas, bounded ingest-body validation, source/method/unit/quality/time invariants and synthetic RoomSnapshot fixtures. Cross-request persistence, deduplication, clock alignment and identity interval enforcement belong to later service slices; the schema test does not claim those are implemented.
- Frozen display props, `toDashboardView`, 12 named room fixtures plus pending/failed-action display variants. Explicit null trend gap, original answers, historical contact interval, current/assigned location, posture without a request, checked/rearming, uncertainty and provider failures.
- Token/atom vocabulary gallery and baseline two-file dashboard presentation. All displayed camera content is synthetic. A synthetic snapshot may simulate `cameraState:'live'` to exercise mapping; the actual supplied video slot and camera label always say synthetic/no live camera. No sensor or model starts.
- Local health/station HTTP shell, bounded JSON errors, protected session cookie and origin/Host/forwarding checks. Backend binds `127.0.0.1:8787`; Vite binds `127.0.0.1:5173` and proxies same-origin API calls. No DB is opened, even when databasePath is supplied. This is not completed multi-tab station ownership or phone proxy authorization.
- Exact API wrappers in `client/runtime/api.ts`, response validation and Promise-based typed ApiError failures. Health/startStation are available; later backend routes currently return 404. No fake room response is served as live state.
- Synchronous borrowed-bitmap bus, stream allocators, stamped metadata age checks, latest-pending/one-in-flight inference scheduler, and typed worker transport. The worker reports unavailable until real models are integrated. The gallery never constructs it. Synthetic adapters prove scheduler behavior; actual Worker/model compatibility and sampling performance remain unverified.
- `/station`, `/phone`, `/questionnaire` pathname dispatch and clearly labeled skeletons. QRCode is pinned for later navigation links; no links, capture or questionnaire flow is claimed complete.

## Frozen interfaces and ownership

`shared/contracts.ts`, `shared/schemas.ts`, `shared/fixtures.ts`, `shared/view-model.ts`, `shared/dashboard-fixtures.tsx`, `client/styles.css`, `client/runtime/api.ts`, frame-bus/worker transport, config and package lock remain Codex integrator-owned. Public domain and DashboardViewProps definitions match contracts.md. Named display fixtures are exported from `shared/dashboard-fixtures.tsx`; domain fixtures remain in `shared/fixtures.ts`. Added integrator helpers (frame bus/scheduler/transport/allocator/metadata eligibility and fixture recorder) are local seams, not alternate sensor interfaces.

The frozen hash checkpoint is `.local/test-runs/P1-A1/frozen-interfaces.json`. A change to public semantics/signatures requires an explicit contract revision and refreshed fixtures before downstream integration. At this checkpoint, `server/http.ts` and `tests/http.test.ts` can transfer to the authorized backend slice; the integrator retains API/shared/frame/worker/config ownership. No transfer launches another agent.

Lovable's only editable files are `client/ui/dashboard/DashboardView.tsx` and `dashboard.css`. Presentation is baseline, not final polish. Antigravity is deferred; the gallery provides read-only vocabulary without creating competing production atom implementations.

## Actual verification

All commands below ran from workspace root. Full output is in `.local/test-runs/P1-A1/final-checks.json`.

| Command | Actual result |
| --- | --- |
| `npm --prefix apps/waiting-room run test` | exit 0, 6 files, 39 tests passed; HTTP tests required approved loopback socket access |
| `npm --prefix apps/waiting-room run typecheck` | exit 0 |
| `npm --prefix apps/waiting-room run build` | exit 0, Vite 8.3.5; client built |
| `npm --prefix apps/waiting-room/.local/handoffs/lovable/P1-A1-v2 run typecheck` | exit 0 |
| `npm --prefix apps/waiting-room/.local/handoffs/lovable/P1-A1-v2 run build` | exit 0; resolved existing ancestor dependencies locally |
| `node apps/waiting-room/.local/test-runs/P1-A1/verify-handoff.mjs` | exit 0; all 14 display fixtures equal current source and display types match byte-for-byte |
| `npm test` (historical root, refreshed before implementation) | exit 1; 8 pass, 1 failed file loading missing ECHO `server/src/http.ts`; not repaired |
| `git status --short` (before and after code) | not a Git repository; no repository manufactured |

Compatibility was checked against published npm registry metadata before exact pins. Installed Node 26.5.0 / npm 11.17.0. Direct pins: React/DOM 19.3.1, Vite 8.3.5, Vitest 5.0.5, Zod 4.6.7, TypeScript 5.9.3, QRCode 1.5.4; type packages pinned in the lock. Installs used `--ignore-scripts`; npm reported 0 vulnerabilities for 77 main packages and 24 preview packages at this run. No model/provider packages or assets installed.

Test-first failures were observed for absent schema/fixture, HTTP, frame, API and App modules. Behavioral RED→GREEN cases also include missing five-point/null-gap fixture, stale historical labeling, camera-off overlay/current-value suppression, and typed asynchronous API validation. No test result is device/provider proof.

## Rendered shell proof

Started `npm --prefix apps/waiting-room run dev`; actual in-app browser at `/station`:

- Health button returned the real local service time; Start local station returned explicit successful initialization through the Vite proxy. Cookie value was not read, logged or exported.
- All 14 fixtures rendered at 1280×800 and 390×844; document scroll width equaled viewport width in 28 checks. Screenshots `<fixture>-1280.jpg` / `<fixture>-390.jpg` are retained under the run directory. Baseline empty/quality/posture/reference/scenario/request states were inspected through rendered accessibility text.
- Acknowledge click increased callback count 0→1 with `request_014`; keyboard Enter on Mark checked increased it 1→2 with the same ID. Actions are labeled synthetic and do not save a state transition.
- Final current desktop screenshot: `.local/test-runs/P1-A1/checkpoint-desktop.jpg`. Viewport override was reset; the local preview tab remains open.
- The raw initial `browser-fixtures.json` includes an `syntheticLabel` diagnostic derived from incremental AX diffs; false there means the unchanged label was omitted from the diff. Direct visible-label rechecks in `browser-labels.json` confirmed all 14 labels. Do not interpret the diagnostic as a missing synthetic label.

Playwright connector initialization did not complete and was terminated; CUA in-app browser supplied actual proof. A first exporter staging attempt hit a sandbox-blocked Vite HMR socket despite middleware mode. The exporter now disables HMR/WebSockets; v2 ran cleanly without a listening server. v1 is retained as history. Offline preview lock resolution failed due uncached metadata; the approved public npm metadata request then completed. An initial test-path setup error was corrected by moving that one test to its canonical path; no file or empty directory was deleted.

## Local presentation handoff

Selected package: `.local/handoffs/lovable/P1-A1-v2/` with [README](../.local/handoffs/lovable/P1-A1-v2/README.md), [ready prompt](../.local/handoffs/lovable/P1-A1-v2/LOVABLE-PROMPT.md), UI brief, minimal harness, frozen display types, synthetic fixture props and tokens. Adjacent ZIP contains exactly 15 allowlisted files, with hashes in PACKAGE-MANIFEST.json; no runtime/backend/schema implementation, legacy source, node_modules, build output, private patient data, credentials, face image or video. Archive contents were verified against the allowlist. No third-party service was contacted with this package.

## Limits and next checkpoint

Actual phone camera/torch/HTTPS/capture, local clocks, model assets/licenses, face enrollment/identity, pose/DSP/sensing, persisted visits/pairing/events/staff actions, Gemini, ElevenLabs and speaker playback are unimplemented/unverified. No medical acceptance AC-01..15 is marked passed by this slice. Full polished UI contrast, focus-order audit, 200% browser zoom, reduced-motion and timed staff usability gates remain P2/P5 work; desktop/mobile reflow is not a complete accessibility audit.

Ready next: user-operated synthetic presentation work from this exact package, or the next scoped Codex P1-A2 clocks/model/HTTPS slice. Neither was started automatically. D1/D2 actual-device gates remain early priorities before broad polish. [Preview instructions](preview.md).

## Review decisions

Ruling: use the existing ledgers and scoped recoverable snapshots because the workspace is not Git; no worktree/init/commit/deletion or reviewer delegation. This follows the user's restrictions. Cost if wrong: this checkpoint has single-agent review plus tests/manifests, without independent reviewer coverage. No deferred minor findings were recorded.
