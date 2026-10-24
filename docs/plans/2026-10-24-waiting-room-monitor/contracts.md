# Shared Contracts and File Map

**Revision boundary (2026-10-24):** These schema-v1 interfaces describe the implemented baseline, not the final revised scope. Read [scope-amendment.md](scope-amendment.md). Temperature fields/components/routes are retired requirements pending coordinated migration; no new temperature work. All ownership is Codex-only; Lovable/Antigravity labels below are historical. Combined patient-session, consent, completion and editor-takeover contracts must be frozen after patient/nurse design review before changing producers/consumers. Preserve capture/clock invariants; do not independently widen phone roles.

Status: **P1-A1 frozen as `schemaVersion: 1` on 2026-10-24**, with tests/typecheck/build and local synthetic shell proof. See `apps/waiting-room/docs/foundation-checkpoint.md` and E1-P1A1 evidence. Later service/sensing/provider semantics remain unimplemented. Do not copy ECHO contracts into these names. All listed paths are planned, not existing code. The Codex integrator owns this file and `apps/waiting-room/shared/`.

## Runtime and file map

```text
apps/waiting-room/
  package.json, package-lock.json, tsconfig.json, vite.config.ts, vitest.config.ts, index.html
  shared/{contracts.ts,schemas.ts,fixtures.ts,view-model.ts}
  server/{main.ts,http.ts,store.ts,clock.ts,ingest.ts,detector.ts,snapshot.ts}
  server/providers/{questionnaire.ts,gemini.ts,grounding.ts,elevenlabs.ts}
  client/{main.tsx,App.tsx,styles.css}
  client/runtime/{api.ts,camera.ts,frame-bus.ts,clock.ts,identity.ts,pose.ts,rppg.ts,breathing.ts}
  client/runtime/inference.worker.ts                     # integrator owns worker transport/scheduler
  client/phone/{PhonePage.tsx,capture.ts,ppg.ts}
  client/check-in/{CheckInPage.tsx,QuestionnaireForm.tsx,QuestionnairePage.tsx,FaceEnrollment.tsx}
  client/staff/{StaffPage.tsx,video-overlay.ts,audio-queue.ts}
  client/operator/{SeatEditor.tsx,TemperatureScenario.tsx}
  client/ui/dashboard/{DashboardView.tsx,dashboard.css}      # Lovable only these two
  client/ui/atoms/{StatusBadge.tsx,ProvenanceLabel.tsx,TemperatureCard.tsx} # Antigravity
  tests/{contracts,store,http,clock,ingest,detector,frame-bus,phone-ppg,identity,pose,rppg,breathing,questionnaire,grounding,voice,integration}.test.ts
  tests/ui/{dashboard,check-in,phone,staff}.test.tsx
  public/models/{manifest.json,LICENSES.md,...licensed pinned assets}
  .local/{test-runs/,data/,certs/}                           # isolated, ignored, never auto-deleted
  docs/{device-proof.md,model-manifest.md,demo-runbook.md}
```

P1-A1 freezes interfaces/fixtures/packages and releases pure/UI lanes; P1-A2 clocks, assets, and HTTPS checks gate only the live paths that need them. The integrator creates config, `client/main.tsx`, `App.tsx`, `styles.css`, shared types, fixtures, view-model adapter, `api.ts`, frame-bus interface, and test utilities in P1-A. Other agents must not alter these. Backend owns server files except `server/providers/`; provider tasks own only their named adapter files. No wildcard overwrite of another lane's tree. `public/models/` has a single manifest owner (integrator); identity/pose agents request pinned additions through that owner.

Local dev: service binds `127.0.0.1:8787`; Vite serves port 5173 and proxies `/api/wr` to it. Phone accesses Vite over a phone-trusted HTTPS origin, with all API requests same-origin. TLS cert/key paths come from ignored local configuration; no credentials or key material in source. Do not bypass browser TLS warnings. If trusted local HTTPS is unavailable, phone device proof needs a user-approved connection method; do not quietly deploy/tunnel. Laptop-only UI/API work may continue over localhost.

One laptop is the baseline. One foreground station tab owns the persistent camera runtime above check-in/staff views. Enrollment and room monitoring are sequential modes of that stream, not two competing camera tabs. Switching mode clears pose/physiology windows; moving the laptop invalidates geometry/seat regions and requires a fresh reference, but retains session-local face enrollment. The paired phone captures fingertip PPG independently and can operate concurrently with room monitoring for an overlapping comparison. Hidden station tab, sleep, or stream restart ends continuity. A second station tab is read-only and cannot acquire the webcam or speak. Vite LAN exposure requires an explicit allowed hostname; the phone-facing origin must not allow remote creation of a station session. See the device experiment gate for testing this proxy boundary.

