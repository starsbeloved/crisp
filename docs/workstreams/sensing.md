# ROUND 2 — READY (2026-10-24)

Executing `docs/plans/2026-10-24-waiting-room-monitor/final-integration.md`, lane 2. Ownership now includes sensing, inference.worker.ts, new sensor-* runtime modules, VisionRoute.tsx and sensing/sensor-integration tests. Wiring bounded pose worker inference, stamped pose metadata, independent physiological runtime windows, authenticated backend delivery, current reference generations and the media publisher hook. No new agents/chats, camera acquisition/device consent, dependency installs or foreign-owner edits.

Round 2 owned runtime wiring and final regression review are complete. **Stopped editing; integration owner may now take these paths for final surgical integration.** No shared/API edits needed. This is software readiness; the actual-device acceptance gates below remain open.

**Live integration exports:** `VisionRoute()` now mounts `VisionPage` with actual frame → sensing and binding → serial transport handlers plus `useCameraPublisher()`. New owned `client/runtime/sensor-{clock,protocol,worker,worker-client,session,transport}.ts` and replaced `inference.worker.ts` provide local pose model loading, one-in-flight/latest-pending worker frames, independent signal streams, current nurse-reference polling and authenticated observation submission. The media hook file now exists and is consumed directly. Main only needs its existing `/vision` route mount and `StationVisionProvider`; no additional sensing App seam.

**Final evidence:** **85 tests passed in 9 owned files**, 0 failed; scoped strict TypeScript check exited 0. Integration tests cover overlapping clock-refresh continuity, binding uncertainty/order, worker ownership/result stamps, actual pose-metadata enrichment, changed nurse generations and late-generation readback, real 30s POS processing of synthetic RGB across routine clock refresh, and route frame/publisher wiring without getUserMedia. A synthetic decoded-frame/model-boundary test runs real feature processing, source clocks, transport, server ingestion/detector/SQLite and creates/acknowledges/checks a request with generation 2 readback. This is software integration evidence, not real camera/model accuracy.

**Transport behavior:** `/bindings` snapshots are serialized without latest-only dropping; `/observations` waits for accepted binding coverage beyond both uncertainty margins. Stale/wrong-epoch rows are discarded. HTTP failure/unknown rejection/queue overflow pauses VisionRoute with an explicit Reconnect action. A rejected old-generation pose refreshes authenticated controls; only a strictly newer matching server generation permits capture to continue, with old pending packets visibly discarded. Nurse controls are polled every 500ms with a 1500ms request deadline; failure unmounts capture, unpublishes the stream and disposes the worker/transport/clock. Camera capture remains behind VisionPage's explicit Start button.

**Clock requirement resolved locally:** normal 30s resync previously reset 45s breathing forever. The owned sensor-clock wrapper records actual mappings and gives compatible overlapping mappings one local continuity key. Wire payloads retain real current sync IDs. Disjoint mapping bounds, expired authority, run/identity/gaps still reset windows.

**Actual browser model proof:** an isolated headless Chrome with a fresh temporary profile initialized the installed MediaPipe 1.1.1 WASM + local pose-lite model in the **production dedicated inference worker** and processed one explicitly synthetic solid-gray ImageBitmap. Result: `status:PASS`, `frameSeq:1`, `runId:synthetic_probe`, `poseCount:0`, `cameraUsed:false`. Zero poses on the blank image is expected; this does not establish human pose accuracy. A separate loader diagnostic also passed. Initial probes exposed Vite returning HTTP 500 for a public loader requested with `?import`; the module worker now selects the module WASM loader and temporarily uses MediaPipe's import hook with an absolute same-origin URL, avoiding that source transformation. Hook restoration is in `finally`; no CDN or trust changes. Earlier virtual-time dump probes timed out and were superseded by the real-time CDP probe. Chrome's earlier CVDisplayLink/allocator warnings remain environment limitations, not camera-performance evidence. Temporary isolated profiles were retained under the OS temp directory, not deleted.

**Final review regressions:** a reproduced drain-completion race could strand a binding queued by the final status callback; a requested follow-up drain fixes it (RED → GREEN). A failed reference read left model/clock resources alive after the capture view disappeared; immediate disposal fixes that regression (RED → GREEN). A hung read aborts at 1500ms, clears capture/publishing and requires explicit reconnect. Existing nurse-generation recovery, monotonic-generation and stream-tagging regressions remain green. Reviewed borrowed bitmap lifetime, one-in-flight/latest-pending inference, exact result stamps, stale work suppression, interval coverage and clock continuity.

### Final owned verification commands

Working directory: `apps/waiting-room/`.

