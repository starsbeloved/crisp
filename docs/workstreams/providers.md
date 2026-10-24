# ROUND 2 — READY / STOPPED FOR FINAL INTEGRATION (2026-10-24)

Final-integration.md authorizes this existing session to implement the complete browser voice controller and questionnaire summary UI. Exclusive additions: `VoiceControls.tsx`, `provider-client.ts`, provider UI tests; transferred edits: `client/patient/{PatientPage,QuestionnaireForm}.tsx`. Existing provider routes and main's `currentRequestBinding` fixes will be preserved. Integrator owns StaffPage mount, HTTP/config/API/global styling. No real paid calls, credentials inspection, device camera use, new agents/chats or cross-chat messages.

Planned export: `VoiceControls({room,connected,actionEpoch})` with the frozen props from final-integration.md. **Frozen summary endpoint for this round:** authenticated `POST /api/wr/questionnaire-summary`, body `{visitId,answers}`, result `QuestionnaireSummary` (unconfirmed). The explicit visitId lets station/kiosk/patient authority enforce the same current visit/editor lease as questionnaire saves, both before and after generation. Integrator owns this route and `main.ts` config. Client imports no server module/key. VoiceControls independently validates at <=1s, aborts locally on actionEpoch/hidden/disconnect, and records started event ids in sessionStorage; initial restored requests are explained but never auto-spoken. New requests observed after mount may auto-speak only after explicit enable. Exact audio cleanup details follow after implementation.

## ROUND 2 implemented exports / integration

- **Mount now:** `import { VoiceControls } from '../staff/VoiceControls.tsx'` (or `./VoiceControls.tsx` from StaffPage); render `<VoiceControls room={room} connected={enabled && !connectionError} actionEpoch={actionEpoch.current}/>` within the staff workspace. It owns enable/mute/test/status controls. Remove/replace DashboardView's old unavailable voice callbacks to avoid duplicate fake controls. StaffPage must increment actionEpoch *before* sending acknowledge/check and trigger a render (its existing pending action state does); the layout effect cancels immediately after that commit. Do not pass an artificially frozen room as connected.
- `VoiceControls(props:VoiceControlsProps)` exports **exact frozen props**, with internal `createVoiceController(...)` for injected tests. No new required parent prop or shared contract change. Controller independently polls authenticated room state every 750ms, with a 1000ms room-fetch deadline and 1500ms freshness watchdog. Parent connection loss, actionEpoch, hidden tab, source/identity/location/version change and mute immediately abort pending work and active playback. Normal bounding/heartbeat/reading updates do not cancel valid speech. Uses the main `currentRequestBinding` semantics for reidentified tracks.
- `provider-client.ts`: `createProviderClient(fetch?)`, `providerClient`, typed `ProviderClient`, `voiceContext`, `createBrowserAudioPlayer(options?)`, typed `BrowserAudioPlayer`. Browser imports only shared schemas/types and existing ApiError; no server/key/config import. Explain/speech bodies contain **snapshotVersion only**, summary contains **visitId + original answers**. Fetches are same-origin, no-store, redirect-error with abort deadlines; response schemas and matching event/version are checked.
- Player owns one real HTMLAudioElement. Enable calls play on a generated local silent WAV during the click turn, then cleans it; local speaker test plays a generated short 660Hz WAV and never invokes providers/consumes a request. Notification bytes are fetched only from authenticated `/api/wr/audio/:id`, MIME/size checked (<=2MB), then played through a Blob URL. Promise resolves on `ended`, not `play()` success. Abort **synchronously** pauses, clears src, invokes load, revokes URL and aborts fetch/body reader. Hung unlock/test expires after 3s; queue/event playback expires after 60s. Browser permission/play failure is visible and turns voice off for re-enable; already-started events remain suppressed.
- Voice starts persist **only event IDs** at `sessionStorage['wr.voice.started.v1']`, immediately before play. No text/names/audio/patient answers are stored. Storage unavailable/corrupt fails closed. Initial requests after mount/reload, or observed while voice off/muted/hidden/disconnected, are not queued into a later burst. Newly observed eligible events after enable automatically explain → synthesize → re-fetch room → queue → re-fetch room → authenticated audio GET → play. One call per event/version in this controller; no unbounded provider retries. Status exposes pending/ready/fallback/unavailable plus queue lifecycle independently of check request state.
- QuestionnaireForm retains existing API and adds optional injected `summarize(visitId,answers,signal)`. It uses real local endpoint by default, offers optional **Review AI summary**, editable unconfirmed complaint/onset/course, **Confirm summary and save answers**, and the existing original-only **Save answers** path. Generation never saves or self-confirms. Original edits abort/discard pending/stale summary and clear confirmation. Explicit confirmed save preserves originals plus summary; failed saves reuse identical request IDs/bodies. Pending generation cancels on unmount/Back; no local answer persistence. Existing kiosk imports automatically gain the same form; no check-in-owner edit needed.
- PatientPage renders the server-confirmed summary readback only when saved `summary.confirmed===true`; original-answer journey remains usable if summary/config/provider fails.
- `grounding.ts` fix: verified location may follow a genuine same-visit current reidentified track **after version 1**. Version 1 still requires original trigger track/epoch. Main's provider HTTP/service/eligibility and audio-queue `currentRequestBinding` changes are preserved; no HTTP/store/shared/API/App/StaffPage/config/dependencies edited here.