New app scripts: `npm run dev` (concurrent service + Vite), `npm run test -- <file>`, `npm run typecheck`, `npm run build`. Root adds `wr:dev`, `wr:test`, `wr:build`, `wr:typecheck` forwarding via `npm --prefix apps/waiting-room run ...`; preserve existing scripts. Use Node's TypeScript stripping for the service (no TS enums or constructor parameter properties); use Vitest for new app tests; old `npm test` remains its known legacy gate.

## Types: implemented exactly in shared/contracts.ts

```ts
export type ID = string;
export type Quality = 'collecting'|'usable'|'low-quality'|'unavailable'|'stale';
export type Provenance = 'live_phone'|'live_camera'|'manual'|'synthetic'|'replay';
export type RequestState = 'open'|'acknowledged'|'checked';
export type ProviderState = 'idle'|'pending'|'ready'|'fallback'|'unavailable';
export type IdentityState = 'matched'|'unknown'|'uncertain';
export type Bounds = { x:number; y:number; width:number; height:number }; // unmirrored normalized frame coordinates
export type Onset = 'today'|'yesterday'|'several-days'|'longer'|'not-sure';
export type Course = 'better'|'same'|'worse'|'intermittent'|'not-applicable';
export type Answers = { reason:string; onset:Onset; onsetNote:string; course:Course };
export type QuestionnaireSummary = { complaint:string; onset:string; course:string; confirmed:boolean };
export type Visit = { id:ID; label:string; createdAtMs:number; answers:Answers|null;
  summary:QuestionnaireSummary|null; assignedSeat:{label:string; assignedAtMs:number}|null };
export type Binding = { trackId:ID; visitId:ID|null; identityEpoch:ID; state:IdentityState;
  sourceId:ID; runId:ID;
  sinceMs:number; lastVerifiedAtMs:number; bounds:Bounds;
  observedLocation:{label:string; observedAtMs:number}|null };
export type BindingInput = Omit<Binding,'sourceId'|'runId'|'sinceMs'|'lastVerifiedAtMs'|'observedLocation'> & {
  sourceSinceAtMs:number; sourceLastVerifiedAtMs:number;
  observedLocation:{label:string; sourceObservedAtMs:number}|null };
export type BindingBatch = { schemaVersion:1; id:ID; sourceId:ID; runId:ID; streamId:'binding';
  seq:number; syncId:ID; sourceAtMs:number; bindings:BindingInput[] };
export type ReferenceControl = { trackId:ID; visitId:ID; identityEpoch:ID; generation:number };
export type ClockSync = { id:ID; sourceId:ID; runId:ID; offsetMs:number; uncertaintyMs:number; expiresAtMs:number };
export type Measurement = { schemaVersion:1; id:ID; sourceId:ID; runId:ID; seq:number; syncId:ID;
  streamId:'phone'|'rppg'|'breathing';
  channel:'pulse'|'breathing'; method:'phone-camera-contact-ppg'|'camera-pos'|'camera-torso-motion';
  trackId:ID|null; visitId:ID|null; identityEpoch:ID|null; captureId:ID|null;
  sourceStartAtMs:number; sourceEndAtMs:number; alignedStartAtMs:number; alignedEndAtMs:number;
  receivedAtMs:number; quality:Quality; value:number|null; unit:'bpm'|'breaths/min';
  provenance:Provenance; reason:string|null; metrics:Record<string,number> };
export type PoseObservation = { schemaVersion:1; id:ID; sourceId:ID; runId:ID; seq:number; syncId:ID;
  streamId:'pose'; referenceGeneration:number;
  sourceAtMs:number; alignedAtMs:number; receivedAtMs:number; trackId:ID; visitId:ID|null;
  identityEpoch:ID; quality:Quality; provenance:Provenance;
  activity:'stationary'|'moving'|'unknown'; seated:boolean|null; qualifyingSlump:boolean;
  referenceReady:boolean; reason:string|null; features:Record<string,number> };
export type TemperatureScenario = { visitId:ID; scenarioId:ID; valueC:37|38;
  provenance:'synthetic'; scenarioAtMs:number; active:boolean };
export type EvidenceFact = { id:ID; kind:'detector'|'measurement'|'reported'|'missing'|'scenario';
  text:string; sourceIds:ID[]; provenance:Provenance|null; atMs:number };
export type CheckRequest = { id:ID; visitId:ID|null; trackId:ID; identityEpoch:ID; state:RequestState;
  createdAtMs:number; updatedAtMs:number; snapshotVersion:number; reason:'sustained-seated-posture-change';
  durationMs:number; location:string|null; facts:EvidenceFact[] };
export type AlertSnapshot = { eventId:ID; version:number; event:CheckRequest; binding:Binding|null;
  visit:Visit|null; measurements:Measurement[]; facts:EvidenceFact[]; scenario:TemperatureScenario|null };
export type GroundedStatement = { evidenceId:ID; phraseKey:'observed'|'reported'|'missing'|'simulated' };
export type AlertExplanation = { eventId:ID; snapshotVersion:number; statements:GroundedStatement[];
  explanation:string; notificationText:string; evidenceIds:ID[]; limitations:string[] };
export type AudioJob = { id:ID; eventId:ID; snapshotVersion:number; state:'pending'|'ready'|'failed'|'cancelled';
  text:string; url:string|null; createdAtMs:number };
export type TimedRGB = { tMs:number; r:number; g:number; b:number;
  saturationFraction:{r:number;g:number;b:number} };
export type ScalarSample = { tMs:number; value:number };
export type PulseEstimate = { quality:Quality; bpm:number|null; reason:string|null; metrics:Record<string,number> };
export type BreathEstimate = { quality:Quality; breathsPerMin:number|null; reason:string|null; metrics:Record<string,number> };
export type SensorContext = { sourceId:ID; runId:ID; getSyncId:()=>ID|null; nextSeq:()=>number };
export type SensorRuntime = { push(frame:BoundFrame):void; reset(reason:string):void; dispose():void };
export type FramePacket = { runId:ID; seq:number; sourceAtMs:number; monotonicMs:number;
  width:number; height:number; image:ImageBitmap };
export type MetadataStamp = { frameSeq:number; sourceAtMs:number; identityEpoch:ID };
export type BoundFrame = { frame:FramePacket; binding:BindingInput|null; faceSkin:Bounds[];
  identityStamp:MetadataStamp|null; poseStamp:MetadataStamp|null;
  torso:Bounds|null; selectedPersonCount:number; poseMotion:number|null;
  faceMotionWidthsPerSecond:number|null; associationUsable:boolean; invalidReason:string|null };
export type PoseFrameResult = { observation:Omit<PoseObservation,'alignedAtMs'|'receivedAtMs'>|null;
  torso:Bounds|null; poseMotion:number|null };
export type RoomSnapshot = { schemaVersion:1; revision:number; serverNowMs:number; visits:Visit[];
  bindings:Binding[]; measurements:Measurement[]; poses:PoseObservation[];
  referenceControls:ReferenceControl[]; requests:CheckRequest[];
  explanations:Record<ID,{state:ProviderState; value:AlertExplanation|null}>;
  audioJobs:AudioJob[]; scenarios:TemperatureScenario[]; cameraState:'off'|'live'|'stale'|'unavailable' };
```