```sh
npm test -- tests/sensing*.test.ts tests/sensor-integration*.test.ts tests/sensor-integration*.test.tsx
# Final rerun exit 0: 9 files, 85 tests; 8.61s synthetic test run at 15:00 EDT.

node node_modules/typescript/bin/tsc --noEmit --strict --moduleResolution bundler --module esnext --target es2023 --lib ES2023,DOM,DOM.Iterable --types node,vite/client --jsx react-jsx --verbatimModuleSyntax --allowImportingTsExtensions --skipLibCheck client/sensing/*.ts client/runtime/sensor-*.ts client/runtime/inference.worker.ts client/vision/VisionRoute.tsx tests/sensing*.test.ts tests/sensor-integration*.test.ts tests/sensor-integration*.test.tsx
# Exit 0, no diagnostics, after correcting a private-constructor type annotation.

node tests/sensor-integration-browser-probe.mjs --loader
node tests/sensor-integration-browser-probe.mjs
# Both exit 0 against local Vite at 127.0.0.1:5173; real WASM, synthetic blank image.

node --input-type=module -e 'import {build} from "vite"; await build({configFile:false,build:{write:false,emptyOutDir:false,lib:{entry:"client/runtime/sensor-worker-client.ts",formats:["es"]}}});'
# Exit 0: scoped production bundling emits the sensor client and inference worker asset,
# without writing build output. Full-app test/typecheck/build remain integration-owner gates.
```

Additional diagnostic artifacts are `tests/sensor-integration-probe.html`, `sensor-integration-loader.worker.ts`, and `sensor-integration-browser-probe.mjs`; all use labeled synthetic blank pixels and no authentication/camera/patient data. The accidentally nested probe script was moved to its intended owned tests path; existing empty nested directories remain untouched.

**Remaining acceptance / handoff:** integration owner must verify the final combined app and actual consenting device journey. No real camera/volunteer, face association accuracy, independent pulse/respiration reference comparison, actual pose/reference/slump accuracy, sustained combined face+pose+physiology CPU cadence, phone hardware/TLS, separate remote laptop, provider/speech or full-app success is claimed. Thresholds and usable-window rate may fail on the actual framing/lighting/clothing; failed readings stay unavailable. The browser smoke test verifies loading and execution only. No new agents/chats/messages, installs, real provider calls, camera acquisition, uploads, deployment, Git initialization or deletion occurred in this lane. Earlier module checkpoint below is retained as history.

# Sensing workstream — 2026-10-24

Assignment: `parallel-build.md`, packets 07/08/09. This session owns only `apps/waiting-room/client/sensing/**`, `apps/waiting-room/tests/sensing*.test.ts`, and this note. No camera operation, installs, shared edits or other sessions.

## Integration exports (declared before implementation)

- `client/sensing/rppg.ts`: `estimateCameraPulse(samples:TimedRGB[]):PulseEstimate`, `createRppgRuntime(context:SensorContext,emit:MeasurementEmitter):SensorRuntime`; packet-compatible alias `createCameraPulseRuntime`.
- `client/sensing/breathing.ts`: `estimateBreathing(samples:ScalarSample[]):BreathEstimate`, `createBreathingRuntime(context:SensorContext,emit:MeasurementEmitter):SensorRuntime`.
- Both runtime factories accept an optional third `{readPixels:(frame:BoundFrame)=>PixelPlane}` for image fixtures or an integrator-owned synchronous pixel adapter. Default reads the borrowed bitmap into a private reusable canvas synchronously. They never acquire a camera or retain/close the borrowed bitmap.
- `client/sensing/pose.ts`: `extractPose(frame:BoundFrame,control:ReferenceControl,context:SensorContext):Promise<PoseFrameResult>`, `resetPoseReference(control:ReferenceControl):void`, `initializePoseModel():Promise<void>`, `disposePoseModel():void`. Initialize local MediaPipe assets BEFORE scheduling frames; no async initialization may retain borrowed frames. Not initialized/failure yields unavailable.
- `createPoseProcessor()` exposes `process(frame,control,context,landmarks):PoseFrameResult`, `reset(control):void` for worker-owned inference/feature tests. `PoseLandmark` includes normalized `x,y,z?,visibility?,presence?`; `landmarks` is an array of candidate landmark arrays, never an identity guess.
- `client/sensing/pixels.ts`: `PixelPlane={width:number;height:number;data:Uint8ClampedArray}` (RGBA), `sampleFaceRgb`, `createPixelReader`; `motion.ts`: torso patch extraction helpers used by breathing.

## Pre-flight rulings / parent needs

