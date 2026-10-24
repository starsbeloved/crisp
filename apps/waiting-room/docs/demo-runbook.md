# Local demo runbook

This is a supervised prototype supporting a human check. Software verification and real-device acceptance are separate; consult the final integration evidence for what has actually been tested.

## Start the laptop

From `apps/waiting-room`, run `npm run dev`. The operator UI is at `http://127.0.0.1:5173/`; the API listens only on loopback port 8787 and retains structured records in `.local/data/waiting-room.sqlite`. Do not start a second API on the same port. Restarting the API resets transient sessions; saved visits and requests remain.

Use the launcher's operator links and browser Back/Forward within the app. Local navigation keeps the face-session document alive. A full reload, closing the last face-session document, or a service/session restart can require calibration/enrollment again. No biometric descriptor is persisted in SQLite, localStorage or a file. Keep the station open for the session.

## Prepare identity, then check in

1. Open Room vision and connect the local station. This loads the local pose worker and synchronizes source time; it does not request camera permission.
2. Connect the local face model in Identity setup. Its pinned local weights are checked before use. Failed loading stays unavailable.
3. With explicit consent, collect the required reference/genuine and separate unknown-person calibration samples through the setup UI. No arbitrary similarity threshold is substituted. Calibration needs a consenting second person for unknown samples; it is not accuracy validation.
4. Stop the calibration camera. Navigate through the app to Check-in. Start one visit, record the person's consent and enroll their face using the explicit scan action. Declined/failed enrollment remains visibly incomplete.
5. Use the visit's phone continuation or laptop questions. Preserve original answers. AI summary review is optional; only explicit confirmation saves it. Provider failure leaves original-only saving usable.
6. Finish check-in, then return through browser Back/the launcher to Room vision. Start a fresh room camera and seated reference. Do not reload the document merely to switch views.

## Phone connection

Follow [phone HTTPS configuration](phone-https.md). An actual trusted, phone-accessible hostname/certificate must be supplied and verified; local configuration cannot establish trust or prove phone reachability. Export the same `WR_PHONE_ORIGIN` in the API/operator and phone-mode processes. Loopback phone origins are rejected. The QR opens one visit-scoped `/patient` continuation for both questions and PPG.

Confirm the visit label, then separately consent to rear-camera/flashlight acquisition. Aim for about 30 usable seconds. Stop for discomfort, warmth, interruption or unusable signal. The phone automatically submits only its real accepted result to the original capture/visit. A failed save stays unsaved with same-capture retry. Completion alone does not prove pulse acquisition. No SpO₂, blood pressure or temperature is produced.

## Monitor and respond

Open the staff dashboard in a separate visible same-origin window if it must show the Vision stream concurrently. Vision must remain visible; hiding its tab pauses capture. Staff never opens another camera. Direct WebRTC sharing uses authenticated transient local signaling without a cloud relay. This does not configure a separate remote laptop.

Select a visit or request to inspect its current track, original report, historical phone pulse and independent camera estimates. The optional assigned seat remains separate from observed location. A frozen feed is cleared, and missing readings stay unavailable.

A brief posture adjustment should clear. A qualifying continuous 10-second seated slump after a usable 10-second reference creates one request. Acknowledge when taking responsibility; mark checked only after the demo in-person check. A fresh reference is required to rearm. These are engineering demonstration conditions, not medical thresholds.

## Providers and browser voice

Providers default to disabled even when key variables exist. No key goes into the browser. After separately authorized provider setup, configure server-side:

- Gemini: `WR_ENABLE_GEMINI=true`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
- ElevenLabs: `WR_ENABLE_ELEVENLABS=true`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`.

Use an explicitly selected supported model/authorized voice. Never paste credentials into chat or logs. The request appears before provider work. Generated notification text must pass evidence validation; Gemini failure uses a labeled factual template. Speech failure stays visible and does not dismiss a request.

Enable voice once in the visible staff tab. Existing requests and requests observed while voice is off/muted are not replayed as a backlog. Acknowledgement, checking, changed identity/location, source loss or hiding the tab cancels obsolete work. The speaker-test button uses a local tone and makes no provider request. Real Gemini/ElevenLabs acceptance still requires authorized synthetic calls and actual audible browser verification.

## Repeatable synthetic browser fixture

Run `npm run build`, then `node scripts/browser-fixture.mjs`. Open `http://127.0.0.1:8791/staff`. The amber banner identifies mocked evidence/providers and local silent audio. Open the staff view, enable voice, then use **Create synthetic check request**. Verify `played`, acknowledge and mark checked. This fixture uses the real dashboard, browser audio player and provider service with injected synthesis; it cannot establish real speech, camera acquisition or scientific accuracy. Stop its local process after the test.

The production UI and fixture use separate origins. Fixture patient labels/readings are invented; no real patient information belongs in the fixture.