Ingress bodies use `Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>` and `Omit<PoseObservation,'alignedAtMs'|'receivedAtMs'>`; the service calculates aligned/receipt times and rejects client attempts to set them. IDs are nonempty <=96 characters matching `[A-Za-z0-9_-]+`; source values and time values must be finite; start <=end; `value` is finite only for usable measurements, null otherwise. Pulse units/methods and respiration units/methods must agree. Original reason <=500 characters; onsetNote <=200; summary strings <=500 each. HTTP body limit 256KiB, ingest <=100 observations. All durable state-changing requests use unique `requestId` or observation ID for idempotency; session/clock/job scheduling endpoints use their specified handshake or event/version key. Export `measurementSchema`, `poseSchema`, `roomSnapshotSchema`, and `answersSchema` from shared/schemas.ts.

### Clock / epoch invariants

Clock route wire shapes: start `{phase:'start',sourceId,runId,clientSendMs}` -> `{handshakeId,serverReceiveMs,serverSendMs}`; complete `{phase:'complete',handshakeId,clientReceiveMs}` -> ClockSync. Service retains the initial client/server timestamps; client cannot override them on completion.

`POST /clock-sync` receives client send time, server samples its receipt/send time, client then reports receive time; `completeClockSync({sourceId,runId,clientSendMs,clientReceiveMs,serverReceiveMs,serverSendMs})` calculates NTP-style offset `((serverReceive-clientSend)+(serverSend-clientReceive))/2` and uncertainty `(clientReceive-clientSend-(serverSend-serverReceive))/2`, bounded >=0. Service issues sync IDs for its original handshake; never trust invented server times. Reject round trips >1000ms, negative intervals, or sync older than 60s for new live input; resync every 30s. Store original and aligned times; no receipt anchoring that makes delayed data fresh. Capture time uses a wall-clock anchor plus monotonic elapsed time; clock jumps/restarts end the run. Source time may not exceed receipt by >2000ms. Current numeric data becomes stale after 5000ms without a fresh eligible end time. Pose persistence uses aligned frame time and heartbeat expiry, not packet arrival.