## ROUND 2 changed files

```text
apps/waiting-room/client/staff/VoiceControls.tsx         NEW
apps/waiting-room/client/staff/provider-client.ts       NEW
apps/waiting-room/client/patient/QuestionnaireForm.tsx   modified
apps/waiting-room/client/patient/PatientPage.tsx         modified
apps/waiting-room/server/providers/grounding.ts         scoped reidentification fix
apps/waiting-room/tests/provider-client.test.ts         NEW
apps/waiting-room/tests/provider-ui.test.tsx            NEW
apps/waiting-room/tests/provider-voice.test.tsx          NEW
apps/waiting-room/tests/grounding.test.ts               added regression
docs/workstreams/providers.md                         this handoff
```

## ROUND 2 verification (fresh, module/software proof)

Commands from `apps/waiting-room`:

```sh
npm run test -- tests/questionnaire.test.ts tests/grounding.test.ts tests/voice.test.ts tests/provider-client.test.ts tests/provider-ui.test.tsx tests/provider-voice.test.tsx tests/ui/patient-flow.test.tsx
# exit 0 — 7 files, 144/144 passed
# questionnaire 15; grounding 28; voice 53 (main preserved regressions);
# provider-client 10; provider-ui 7; provider-voice 16; existing patient-flow 15
npm run typecheck
# latest run exit 0 — no diagnostics
```

An additional explicit owned-file `tsc` command with ES2023/DOM, bundler resolution, strict, react-jsx and node/vite types passed. Earlier global checks saw temporary sensor/media missing-file diagnostics while those owners worked; never edited their files. Type errors in this lane's test double signatures were corrected. Initial RED demonstrated missing controller/client/review UI; subsequent RED covered proposal readiness, browser unlock/test timeout, reidentification location wording and re-enable after actual-player rejection. All are GREEN in latest targeted run.

**No full suite/build run by this lane, real provider call, real speaker audio, camera/phone acquisition or private upload.** HTTP/client/browser boundaries in tests are injected synthetic fixtures. Audio adapter uses the actual cleanup/control code with fake HTMLAudioElement/HTTP; this does not establish audible browser/device acceptance. Final integrator owns mounted StaffPage, real browser end-to-end check, full suite/typecheck/build. Existing real-provider gates from Round 1 remain. Primary browser API docs consulted: [HTMLMediaElement.play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play), [browser autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay); permission success is checked, never assumed.

## Remaining integration and authorization gates

