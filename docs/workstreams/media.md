# Media transport workstream

## ROUND 2 — READY / OWNER STOPPED (2026-10-24)

Final lane implementation and verification complete; safe for the integration owner to take surgical ownership. **20/20 owned tests pass**, scoped strict TypeScript exits 0, real in-app browser moving-canvas WebRTC/stop/freeze/reconnect verified. Main HTTP and StaffPage mounts, plus sensing's source tagging/publisher mount, are now present. No actual webcam/phone/biometric/provider acquisition or remote-laptop validation performed. Exact evidence and remaining phone configuration points below.

Ownership: new `client/media/**`, `tests/media*`, new `server/media*.ts`, this note. Implementing authenticated same-origin cross-tab WebRTC sharing of the single Vision camera; no second getUserMedia, cloud relay, uploads, camera operation, extra chats/agents or edits to previous patient files.

Frozen exports: `useCameraPublisher(): (stream:MediaStream|null)=>void`; `StaffCamera({room,selectedPatientId,selectedRequestId})` using RoomSnapshot and nullable string IDs. Server signaling seam and phone boundary audit follow after inspecting existing auth/runtime.

### Frozen server integration seam — implement now in main-owned http.ts

New `server/media.ts` exports `createMediaBroker({now?:()=>number})`, returning `{handle(stationSessionId:string,body:unknown):MediaReply, reset():void}`. New `MediaError` carries `status`, `code`, `message`. Construct one broker per HTTP server. For **POST `/api/wr/media` only**, call `requireStation()`, read JSON with existing bounded `readBody`, **call requireStation() again**, then `respond(res,200,media.handle(stationSession!,body))`. Catch MediaError using its status/code/message. Reset broker when `/station` replaces stationSession and on server.close. No phone/kiosk route access. Existing same-origin/host/forward-header checks remain. Client performs `api.getRoom()` before registration and each mailbox action still requires station auth.

`handle` returns a bounded in-memory, station-session-scoped mailbox; never persists SDP/ICE/video. Client POST schema: register `{action:'register',clientId,role:'publisher'|'receiver'}`; poll `{action:'poll',clientId,afterSeq:number}`; send `{action:'send',clientId,targetId,message:{type:'offer'|'answer',sdp}|{type:'candidate',candidate:RTCIceCandidateInit}}`; close `{action:'close',clientId}`. Offers may carry `{source:{sourceId,runId}}`. Reply `{events:MediaEvent[]}` with monotonically increasing per-client `seq`. Client IDs are fresh per mounted transport, no credentials are returned/stored. One publisher, at most eight receiver clients, 6-second heartbeat expiry; server derives sender role, validates target/session and negotiation direction. Final exact types follow source.

Frozen browser mounts: `VisionRoute` calls `const publishCamera=useCameraPublisher()` and passes it as VisionPage `onStream`; publisher receives the borrowed stream and MUST NOT stop its source tracks. Staff integration injects `<StaffCamera room={room} selectedPatientId={selection.patientId} selectedRequestId={selection.requestId}/>` in `videoSlot`. It does not request its own camera.

No cross-tab BroadcastChannel is used. WebRTC uses no STUN/TURN/cloud relay and adds source tracks directly to peer connections. Current backend local auth only supports local same-origin tabs. No remote-laptop support claim or auth expansion.

### Source/overlay integration addition — sensor owner VisionRoute

`useCameraPublisher` still has the frozen no-arg signature. To safely join received pixels to backend overlays, import `tagCameraStream` from the same module, and before invoking the publisher call `if(stream)tagCameraStream(stream,{sourceId:runtime.context.sourceId,runId:runtime.context.runId});publishCamera(stream)`. It tags that borrowed MediaStream in a session-local WeakMap, no mutation/storage/upload. The offer carries only sourceId/runId. Staff draws overlays ONLY for that source/run and fresh server bindings; an untagged stream can be shown live with overlays explicitly unavailable. This avoids old-run boxes over a new camera stream. No biometric/video metadata in signaling beyond stream association IDs.

### 14:47 EDT — transport and StaffCamera implemented, integration can mount now