Sequence ownership is per `(sourceId,runId,streamId)`, with one producer per stream. Frame seq is separate from observation seq. Each stream allocates seq when producing an observation; order measurements by sourceEndAtMs, poses/bindings by sourceAtMs. Identical ID/seq and canonical payload returns duplicate; conflicting reuse is 409. Lower unseen seq or reversed time rejects within that stream, not across channels. Overlapping windows with later ends are allowed. HTTP retries reuse the original ID/seq/payload. Integrator transport sends each stream serially (bounded latest pending item) and awaits binding acceptance through a window's end before sending that window; it never blocks pose behind slower DSP. Unknown/ambiguous updates invalidate immediately; no later-arriving old matched update can undo them.

BindingBatch is a full snapshot of this source/run's active tracks, not a partial patch. Missing tracks close their interval at the aligned batch time (an empty batch means all lost). Server aligns every nested source time using the batch sync; reject future/reversed nested times. New unknown/uncertain state closes the previous matched epoch. No heartbeat for >1000ms closes continuity even without a loss packet. A retired run cannot be revived by delayed input. Identity interval boundaries include sync uncertainty: reject windows whose uncertainty bounds cross an unmatched interval. Retain bounded interval history for the 10-minute observation history; absence of sufficient history rejects attachment. These rules also apply to pose.

Phone capture freezes a valid ClockSync at start and retains that mapping server-side with the capture for 10 minutes; acquisition ends within 60s. A delayed completion may use that mapping only for the original interval inside that capture. Re-syncing after disconnection must not retimestamp old samples. Retry of an already committed completion returns the original result even if sync expired; new completion after capture expiry/restart/cancel returns explicit unsaved/expired and requires a new capture. Historical phone pulse remains a timestamped check-in reading, never a current room-camera reading.

Reference generation is server-owned. A new matched epoch gets generation 1; `/check` atomically increments it and clears detector arming/candidate. GET room returns controls. Runtime calls `resetPoseReference(control)` on first/new control before emitting that generation; old-generation observations are rejected. Without a current control, pose may show unknown/collecting but cannot arm. Local check action resets immediately while awaiting server confirmation; polling reconciles the authoritative generation. A fresh contiguous >=10s reference must follow. RoomSnapshot.poses exposes latest pose per active track (quality stale/unknown after >1s) even without an event; history retains original evidence.

An identity epoch changes on track loss, reassignment, ambiguity, or source restart. A room measurement is patient-attached only if its entire aligned interval belongs to one matched visit/track/epoch. Never attach a prior epoch's sample to the current occupant. Single-person physiology only: more than one candidate in the selected region means uncertain association and resets physiology windows. Phone readings use server-issued capture pairing, not room-camera identity epochs.

## Exact public functions owned by lanes

`createStore({databasePath,now?})` in server/store.ts creates an isolated `WaitingRoomStore`; `createVisit`, `getRoomSnapshot`, `ingestObservations`, and `buildAlertSnapshot` below are methods on that instance, not a process-global singleton. Export its interface from store.ts. The HTTP factory owns one instance. Detector, provider, and client signatures below are standalone exports in their named files.

