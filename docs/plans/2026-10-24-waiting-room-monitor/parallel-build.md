# Parallel build — three-view demo

2026-10-24: User explicitly requested 3+ Codex sessions to build the app. This supersedes the prior sequential/pause preference for these new assignments only. Use GPT-6.1 Sol/high. No subagents inside workers. Main chat integrates, owns shared contracts/backend/global CSS/App and final build. No Git initialization, external upload/deployment, camera use without permission, or destructive cleanup.

## User outcome

One app with three distinct routes/views: `/check-in` (patient arrival), `/vision` (foreground camera owner, judge-facing live tracking visualization), `/staff` (nurse controls with smaller view of the SAME camera feed). Phone `/patient` continues questionnaire and fingertip PPG. On one laptop use the webcam sequentially for enrollment then monitoring; Vision owns monitoring capture and other tabs subscribe, not independently open the webcam. Hidden/background camera capture is not promised; stale state is explicit.

Future borrowed-laptop setup separates check-in, vision capture and staff dashboard. This needs authenticated role pairing, HTTPS and actual cross-device video transport. A remote browser cannot read the main laptop's localhost or MediaStream directly. Main chat owns that transport decision/integration. No public tunnel/deployment is authorized yet. Do not claim multi-laptop support merely from three routes.

Screenshot reference: large patient camera tiles, face/track boxes and labels, dark camera canvas, side request list. Reuse the VISUAL relationship, not the screenshot's clinical triage ranking, critical labels or assumed multi-person capacity. One live camera/consenting seated volunteer first; empty slots say unavailable, never fabricated people/readings.

## Exclusive ownership

| Session | Editable files | Deliverable |
| --- | --- | --- |
| Patient experience | `client/check-in/**`, `client/patient/**`, `client/phone/{PhonePage,PhoneRoute}.tsx`, `tests/ui/check-in.test.tsx`, `tests/ui/patient*.test.tsx`, `tests/ui/phone.test.tsx`, `tests/ui/app-phone.test.tsx`, `docs/workstreams/patient.md` | Real kiosk + one-phone questions/PPG flow, typed API calls, saved/failed/assistance states |
| Vision/identity | `client/vision/**`, `tests/vision*.test.ts*`, `docs/workstreams/vision.md` | Camera lifecycle and large VisionPage, overlay transforms, identity association/enrollment logic, licensed model adapter feasibility |
| Physiology/pose | `client/sensing/**`, `tests/sensing*.test.ts`, `docs/workstreams/sensing.md` | POS rPPG, independent breathing and pose feature modules consuming BoundFrame; quality rejection and temporal resets |
| Event/backend | `server/{http,store,ingest,detector,snapshot}.ts`, `tests/{http,store,ingest,detector,patient-session}.test.ts`, `docs/workstreams/events.md` | Identity-safe observation ingestion, deterministic requests, persisted nurse actions; preserve new kiosk/patient sessions |
| AI/voice (fifth session) | `server/providers/**`, `client/staff/audio-queue.ts`, `tests/{questionnaire,grounding,voice}.test.ts`, `docs/workstreams/providers.md` | Gemini questionnaire/explanation adapters, evidence validation/fallback, ElevenLabs adapter and cancellable at-most-once queue |
| Main chat | All other paths, including App, shared, API, server, styles, dashboard, config/deps, device pairing/transport, ledgers | Nurse experience, deterministic requests/providers, safe interfaces, integration, final tests/build |

No worker edits package/config/lock/shared/API/App or other tests. Workers request exact additions in their own note. Main handles installs only if necessary and authorized. Worker test commands must target owned tests; main runs whole suite/build. Do not fix foreign-owner failures. Existing check-in UI tests are RED by design and transferred to patient owner. Existing backend/phone-source work is preserved.

**Ownership transfer:** Event/backend worker now exclusively owns the listed server files and tests. Main will not edit those concurrently. Main retains server/clock.ts, shared/API, providers if later assigned, config and UI. Before provider integration or remote viewer pairing, request/coordinate server changes through the events note; no simultaneous HTTP writers.