- `server/media.ts` and `client/media/{protocol,transport,liveness,overlays,useCameraPublisher}.ts`, `StaffCamera.tsx`, `media.css` exist. 18 owned tests pass; scoped TypeScript check exits 0.
- **Exact poll request includes `afterSeq:number`** (initial 0). Replies retain sequenced events until acknowledged by a later poll. This replaces the abbreviated earlier poll schema and prevents a lost HTTP response from consuming an offer.
- `StaffCamera` verifies `/room` access before `/media`, has explicit reconnect, hides video until a fresh presented frame, closes/clears video on >1s freeze, hidden tab, auth/poll failure, or lost track. No second camera. Current source/run + <1s binding age required for overlays; ambiguous duplicate matches cannot highlight a patient. Selected request uses its visit's uniquely current track; never the historical trigger box or assigned seat.
- Main HTTP wiring + StaffPage mount and sensor owner publisher mount remain pending in this snapshot. Do not change the media-owned modules while active.

### Phone-readiness software audit (14:50 EDT)

Read only, no secrets/certificates inspected. Existing `environment.ts`, `vite.config.ts`, `server/main.ts`, phone QR builder, phone-boundary tests and `docs/phone-https.md` inspected. Main has already added `patientOriginForClient` and Vite define, aligning kiosk QR with backend WR_PHONE_ORIGIN; mismatch fails closed. Phone boundary now blocks staff/vision/check-in/gallery/bootstrap/media API routes and permits patient-scoped routes. Existing proxy/role tests pass with authorized loopback listeners (5 tests); new real-media HTTP auth test passes (1), proving unpaired and paired-patient requests cannot register/read signaling, foreign origins cannot reuse station cookie, session replacement clears mailbox and conflicts are typed 409.

Concrete remaining software/documentation points for integrator:
- `docs/phone-https.md` is historical: still calls station synthetic and directs `/phone`/PPG grants, omits `/patient` combined journey and main's QR variable alignment. Update current operator instructions when integration settles; preserve historical evidence attribution.
- `phoneOrigin` accepts a syntactically HTTPS localhost origin while patient QR correctly rejects loopback. Recommend matching fail-closed hostname rules at config validation, including .localhost/127/IPv6 loopback. A configuration accepted by server but unusable for phone QR should produce an actionable startup error.
- Vite config reads process.env; ordinary root `.env` values are not loaded explicitly through loadEnv for WR_* settings. Operator must export values into both API and Vite processes (as the docs say) or main can implement one explicit non-secret configuration path. Do not imply saving a .env automatically configures this setup.
- There are no confirmed authorized certificate/hostname/trust settings here. Actual phone HTTPS reachability, trusted certificate, rear lens, torch, signal/cadence, pause/stop and same-visit automatic save remain real-device gates, not code omissions to fake.

Real-browser synthetic-canvas probe is in progress in an isolated in-memory loopback server (no saved patient data). It caught/fixed a Node strip-only runtime syntax issue in MediaError, now covered by a native Node import regression.

### Real-browser synthetic proof (14:54 EDT)

Isolated in-memory API + Vite middleware test server via `node tests/media-browser-server.ts` (loopback-only permission approved). In-app Chromium, two separate visible same-origin iframe documents, actual canvas.captureStream + actual RTCPeerConnection + real staff HTTP auth/mailbox. Publisher and receiver showed identical SYNTHETIC CANVAS counter/moving square; StaffCamera changed from connecting to `Live · same Vision camera` only after presented frames. Stop publisher cleared receiver video and live label; source-side canvas remains visibly synthetic. Screenshot `apps/waiting-room/tests/media-browser-live.jpg`. This proves real local browser transport, not physical webcam/face/phone/device validation or separate remote laptops. Playwright connector stalled; in-app browser completed the proof. Frozen-frame and reconnect probe continues.

## Final ROUND 2 handoff — 14:57 EDT

### Implemented behavior