```ts
// server
createWaitingRoomServer(opts:{databasePath:string; now?:()=>number}): {server:import('node:http').Server; close():Promise<void>};
createVisit(input:{requestId:ID; label?:string}): Visit;
getRoomSnapshot(): RoomSnapshot;
ingestObservations(input:{measurements:unknown[]; poses:unknown[]}): {accepted:number; duplicates:number; rejected:number};
reducePosture(state:DetectorState, observation:PoseObservation, nowMs:number): DetectorResult;
// DetectorState/DetectorResult are exported from detector.ts: state holds reference/candidate/open request ID; result includes next state and zero/one request command.
buildAlertSnapshot(eventId:ID): AlertSnapshot;
summarizeQuestionnaire(answers:Answers, signal:AbortSignal): Promise<QuestionnaireSummary>;
explainAlert(snapshot:AlertSnapshot, signal:AbortSignal): Promise<AlertExplanation>;
validateAlertExplanation(input:unknown, snapshot:AlertSnapshot): AlertExplanation;
renderGroundedText(statements:GroundedStatement[], snapshot:AlertSnapshot): {explanation:string; notificationText:string};
synthesizeNotification(input:{eventId:ID; snapshotVersion:number; text:string}, signal:AbortSignal): Promise<Uint8Array>;
// client/runtime: only camera.ts acquires room getUserMedia; no other lane opens it.
startRoomCamera(video:HTMLVideoElement, onFrame:(frame:FramePacket)=>void): Promise<{stop():void}>;
subscribeBoundFrames(listener:(frame:BoundFrame)=>void): ()=>void;
enrollFace(visitId:ID, frames:FramePacket[]): Promise<{ready:boolean; reason:string|null}>;
identifyFrame(frame:FramePacket): Promise<BindingInput[]>;
resetPoseReference(control:ReferenceControl): void;
extractPose(frame:BoundFrame, control:ReferenceControl, context:SensorContext): Promise<PoseFrameResult>;
createCameraPulseRuntime(context:SensorContext, emit:(value:Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>)=>void): SensorRuntime;
createBreathingRuntime(context:SensorContext, emit:(value:Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>)=>void): SensorRuntime;
estimateCameraPulse(samples:TimedRGB[]): PulseEstimate;
estimateBreathing(samples:ScalarSample[]): BreathEstimate;
// client/phone
startPhoneCapture(video:HTMLVideoElement, onSample:(sample:TimedRGB)=>void): Promise<{stop():Promise<void>}>;
estimateContactPulse(samples:TimedRGB[]): PulseEstimate;
```

`SensorRuntime` is exported from shared/contracts.ts: `{push(frame:BoundFrame):void; reset(reason:string):void; dispose():void}`. `SensorContext` is `{sourceId:ID;runId:ID;getSyncId:()=>ID|null;nextSeq:()=>number}`; each runtime receives its own stream-specific allocator. No valid sync means no submitted observation, with unavailable state shown locally. Its synchronous push extracts pixels/quality while the borrowed image is alive; it cannot keep the bitmap. It owns its channel buffer and emits unusable/null on disqualification. DSP functions accept signals only; identity, visibility, texture and motion rejection belong in runtime/image tests, not impossible tests against a scalar array.

Reset/disqualification emits a point interval at the last processed source timestamp (or a local-only status before any sample); it never labels the prior valid window current. Camera physiology has track/epoch from BoundFrame and null captureId; phone has original visit/capture and null track/epoch. SensorContext identifies the same run as FramePacket. SourceId/streamId/method combinations are schema-validated. Pose uses the pose allocator; its inferred observation has original frame time, not worker completion time.

Internal helper types may be added inside owned files; changing a public signature/schema/route requires integrator review and a contracts revision before downstream work. The integrator owns frame-bus and worker transport; identity/pose own inference algorithms. Capture/sampling runs independently of expensive inference. At target 30Hz, snapshot the decoded image to an owned ImageBitmap and call bounded synchronous ROI consumers with the latest eligible cached metadata; close the bitmap after all synchronous consumers return. For asynchronous inference transfer a dedicated clone to the worker, which closes it after completion. Never pass a mutable video element as a frozen frame, recursively republish frames, or retain unbounded queues. One inference in flight; newer work replaces pending stale work. Targets: identity 5Hz, pose 10Hz, actual physiological sampling >=15Hz. These targets require the combined-load device test, not just a Promise-returning model call.

MetadataStamp identifies the actual inference frame, not the current sample. At sample time require identity age <=500ms; respiration also requires pose age <=250ms, matching epoch, usable stationary pose, and one candidate. Per-frame ROI displacement/visibility checks gate cached regions; excessive motion or failed checks immediately clear eligibility and buffers. Later inference reporting ambiguity retrospectively invalidates affected pending windows; server interval validation is final. Expired or out-of-order model results never relabel a newer frame/epoch. The most recent camera frame can remain live while an individual channel is unavailable. Tests must simulate slow inference and frame reuse/disposal.

### Signal units and quality calculations

RGB means are normalized 0..1. Per-channel saturationFraction is the fraction of ROI pixels <=1/255 or >=254/255 for that channel. Contact PPG rejects saturated candidate channels, not all channels merely because red clips; POS requires all three usable. At 5% or more saturation reject the channel/window. No-finger/coverage checks belong to optical capture/runtime, separate from DSP periodicity. A single color threshold is not universal evidence of fingertip coverage.