- Latest assignment supersedes older `client/runtime/` and tests/pose,rppg,breathing paths. Shared types stay unchanged.
- Factory naming mismatch: latest `createRppgRuntime` and older `createCameraPulseRuntime` both export the SAME factory; no caller/shared edit needed.
- Parent owns all frame subscription/scheduling, clock expiry (`getSyncId()` must return null after expiry), per-stream sequence allocators, reference controls, transport, event detector and stale camera handling. Call runtime.reset on stop/hidden/continuity loss; no incoming frames means runtimes cannot detect camera stall themselves.
- Parent must use a dedicated owned inference bitmap for async worker scheduling. `extractPose` performs synchronous inference only after model initialization; its Promise wrapper does not make MediaPipe non-blocking. Integrate through bounded scheduler/worker, not at 30Hz alongside pixel consumers.
- Pose metadata (torso/poseMotion/poseStamp) must come from the actual inferred frame with unchanged source timestamp/epoch; runtime consumes `metadataEligibility` (identity <=500ms, pose <=250ms).
- Camera physiology requires >=15Hz actual input; no >200ms gaps, identity/visit/track/run/sync changes clear windows. Pose reference continuity uses <=1s gaps and matching generation.
- Existing local MediaPipe 1.1.1 + pose lite assets suffice; no dependency request.

## Status

Software modules are ready for parent integration. Final owned tests: **59 passed, 0 failed** (20 DSP + 25 image/runtime + 14 pose). Scoped strict TypeScript compilation exited 0. No full-app build/suite or device/model inference claim is made; main owns those gates.

### Implemented files

All new source is in `apps/waiting-room/client/sensing/`:

- `dsp.ts`: timestamp/cadence/gap gates, interpolation, detrending, Hann power spectrum, interpolated peak, defined peak/noise ratio, concentration, repeat-period and harmonic checks.
- `rppg.ts`: normalized three-channel POS, 1.6s overlap-add, all-channel clipping/exposure rejection, 30s trace, 0.7–3Hz estimate and bound-frame runtime.
- `breathing.ts`: separate 45s / 0.1–0.6Hz displacement estimator and runtime; no pulse dependency.
- `pixels.ts`: synchronous private canvas pixel access and landmark-skin ROI means/clipping fractions.
- `motion.ts`: fixed image-coordinate 3×3 24px patches, ±4px NCC search, subpixel interpolation, texture/correlation/ambiguity gates, background controls. Runtime retains one derived luminance frame, no borrowed bitmap, and reuses that conversion across patch groups.
- `runtime.ts`: common temporal/binding/clock gates, null point-interval invalidation, independent bounded windows, stream-specific provenance/sequence/measurement intervals and dispose/reset.
- `pose.ts`: pose geometry/movement, bent-leg seated gate, 10s median upright reference, relative head/torso changes, generation-aware resets, local MediaPipe adapter. Pose never creates a check request.

Owned tests: `apps/waiting-room/tests/sensing-dsp.test.ts`, `sensing-runtime.test.ts`, `sensing-pose.test.ts`. No shared contracts, package/config/lock, API/App/backend, other-owner tests or canonical ledgers changed.

### Actual verification

Working directory: `apps/waiting-room/`.

```sh
npm run test -- tests/sensing-dsp.test.ts tests/sensing-runtime.test.ts tests/sensing-pose.test.ts
# Final exit 0: 3 files, 59 tests passed; ~8.3 seconds on synthetic fixtures.

node node_modules/typescript/bin/tsc --noEmit --strict --moduleResolution bundler --module esnext --target es2023 --lib ES2023,DOM,DOM.Iterable --types node,vite/client --verbatimModuleSyntax --allowImportingTsExtensions --skipLibCheck client/sensing/*.ts tests/sensing*.test.ts
# Final exit 0, no diagnostics.
```

TDD evidence: tests were created before each subsystem. Missing modules were observed RED; DSP null stubs then produced the expected 2 valid-signal assertion failures. Additional regression tests reproduced a plausible breathing output from whole-image oscillation, a below-resolution image trace, an initially drooped reference and a low-quality pose leaking usable torso metadata. Each was observed failing before its fix; all are green in the final run. Initial short RGB fixture used rounding that accidentally yielded exactly 30s; corrected the fixture to floor its sample count, rather than relaxing the duration gate. Test-only import failures are not device or algorithm evidence.

Coverage includes valid 72 BPM RGB, independent 15 breaths/min displacement, noisy/flat/short/slow cadence, >200ms gaps, clipping at 5%, exposure step, illumination-only RGB, harmonic ambiguity, image subpixel chest movement, static-image ROI jitter, global camera oscillation, identity/epoch/run/sync/clock resets, stale identity/pose, head movement, bad ROI/pixel failures, generation rearm at 9,999/10,000ms, ambiguity, visibility, missing hips/legs, standing/moving and out-of-order poses. A changed epoch cannot reuse a preceding usable pulse window.

Per explicit assignment, only owned test files were run. No repository initialized, subagent/session/message launched, install/download performed, camera opened, data uploaded or deployment attempted. No existing user data was removed. This note substitutes for Git/task-runner ledgers because this shared directory has no Git repository and the assignment prohibits Git init or canonical-ledger changes.

### Additional conservative engineering gates / rulings