- Existing-only stream sharing: `useCameraPublisher()` + `tagCameraStream(stream,{sourceId,runId})` borrow Vision's video track. No getUserMedia in media files; disconnect never stops the owned source camera. Hook retires sharing on null/track end/mute/hidden/unmount and serializes replacement.
- Real WebRTC with `iceServers:[]`; no third-party STUN/TURN/video relay, BroadcastChannel, audio track sharing, recording or video HTTP payload. Offer/answer/ICE only traverse the authorized ephemeral server mailbox.
- Server station enforcement is integrated by main around broker actions, including recheck after request body. Mailbox resets when station authority changes or server closes. SDP <=64KiB, ICE <=4KiB, <=128 pending events/client, one publisher/eight subscribers. Acknowledged cursors make lost poll retries nondestructive; overflow/expiry fail closed. No SQLite/localStorage media persistence.
- Staff receives no stream until room authentication and peer negotiation. A connected peer is not live until the browser presents a fresh decoded frame. >1s frame freeze, >5s first-frame failure, hidden tab, track loss, peer/auth/signaling failure clear the video/overlays. Reconnect is explicit after receiver failure; no frozen footage labeled live.
- Overlay geometry uses identical contain/unmirrored viewBox mapping. Binding source/run must equal the received offer's source/run; bindings/location must be fresh and nonfuture. Duplicate/ambiguous identities remain uncertain, never borrow assigned-seat location. Selected request resolves to the same visit's uniquely verified current track; missing/current uncertainty is visible.
- Phone readiness audited read-only. Five existing phone-boundary tests pass; actual phone TLS/device proof remains pending. Concrete config/docs repairs were recorded above for main; this lane did not edit them.

### Owned files

New `apps/waiting-room/client/media/{protocol.ts,transport.ts,liveness.ts,overlays.ts,useCameraPublisher.ts,StaffCamera.tsx,media.css}`; `server/media.ts`; `tests/media-{broker,transport,liveness,http,node}.test.ts`; `tests/media-staff-camera.test.tsx`; reproducible isolated test harness `tests/media-browser{.html,.tsx,-server.ts}`; screenshots `tests/media-browser-{live,stale}.jpg`; root `docs/workstreams/media.md`.

No former CheckInPage/PatientPage/QuestionnaireForm, API/shared/config/dependencies/lock, HTTP/main, VisionRoute, StaffPage, model or other-owner tests were edited by this lane. Main/sensing independently mounted the documented exports during implementation; readback confirms source tagging and mounts now exist.

### Exact final verification

From `apps/waiting-room`:

```
npm test -- tests/media-broker.test.ts tests/media-transport.test.ts tests/media-liveness.test.ts tests/media-staff-camera.test.tsx tests/media-http.test.ts tests/media-node.test.ts
```

Exit 0: **6 files / 20 tests passed**. HTTP test uses only an in-memory API on loopback; sandbox listener EPERM was reported, then the narrow local-listener escalation was approved. Separate audit `npm test -- tests/media-http.test.ts tests/phone-boundary.test.ts`: 6 tests passed, exit 0 (one media + five existing phone). No suite/build claim; main owns final full-app verification.

```
./node_modules/.bin/tsc --noEmit --target ES2023 --lib ES2023,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --verbatimModuleSyntax --jsx react-jsx --strict --skipLibCheck --types node,vite/client client/media/*.ts client/media/*.tsx server/media.ts tests/media*.ts tests/media*.tsx
```

Exit 0, no diagnostics. Native Node import test covers actual development runtime, including the strip-only syntax fix observed in the browser-server startup.

Real in-app Chromium: `node tests/media-browser-server.ts` served an isolated in-memory loopback API and test-only Vite harness. Two visible same-origin iframe documents connected using actual RTCPeerConnection and a moving synthetic canvas. Same counter appeared at sender/receiver; no camera or stored patient data. Stop cleared receiver. Freeze kept the source track open but stopped canvas updates: receiver cleared its video and displayed stale. Resume + Reconnect restored live. Browser screenshots retained above. Publisher/receiver stopped through their buttons, temporary browser tab closed, test server stopped with Ctrl-C. The stalled Playwright connector call was terminated; in-app browser supplied the actual evidence.

### Remaining acceptance limits

This completes this lane's software and real-browser synthetic transport work. It does not prove physical webcam/foreground cadence, actual face/physiology correctness, physical phone HTTPS/torch/accuracy, audible providers, or remote borrowed-laptop operation. Current auth intentionally restricts staff to the local station. Remote laptops need explicit authenticated device-role pairing, reachable trusted HTTPS, and network validation; do not expose the local station bootstrap publicly or label this transport remote-ready. Same-laptop tabs must keep Vision foreground/visible (e.g. separate visible windows); switching it into the background pauses its camera by design.

Main may now run the full integrated suite/build and take surgical ownership of these media files. No extra agents/chats/messages or external services were used.