For reproducible prototype DSP: linearly resample timestamps only after gap/cadence gates; detrend, apply Hann window, compute power spectrum. Peak/noise is linear power ratio: integrated power within ±1/T Hz of the strongest in-band peak divided by equal-width noise estimated from remaining in-band bins (mean bin power times peak-bin count; T=window seconds). If residual noise or signal variance is numerically zero, return unavailable rather than infinity. Require ratio >=3, record ratio and window length; these are engineering settings, not validated clinical SQI. Peak interpolation uses three adjacent log-power bins when valid. Compare with autocorrelation/beat checks as the packet specifies. The 45s breathing window has ~1.33 breaths/min bin spacing before interpolation; interpolation is not a new accuracy claim. Record actual frame cadence, gaps, sample count, saturation, and accepted/rejected reasons.

## Routes and request shapes

All routes under `/api/wr`. JSON returns `{error:{code,message}}` for 400/401/403/404/409/413/503; accepted duplicates return the original result; unknown visit/event is 404. Station role is local operator session, phone role is bounded to the paired visit/capture and questionnaire role to one visit. Do not place session tokens in query strings/logs. The pairing code is a short-lived public check-in code, never a reusable credential. No general patient read endpoint for a phone.

Client page paths (Codex App.tsx owns pathname dispatch, no router dependency needed): `/station` contains Check in/Monitor modes, `/phone` mounts PhonePage, `/questionnaire` mounts QuestionnairePage. A QR/link targets the configured phone-trusted HTTPS origin plus the appropriate page; the user enters the separate short-lived pairing code there. `/join` establishes only that purpose's cookie and returns the intended visit code for confirmation. QuestionnairePage calls summary/save routes for its paired visit and never requests camera access. Pairing a new purpose explicitly ends the prior unfinished capture; do not rely on two conflicting same-origin phone cookies.

| Method/path | Input -> result | Owner |
| --- | --- | --- |
| GET `/health` | no body -> `{ok:true,serverNowMs}` | P1-A |
| POST `/station` | explicit local station start -> HttpOnly SameSite session cookie; local single-station demo scope | P1-A |
| GET `/room` | station -> RoomSnapshot; poll every 1000ms | P2-A/B |
| POST `/visits` | `{requestId,label?}` -> Visit, 201 | P2-A |
| PUT `/visits/:id/questionnaire` | `{requestId,answers,summary?}` -> Visit; summary.confirmed true only by explicit operator/patient action | P2-A |
| PUT `/visits/:id/seat` | `{requestId,label:string\|null}` -> Visit | P2-A |
| POST `/visits/:id/pair` | `{requestId,purpose:'ppg'\|'questionnaire'}` -> `{code,expiresAtMs}`; single-use 8-digit code, 120s | P2-A |
| POST `/join` | `{code}` -> scoped HttpOnly cookie + `{visitId,purpose}` | P2-A |
| POST `/captures` | PPG cookie, `{requestId,sourceId,runId}` -> `{captureId,visitId}` | P2-A |
| POST `/captures/:id/complete` | PPG cookie, `{requestId,measurement}` -> saved Measurement; reject another visit/cancelled capture | P2-A |
| POST `/captures/:id/cancel` | PPG cookie, `{requestId}` -> `{cancelled:true}` | P2-A |
| POST `/clock-sync` | station/paired cookie, handshake then complete fields above -> server handshake then ClockSync | P1-A/P2-B |
| POST `/bindings` | station, BindingBatch -> `{accepted:number;duplicates:number;rejected:number}`; aligned interval history recorded in memory | P3-A/P2-B |
| POST `/observations` | station, `{measurements,poses}` -> ingest counts | P2-B |
| POST `/requests/:id/acknowledge` | station `{requestId}` -> CheckRequest | P2-B |
| POST `/requests/:id/check` | station `{requestId}` -> `{request:CheckRequest;referenceControl:ReferenceControl\|null}`; null if no current matched track | P2-B |
| POST `/questionnaire-summary` | station/scoped form `{answers}` -> proposed QuestionnaireSummary | P4-A |
| POST `/requests/:id/explain` | station `{snapshotVersion}` -> status; schedules bounded job once per snapshot | P4-B |
| POST `/requests/:id/speech` | station `{snapshotVersion}` -> AudioJob; server takes text only from validated event explanation/fallback | P4-C |
| GET `/audio/:jobId` | station -> audio/mpeg or 409/410 if no longer eligible; never public audio URL | P4-C |
| PUT `/visits/:id/temperature-scenario` | station `{requestId,valueC:37\|38\|null}` -> TemperatureScenario or null | P5-A |

No need for a separate cloud database, Supabase, auth provider, WebSocket, recording service, or large ML training setup. Native SQLite tables: visits, contact_measurements, check_requests, staff_actions, idempotency, scenario_history. Short-lived pairing, source clocks, face embeddings, active tracks, and transient audio stay session-local. Restart invalidates pair/capture tokens, face identity, signal windows, active scenario overlays, and pending audio; saved check-ins/requests/history persist. Don't persist face embeddings by default or mark identity ready after restart.