- Breathing requires >=5 usable torso patches and >=3 textured background patches. Subtract median background displacement, reject gross image motion, and require detrended relative torso motion >=0.05px RMS before reporting a rate. A regression showed that a clean periodic NCC residual could otherwise look like breathing. Insufficient background or too-small motion stays unavailable. These added gates may reject real breathing; actual framing/lighting/clothing and holdout measurements must determine suitability.
- Initial upright reference requires nose above shoulder midpoint and torso angle within 20° of image vertical, plus usable seated geometry and stationary continuity. These are explicit prototype geometry gates, not a model of tiredness or medical posture. `POSE_THRESHOLDS` exposes reference/movement/slump settings; observations expose the measured relative features.
- Unknown/missing seated geometry returns low quality and no torso metadata to enable respiration. First-frame movement is unknown; second-frame comparison must confirm stationarity. Model returns up to two candidates to reject a second person; there is no crowded-room pose assignment claim.
- POS temporal normalization/projections/std-ratio/overlap follow the [reference implementation](https://github.com/ubicomplab/rPPG-Toolbox/blob/main/unsupervised_methods/methods/POS_WANG.py) read 2026-10-24 and [Wang et al.](https://doi.org/10.1109/TBME.2016.2609282). Downstream detrending/Hann spectral gates follow this project's contract, not a claim of numerically replicating SciPy filtering. The upstream `main` link was read-only; no upstream revision SHA was available through the web result, so it is not represented as a pinned dependency. Runtime loads no upstream POS code.
- MediaPipe adapter follows the [official web guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js), uses installed `@mediapipe/tasks-vision@1.1.1` and existing local paths only. Asset inference and browser/WASM compatibility are still untested. The existing manifest remains the asset authority.

### Parent integration checklist

1. Import the factories/pose exports above. Allocate `nextSeq` separately per `rppg`, `breathing`, `pose`. A source context must match its frame run; expired/no sync means no submitted observation. Show that local clock failure in the UI.
2. Initialize the pose model explicitly, catch errors and show unavailable. For worker inference, use `createPoseProcessor().process(...)` with actual full-frame normalized MediaPipe landmarks. `extractPose` itself is a synchronous-inference adapter with a Promise return; it must not serialize physiological sampling or retain a borrowed frame through initialization. Dedicated scheduler-owned inference bitmaps remain parent-owned.
3. Apply the current server `ReferenceControl`; repeated same-generation reset is idempotent. New run/sync/epoch/control generation clears the reference. For camera mode/reposition changes use a fresh run or fresh reference generation; same-generation polling intentionally does not erase progress.
4. Publish `PoseFrameResult.torso`, `poseMotion`, and the **actual inference-frame** stamp only when eligible. Do not restamp cached metadata. Identity lane must provide landmark-defined `faceSkin` excluding eyes/mouth and per-frame face motion; there is no fallback face rectangle or inferred identity in sensing.
5. Push borrowed bound frames synchronously to the two runtimes. Optionally inject one parent-cached pixel reader to avoid duplicate canvas readbacks. Parent owns the only camera/frame scheduler and any subscription.
6. Call `reset(reason)` on camera stop, tab hide, identity/continuity loss, and connection/scheduling changes, then update local stale state. Runtimes cannot detect a stall with no incoming frames. Do not pass replay/synthetic frames into these live-camera runtimes: BoundFrame has no provenance discriminator; their deliberate output is `live_camera`. Use separate labeled fixtures/replay ingestion.
7. Submit structured observations via parent transport with source-clock alignment. The runtime does not perform HTTP writes, close borrowed bitmaps, open cameras, infer from a phone baseline or create staff requests.
8. Run the full app test/build and actual combined-load cadence/framing probe. First usable software windows are 30s (pulse) and 45s (breathing), update ~2s; reject windows restart collection. Measure actual latency and usable-window rate; synthetic test wall time is not camera throughput evidence.

### Not performed / remaining acceptance

No real camera or consenting volunteer operation, model initialization/inference, face association, phone PPG, live signal benchmark, manual respiration count, independent pulse reference, combined CPU/browser load, provider/speech, actual device transport, rendered UI or full-app validation. AC-05/06/07/08 device acceptance remains open. Thresholds may be unsuitable on the real subject/camera; report failures and revise with evidence, without synthetic fallback. Clinical accuracy, population fairness and crowded-room capacity are not established.

## Final review

Self-review by the implementing author; no additional reviewer/subagent was used because the assignment prohibits subagents and cross-session messages. Reviewed bitmap lifetime, source vs receipt timing, association/window boundaries, null invalidation, reference generations, independent channel state, and camera-motion confounding. The whole-image periodic-motion and low-quality torso issues found in that pass have covering RED→GREEN regressions. Remaining model/device/performance gates are listed above; no full-app success claim follows from this review.