**Fifth-session transfer:** User explicitly requested an additional session. AI/voice now owns only the provider/audio paths listed above. It does not edit HTTP/store/shared/API/StaffPage/config or dependencies. Use existing frozen provider signatures from packets10/11 and actual shared types (temperature removed). Record exact exports and integration instructions in providers.md; main integrates after workers finish. No credentials inspection, real paid API calls, patient uploads or voice cloning are authorized by this assignment. Mock transport proves module behavior only; actual provider validation remains a separate gate. No worker messages other chats or launches more workers.

## Integration interfaces

Patient: `CheckInPage()` named export from `client/check-in/CheckInPage.tsx`; `PatientPage()` from `client/patient/PatientPage.tsx`. Use existing `api` methods plus main's `api.startKiosk()`, `api.kioskSession():Promise<{visit:Visit|null}>`, `api.kioskCreateVisit({requestId,preferredName?,consent?}):Promise<Visit>`, `api.kioskSaveQuestionnaire({requestId,answers,summary?}):Promise<Visit>`, `api.kioskPair(requestId):Promise<{code:string;expiresAtMs:number}>`, `api.kioskTakeover(requestId):Promise<{ok:true}>`, `api.kioskFinish(requestId):Promise<CheckInReceipt>`, `api.kioskReset(requestId):Promise<{ok:true}>`. `/patient` joins `purpose:'patient'`, reads `api.patientSession`, saves through existing questionnaire method and finishes through `api.finishPatient`. Existing `/phone` legacy route remains functional. PhoneSession must accept patient role and support an already paired visit without silently re-pairing. No fake enrollment state; use an injected enrollment integration seam or visibly unavailable until connected.

Vision: export `VisionPage(props:{onStream?:(stream:MediaStream|null)=>void;onBindings?:(batch:BindingBatch)=>void;onFrame?:(frame:BoundFrame)=>void;context:SensorContext;nowMs:()=>number})` from `client/vision/VisionPage.tsx`. One owned stream; call onStream(null) on stop/loss. Frames/bitmaps have explicit synchronous borrowing/closure rules matching frame-bus. No HTTP/shared writes; parent wires bound-frame ingestion. Export camera and identity utilities locally with tests. Enrollment interface proposal must be written in vision.md for main/patient integration before callers change. If no verified descriptor asset, identity stays unavailable—not seat-only or detection-only success. Worker may research primary public sources, not download/install/change manifests independently.

Sensing: export `createRppgRuntime(context:SensorContext,emit:(m:Omit<Measurement,'alignedStartAtMs'|'alignedEndAtMs'|'receivedAtMs'>)=>void):SensorRuntime` from `client/sensing/rppg.ts`; same `createBreathingRuntime` from breathing.ts. Follow existing packet08/09 exports if they differ: report mismatch before coding callers. Pose module returns `PoseFrameResult` and does NOT create staff requests. Read packet07. Read actual BoundFrame and metadataEligibility. No camera owner or duplicate frame sampling; subscribe/schedule in parent.

## Required regression scenarios

- Two enrolled people swap seats, cross, disappear or reappear: conservative match threshold plus runner-up ambiguity, one-to-one assignment and epoch/window reset. Test false matches AND false rejections. Never key identity by seat or smooth an identity switch.
- Poor light, exposure change, motion, clipping, irregular cadence or flat/noisy input: reject quality rather than output plausible BPM. Filtering/smoothing applies only within valid same-identity windows, resets on gaps, and cannot revive stale readings or invent a change. Report latency and usable-window rate.
- Nurse selects a check request → same visit and verified current track; failed/stale AI/audio cannot hide it or announce the wrong location.

Primary research context: Human embedding docs describe model-dependent similarity, not a universal calibrated confidence threshold (https://github.com/vladmandic/human/wiki/Embedding). Experimental rPPG work reports sensitivity to illumination and movement (https://pmc.ncbi.nlm.nih.gov/articles/PMC8704576/). The anecdote is a test prompt, not proof that increased strictness/smoothing fixes our system.

## Completion definition

Workers implement their scoped modules and verify them, reporting blocked hardware/model/provider items honestly. Main integrates until a runnable local patient-to-nurse app exists; real phone/face/physiology acceptance requires actual devices and consenting participation. No unit-test-only claim that the full medical-adjacent demo works. Checkpoint notes contain exact exports, files, test commands/results and next integration steps. No automatic new threads or messaging other chats by workers.