## Presentation contract (shared/view-model.ts)

```ts
export type Tone = 'neutral'|'info'|'warning'|'danger';
export type StatusBadgeProps = { label:string; tone:Tone };
export type ProvenanceLabelProps = { label:string; tone:Tone };
export type TemperatureCardProps = { valueC:number|null; label:string; sourceLabel:string; tone:Tone };
export type ReadingView = { label:string; displayValue:string; unit:string; qualityLabel:string;
  sourceLabel:string; timeLabel:string; reasonLabel:string; trendSummary:string;
  points:Array<{atMs:number; value:number|null}>; axis:{startMs:number;endMs:number;min:number;max:number};
  axisLabels:{start:string;end:string;min:string;max:string};
  recentValues:Array<{timeLabel:string;valueLabel:string;qualityLabel:string}> };
export type PoseView = { postureLabel:string; activityLabel:string; qualityLabel:string;
  referenceLabel:string; timeLabel:string; reasonLabel:string };
export type PatientView = { id:ID; label:string; identityLabel:string; locationLabel:string;
  assignedSeatLabel:string; reportText:string; originalAnswers:Array<{question:string;answer:string}>;
  summaryStatusLabel:string; readings:ReadingView[]; pose:PoseView;
  temperature:TemperatureCardProps };
export type RequestView = { id:ID; patientId:ID|null; patientLabel:string; locationLabel:string;
  reason:string; state:RequestState; createdLabel:string; durationLabel:string;
  evidence:Array<{id:ID;label:string;timeLabel:string;sourceLabel:string}>;
  explanation:string; providerLabel:string; voiceLabel:string;
  canAcknowledge:boolean; canCheck:boolean; actionPending:boolean; actionError:string|null };
export type OverlayView = { trackId:ID; patientId:ID|null; label:string; bounds:Bounds; tone:Tone };
export type DashboardViewProps = { patients:PatientView[]; requests:RequestView[]; selectedPatientId:ID|null;
  overlays:OverlayView[]; cameraLabel:string; scenarioBanner:string|null; selectedRequestId:ID|null;
  videoSlot:import('react').ReactNode; onSelectPatient:(id:ID)=>void; onSelectRequest:(id:ID)=>void;
  onAcknowledge:(id:ID)=>void; onChecked:(id:ID)=>void; onEnableAudio:()=>void; onToggleMute:()=>void;
  onTestAudio:()=>void; onRetryCamera:()=>void;
  systemStatuses:Array<{label:string;tone:Tone}>; connectionLabel:string; statusAnnouncement:string;
  canRetryCamera:boolean; audioEnabled:boolean; muted:boolean };
```

Integrator owns `DashboardDataProps = Pick<DashboardViewProps,'patients'|'requests'|'selectedPatientId'|'selectedRequestId'|'overlays'|'scenarioBanner'>` and `toDashboardView(snapshot:RoomSnapshot, selection:{patientId:ID|null;requestId:ID|null}):DashboardDataProps` in shared/view-model.ts. StaffPage adds local camera/network/provider statuses, actionPending/actionError overrides, callbacks and audio flags; it never mutates server snapshot evidence. Lovable only consumes the complete props; it never derives identity, sorting priority, timestamps, quality, alert state, or simulated labels. The live `videoSlot` is built by Codex and mounted by Lovable; overlays and accessible track controls are painted by Codex inside that slot. No second camera owner in the layout. UI tokens/layout/accessibility and class ownership are specified in [ui-plan.md](ui-plan.md).

Fixtures: `emptyRoom`, `collectingRoom`, `usableRoom`, `uncertainIdentityRoom`, `openRequestRoom`, `providerFailureRoom`, `simulatedTemperatureRoom`, `staleCameraRoom`, `twoVisitsRoom`, `postureWithoutRequestRoom`, `checkedRearmingRoom`, `movedPatientRoom` exported from fixtures.ts. All are explicitly synthetic RoomSnapshots; include no actual people, faces, questionnaire data, credentials, or source video. Integrator also exports `dashboardFixtures:Record<string,DashboardViewProps>` with spy/no-op callbacks and an explicitly synthetic video placeholder for isolated UI work. Antigravity props are already formatted; it displays exactly what it receives and adds no medical status rules. No downstream UI lane waits for a live backend.

## Model/dependency boundary