1. Mount VoiceControls as above and connect real StaffPage actionEpoch/connection state. Its own buttons replace fixed unavailable voice actions; provider state appears in request/dashboard room data through existing routes. No integration permission blocker in this lane.
2. Integrator's current HTTP summary route matches `{visitId,answers}` and rechecks authority after generation; current main.ts imports configured adapters. Preserve those changes. Configure explicit opt-in provider flags plus `GEMINI_API_KEY`, `GEMINI_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` only server-side, with separate human authorization before real external provider work. This session inspected variable names/code only, never credentials or actual environment values.
3. Actual currently available model/authorized voice/account and synthetic real requests remain **not provider-validated**. Confirm at least one accepted grounded Gemini output (not fallback) and actual ElevenLabs audio heard on laptop, including browser enable/mute/ack-during-play. Software completion does not satisfy these gates.
4. Controller and summary UI are complete within this lane and **this owner is stopped**. Final integration owner may now take surgical ownership of these paths if required. No new sessions/agents/messages were launched. Round 1 historical handoff below is retained; Round 2 supersedes its earlier module-only UI/route gaps.

# ROUND 1 — verified module checkpoint

Owner: fifth authorized Codex session, 2026-10-24. Only provider modules, audio queue, three owned tests and this note are editable. No real provider calls, credentials inspection, uploads, dependencies, HTTP/store/shared/UI edits, messages or additional workers.

## Frozen exports and integration seams (published before implementation)