Primary-source candidates checked 2026-10-24: Human 3.3.6, MediaPipe Tasks Vision 1.1.1 stable (not 1.2 prerelease), Google GenAI 2.31.0. Treat these as proposed exact pins until P1-A verifies registry metadata, compatibility, and lockfile; never claim installation from this document. Other libraries resolve one compatible stable version in P1-A and are pinned exactly in package-lock. Agents request changes rather than install their own variants. Store downloaded model files under immutable hashes with source/version/license in `public/models/manifest.json`; do not load `main`/`latest` remote assets at runtime. Human MIT code license does not automatically license all included weights. Unresolved descriptor-weight terms block that asset choice, not permission to drop face recognition.

## Client API helper names (integrator owns runtime/api.ts)

Export one `api` object. Every method returns a Promise, uses same-origin credentials, parses the frozen response schema, and throws a typed ApiError with status/code/message on failure. No worker invents its own route variant. Exact wrappers required by the first wave:

```ts
api.createVisit(input:{requestId:ID;label?:string}):Promise<Visit>;
api.getRoom():Promise<RoomSnapshot>;
api.saveQuestionnaire(visitId:ID,input:{requestId:ID;answers:Answers;summary?:QuestionnaireSummary}):Promise<Visit>;
api.assignSeat(visitId:ID,input:{requestId:ID;label:string|null}):Promise<Visit>;
api.createPair(visitId:ID,input:{requestId:ID;purpose:'ppg'|'questionnaire'}):Promise<{code:string;expiresAtMs:number}>;
api.join(code:string):Promise<{visitId:ID;purpose:'ppg'|'questionnaire'}>;
api.createCapture(input:{requestId:ID;sourceId:ID;runId:ID}):Promise<{captureId:ID;visitId:ID}>;
api.completeCapture(captureId:ID,input:{requestId:ID;measurement:Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>}):Promise<Measurement>;
api.cancelCapture(captureId:ID,requestId:ID):Promise<{cancelled:true}>;
api.acknowledge(eventId:ID,requestId:ID):Promise<CheckRequest>;
api.markChecked(eventId:ID,requestId:ID):Promise<{request:CheckRequest;referenceControl:ReferenceControl|null}>;
api.updateBindings(batch:BindingBatch):Promise<{accepted:number;duplicates:number;rejected:number}>;
```

These are interface declarations in the plan, not literal executable object declarations. Remaining route wrappers are added by the integrator with the exact request/response shapes in the route table before handing those modules to a worker.

## Provider snapshot and playback lifecycle

`snapshotVersion` changes only for semantic eligibility/context changes: request acknowledge/check, identity state/epoch/visit, verified location label (including uncertain), camera continuity loss, and scenario context changes. Bounding-box jitter, normal heartbeat timestamps and each new physiological estimate do not bump it. Snapshot facts/measurement intervals are frozen at creation; later current values appear in the dashboard separately. Recheck freshness for any fact being described as current; if stale, use historical-time wording or invalidate/regenerate, never relabel it current. A stable 10s tracking heartbeat must allow an 8s provider job to finish. A real move/uncertainty invalidates immediately, even mid-playback.

In client/staff/audio-queue.ts export `createAudioQueue(opts:{fetchSnapshot:()=>Promise<RoomSnapshot>;playAudio:(job:AudioJob,signal:AbortSignal)=>Promise<void>;now:()=>number;hasStarted:(eventId:ID)=>boolean;markStarted:(eventId:ID)=>void})` returning `{enable():Promise<void>;setMuted(value:boolean):void;enqueue(job:AudioJob):void;updateSnapshot(snapshot:RoomSnapshot):void;invalidateLocal(reason:string):void;dispose():void}`. `playAudio` resolves only on ended, rejects on failure/abort and MUST synchronously pause, clear source and release its object URL when signal aborts. StaffPage supplies these adapters, calls updateSnapshot on each fresh revision and invalidates locally on ack/check initiation, identity/location/camera loss, mute or hidden tab. Failed/stale snapshot fetch suppresses speech. Remote changes cancel on the next <=1s poll; local changes cancel immediately.

In this single-station demo, StaffPage keeps the started-event set in sessionStorage, restoring it before enqueue on reload; markStarted occurs immediately before playback. After start, do not automatically replay on abort/failure/retry/fallback; show interrupted/failed status. Retry before playback may regenerate only a still-eligible unstarted event. Muted queued jobs are dropped, not saved for an unmute burst. Restored requests after service restart are visible but not auto-enqueued. This is at-most-once automatic playback, not a guarantee of audible delivery after a crash; actual failure stays visible. Multi-station exactly-once distributed speech is out of scope. `onTestAudio` plays a bundled/generated-local synthetic tone only and never consumes an event or sends patient text to a provider.