- `server/providers/questionnaire.ts`: `summarizeQuestionnaire(answers:Answers, signal:AbortSignal):Promise<QuestionnaireSummary>` and injectable `createQuestionnaireProvider(transport)` returning the same function. Returns an unconfirmed proposal; originals are never mutated. Unavailable/invalid output throws a sanitized `ProviderError` (caller keeps the original form usable).
- `server/providers/gemini.ts`: `explainAlert(snapshot:AlertSnapshot, signal:AbortSignal):Promise<AlertExplanation>`, injectable `createAlertExplainer(transport)` with that function and `explainWithStatus` returning `{state:'ready'|'fallback',value}`. Server-only Gemini transport configured lazily from `GEMINI_API_KEY` / `GEMINI_MODEL`; no default model claim.
- `server/providers/grounding.ts`: frozen `validateAlertExplanation(input,snapshot)` and `renderGroundedText(statements,snapshot)` plus `buildFactualFallback(snapshot,reason?)`, `groundingCatalogue(snapshot)` and canonical limitations. Text is rendered from structured facts/measurements; raw patient/fact instructions are never spoken or treated as instructions.
- `server/providers/elevenlabs.ts`: frozen `synthesizeNotification({eventId,snapshotVersion,text},signal):Promise<Uint8Array>` and injectable `createNotificationSynthesizer`. Server-only config: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`. Transport has no automatic retries, 8s deadline, <=300 text characters and bounded audio.
- `server/providers/service.ts`: `createProviderService(options:ProviderServiceOptions)` provides injectable bounded orchestration for explanations and transient audio; station argument/eligibility enforced at scheduling and audio read. Integrator supplies `getSnapshot(eventId)`, `getRoomSnapshot()`, `now()`, current station id, `explain` and `synthesize`. HTTP handlers must accept event/version only, never arbitrary speech text, and authenticate the station before using this seam.
- `client/staff/audio-queue.ts`: exact `createAudioQueue({fetchSnapshot,playAudio,now,hasStarted,markStarted})` and methods from contracts.md. StaffPage must provide sessionStorage persistence, cancellable playback and <=1s snapshots, plus local invalidation on acknowledge/check initiation, visibility/camera/connection loss. No UI edits here.
- `readAudioQueueStatus(queue):AudioQueueStatus[]` is optional status readback, keeping the frozen queue's return methods unchanged. States: pending, validating, playing, played, failed, cancelled, suppressed. Sanitized failure reasons remain separate from the check request's state; at most 100 recent status records.
- Supporting owned modules: `common.ts` exports sanitized `ProviderError`, deadline/JSON helpers; `transport.ts` exports `GeminiTransport`, `createGeminiTransport` and lazy `serverGeminiTransport`; `eligibility.ts` exports server `eligibilityStamp`. The browser imports only shared types, never provider code/configuration.

### Service methods (all ids/versions use current shared types)

```ts
requestExplanation(eventId:string, version:number, station:string):Promise<ExplanationResult>
requestSpeech(eventId:string, version:number, station:string):Promise<AudioJob>
getExplanation(eventId:string, version:number, station:string):{state:ProviderState;value:AlertExplanation|null}
listAudioJobs(station:string):AudioJob[]
readAudio(jobId:string, station:string):Uint8Array
updateSnapshot(room:RoomSnapshot):void
dispose():void
```

`ExplanationResult` is `{state:'ready'|'fallback';value:AlertExplanation}`. Pass `explainWithStatus` (or the injected equivalent) as `explain`, and `synthesizeNotification` as `synthesize`. The standalone frozen functions remain available; the service owns scheduling/deduplication/current-state rejection, so routes should use it.

## Rulings / contract limits

- Current shared contracts have no temperature fields; retired packet examples are not implemented. Synthetic/replay provenance remains explicit.
- Questionnaire output is conservatively extractive with canonical onset/course wording. An exact bounded output catalogue prevents a schema-valid model from inventing clinical facts. Patient correction/explicit confirmation remains the existing UI/store owner's responsibility.
- AlertSnapshot has no camera continuity, station or server clock fields. Pure explanation rendering is historical; live eligibility requires the supplied RoomSnapshot and station context in the orchestration seam. Timestamp/bounds refreshes do not affect semantic eligibility.
- `AudioJob` has no expiry or identity fields. The server retains private eligibility stamps/expiry and uses same-origin transient URLs; browser queue derives a stamp from RoomSnapshot and checks age <=60s. No shared type changes requested.
- Voice location catalogue permits compact observed zone labels such as `B4`, `C2`, `Row 4`. An arbitrary label/name becomes an uncertainty announcement. Assigned seats never supply observed location. All physiology is described as recorded evidence, never relabeled current.
- Current room/binding/location freshness must be <=1500ms (up to 1000ms future clock tolerance). `now()` must use the same aligned server time domain as RoomSnapshot, not an unrelated raw device clock. Bounds, heartbeat timestamps and physiological updates are excluded from semantic stamps; source/run changes are included.
- No Git repository is present. Files are retained in place; no Git initialization, commits or cleanup.

## Verification

Executed in `apps/waiting-room` with Node v26.5.0, installed Vitest 5.0.5, TypeScript 5.9.3 and `@google/genai` 2.31.0. No install or paid call was performed.

- Initial RED: `npm run test -- tests/questionnaire.test.ts tests/grounding.test.ts tests/voice.test.ts` exited 1, all three assigned modules missing.
- Subsequent RED cases demonstrated the shared 500-character summary boundary, missing SDK continuation limit, model-supplied fallback incorrectly labeled ready, playback not expiring, cached result mutation, superseded camera run and absent queue status readback. Each was fixed in the owned lane and rerun.
- Latest targeted suite: `npm run test -- tests/questionnaire.test.ts tests/grounding.test.ts tests/voice.test.ts` — **93/93 passed**, 3/3 files, exit 0. Questionnaire 15, grounding 27, voice 51.
- Latest owned-file typecheck — **exit 0**, no diagnostics:

```sh
node node_modules/typescript/bin/tsc --noEmit --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --verbatimModuleSyntax --strict --skipLibCheck --types node server/providers/*.ts client/staff/audio-queue.ts tests/questionnaire.test.ts tests/grounding.test.ts tests/voice.test.ts
```

- `npm run typecheck` first found an owned test-double parameter mismatch, which was fixed; the following run passed. A later project run exited 2 with a concurrent foreign-lane error only: `tests/ui/phone.test.tsx:145` passes unsupported `exact` to `getByRole` (`TS2769`). That file was left untouched. Main must rerun after all workers stop.
- No build, whole test suite, real API request, actual browser playback or camera test was run in this lane.

### Demonstrated with synthetic fixtures/injected transports only

Original answers and unconfirmed proposal preservation; patient instruction/data separation; missing facts; invalid JSON/schema and unsupported clinical/numeric/location output; wrong event/version/epoch; explicit synthetic/replay context; exact statement ordering; 8s timeout/abort cleanup; accepted grounded mock Gemini result versus fallback status; configured SDK payload (JSON schema, single attempt, automatic continuation off); configured ElevenLabs HTTP request/body/headers with bounded streaming response; failure/invalid response; 20-job cap/60s memory expiry; station checks and GET revalidation; no duplicate synthesis; stale text/audio cancellation; benign 10s heartbeat survival; enable/mute/ack/check/identity/location/source-loss playback suppression/cancellation; reload started-id suppression; failed-started at-most-once behavior; queue lifecycle readback.

### Changed paths

All paths below are inside this assignment (no neighboring callers modified):

```text
apps/waiting-room/server/providers/common.ts
apps/waiting-room/server/providers/transport.ts
apps/waiting-room/server/providers/questionnaire.ts
apps/waiting-room/server/providers/grounding.ts
apps/waiting-room/server/providers/gemini.ts
apps/waiting-room/server/providers/eligibility.ts
apps/waiting-room/server/providers/elevenlabs.ts
apps/waiting-room/server/providers/service.ts
apps/waiting-room/client/staff/audio-queue.ts
apps/waiting-room/tests/questionnaire.test.ts
apps/waiting-room/tests/grounding.test.ts
apps/waiting-room/tests/voice.test.ts
docs/workstreams/providers.md
```

## Integration work / unresolved gates

1. Main/event owner wires authenticated summary/explain/speech/audio routes. Persist/show the deterministic request first. Construct snapshots with frozen event facts/measurements plus current binding. Feed semantic changes into `service.updateSnapshot` immediately; merge `getExplanation` and `listAudioJobs` into room responses. No provider decides the initial trigger.
2. Use server-authenticated station context, not a client-supplied station id. `readAudio` rechecks eligibility and returns a copy; route returns `audio/mpeg` with private/no-store cache headers. Do not expose public URLs. `ProviderError` codes map to explicit HTTP failures (forbidden, ineligible, expired, capacity/unavailable), without raw provider exception text. Dispose the service when the station/server ends. Max 20 cached event/version entries, max 2MB audio each, 60s expiry; a full cache fails visibly rather than evicting into duplicate synthesis.
3. StaffPage supplies one queue, restores/records sessionStorage started ids, polls <=1s, exposes queue statuses, and invalidates locally on nurse action initiation, hidden tab and source/connection loss (including failed room polling). Its `playAudio` resolves on ended and rejects on failure/abort; on abort it must synchronously pause, clear the source, abort any audio fetch and revoke its object URL. The queue's AbortSignal/expiry is tested with an injected adapter; real HTMLAudioElement cleanup and autoplay unlocking are a downstream integration gate. FetchSnapshot's frozen signature has no signal; the queue ignores late results and settles locally on abort, while its caller owns network cancellation.
4. Questionnaire route handles sanitized unavailable/invalid-output errors while retaining original answers. Summary remains an editable proposal; only explicit patient/operator confirmation may save `confirmed:true`. The conservative extractive catalogue does not claim free-form clinical interpretation.
5. Real model/account/voice authorization and actual synthetic provider requests remain **not run / not provider-validated**. Configure a currently available structured-output Gemini model and an authorized stock ElevenLabs voice/model on the server only; verify at least one accepted Gemini explanation and one actual response heard on this laptop after separate authorization. Do not describe mocks or factual fallback as working live providers.
6. Main performs complete route/dashboard regression, final full test/typecheck/build after workers finish. This worker stops at this module checkpoint and sends no cross-chat messages.

## Primary API references consulted (2026-10-24)

Installed `@google/genai/dist/genai.d.ts` supplied version-specific `GenerateContentConfig` / retry / abort fields. [Official Gemini structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output), [SDK generation configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html), [SDK retry settings](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html), and [ElevenLabs create speech endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) corroborated payloads. SDK abort cancels the client wait; it does not establish that upstream processing or billing stopped. No account capability or model availability was probed.
