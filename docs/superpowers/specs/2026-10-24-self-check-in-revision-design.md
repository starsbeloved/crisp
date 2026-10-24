# Patient and nurse journeys with Apple-inspired UI — revision proposal

Date: 2026-10-24. Status: **Design proposal for user review; not implementation authorization.**

Read with the [approved original specification](2026-10-24-waiting-room-monitor-design.md). This document revises the patient interaction and appearance, not the scientific claims. Temperature removal and Codex-only development are already explicitly requested. The detailed flow below is the recommended design, not an assertion that it exists.

## Intent and confirmed constraints

A person should be able to approach a check-in laptop, understand the process without a technical explanation, and connect their answers, face enrollment and phone pulse reading to one visit. Staff must later see evidence for that same visit. Assistance remains available: inability to use a phone or consent to face capture must not be presented as inability to receive care.

- Codex/GPT owns every implementation surface; no Lovable or Antigravity handoff.
- Apple-inspired clarity with an original apple-fruit identity, not Apple's logo or an affiliation claim.
- No temperature input, card, default, simulated scenario, provider fact or spoken value.
- One laptop and the existing iPhone 13 Pro Max are the confirmed setup. Other phones may try the web flow; their PPG compatibility is not guaranteed.
- Required scientific layers remain face identity, phone PPG, facial rPPG, breathing and posture/activity. Missing data is honest; the prototype does not diagnose illness.

## Patient user story

“As a patient arriving at the clinic, I want to check in at a clearly marked station, answer three short questions, and complete a guided pulse measurement, so staff can connect my information to my visit without asking me to install an app or repeat my answers.”

### Recommended happy path

| Step / device | What the patient sees and does | Required system result |
| --- | --- | --- |
| 1. Welcome / laptop | “Welcome. Let's get you checked in.” Buttons **Start check-in** and **I need help**. A visible prototype notice explains that this is not medical triage. | Start creates one visit idempotently. The patient cannot open the staff dashboard or previous patients' records. |
| 2. About you / laptop | Enter a preferred name or demo alias. Explain camera monitoring and local face matching in plain language; choose **Agree and continue** or **Ask for assistance**. | Keep an opaque visit ID and public label such as Patient 014. A name is never the identity key or proof of face identity. No face processing before consent. |
| 3. Face scan / laptop | “Look at the camera.” One clear preview with framing guidance. Show “Move into view,” “Only one person in frame,” or “Face scan saved” according to the actual result. | Enroll one usable face under this visit. Multiple faces, denial or failed capture cannot advance as successful enrollment. Offer retry or assistance. |
| 4. Continue / laptop → phone | “Continue on your phone” with a visit-specific QR, short visit label and alternative **Use this screen for questions**. The phone opens a trusted HTTPS page, shows the same label, and asks **Is this your check-in?** | One short-lived, single-use pairing grant creates a visit-scoped patient session. No name/answers/raw visit credentials in the visible QR text. Never pair to the nearest face or currently selected staff row. |
| 5. Three questions / phone by default | What brings you here? When did it start? How has it changed? **Back** retains answers. The original answer limits/options remain unchanged. A Gemini summary can be reviewed/corrected; a visible **Continue with original answers** path works if generation fails. | Save original answers and any explicitly confirmed summary to the same visit. Show saving/saved/failure. The questionnaire itself never requests phone camera access. |
| 6. Pulse / phone | Show a short fingertip placement illustration, explain camera/flashlight access, then **Start measurement**. After capability checks, guide the user to the correct rear lens. Show the real trace, usable-duration progress and always-available **Stop**. | Aim for approximately 30 usable seconds, not a promised 30-second total visit. Retain existing capture safety/time limits. Stop torch/stream on completion, cancellation, interruption or session loss. |
| 7. Save and finish / phone + laptop | “Pulse measurement saved” only after server confirmation. Final screen shows the visit label, answers saved, face enrollment state, and pulse saved/unavailable. **Finish check-in** is distinct from a medical assessment. | Reading interval, method, provenance and quality stay attached to the original visit. Failed transport stays unsaved with same-capture retry. Finish closes patient edit authority and invalidates pairing grants. |
| 8. Waiting area / laptop station | “You're checked in. Please take a seat.” Clear the public check-in screen for the next person. In the one-laptop demo, the operator switches to staff monitoring. | The camera starts fresh room-monitoring windows and associates the enrolled person with the visit. Current location stays distinct from any assigned seat. No automatic “healthy/safe” conclusion. |

### Why this route

Recommended: laptop consent/name/face enrollment, then one phone continuation for questions and PPG. This keeps the phone interaction together and avoids public questionnaire answers staying on the kiosk.

Alternative: all questions on the laptop, QR only for PPG. This is the simplest fallback and uses much of the current split-session design, but ties up the kiosk longer. Fully phone-only check-in is not selected because the approved face enrollment uses the laptop camera. The proposal supports the laptop question fallback without making users answer twice.

## Nurse user story

“As the nurse responsible for the waiting area, I want to see who may need someone to check on them, where they are now, and what observations led to the request, so I can find the right person and respond without treating an uncertain camera estimate as a diagnosis.”

| Step | What the nurse sees and does | Required system result |
| --- | --- | --- |
| 1. Open monitoring | Open the staff-only view, enable monitoring and optionally enable voice once. See actual camera/model/connection status. | Show real local video with aligned track/visit overlays. A stopped stream says stopped/stale; no silently looped recording. |
| 2. Review patients | Select a visit or identified track. Inspect questionnaire, contact pulse interval, current camera pulse/breathing, posture/activity and quality. | Resolve to the same visit/current valid track. Historical pulse is not live; missing/unchanged values stay missing/unchanged. Current observed location and assigned seat are separate. |
| 3. Notice a change | See **Check requested**, patient/location or uncertainty, creation time, duration and detector reason. | A qualifying sustained posture change creates the visible request before Gemini/speech. Brief adjustments do not. No disease label or automated urgency score. |
| 4. Understand and locate | Select the request, inspect its evidence and find the highlighted person in live video. Read the Gemini explanation when available. | Preserve immutable trigger evidence separately from current readings. Never select/highlight a different person to hide uncertainty. |
| 5. Hear the notification | If enabled, hear one concise validated announcement. | Gemini explains supplied facts; ElevenLabs speaks validated text. Fallback/failure stays visible. Delayed content cannot announce a superseded identity/location or acknowledged request. |
| 6. Acknowledge | Press **Acknowledge** when taking responsibility, then go check the person. | Persist once; show pending/error/retry and retain after reload. Suppress queued obsolete speech. Acknowledged does not mean checked or recovered. |
| 7. Mark checked | After the in-person check, press **Mark checked**; request moves to history. | Preserve the action/evidence and require a fresh reference/rearm cycle. Do not immediately repeat the same request or call the patient medically recovered. |

### Nurse exceptions

- Ambiguous identity retains visible unassigned track/location context without borrowing another visit's answers/readings. Staff may check visually; this does not count as automatic identity success.
- Movement while AI/audio is pending invalidates obsolete location text/audio. Assigned seat alone is never spoken as current location.
- Camera/model/provider failure exposes the affected capability while preserving saved requests and staff actions. Provider latency never blocks the visible request.
- Failed action save retains the request with retry, not a false handled state. Repeated clicks do not duplicate actions.
- One-laptop check-in pauses monitoring visibly; returning starts fresh windows. No claim of an uninterrupted second nurse screen.
- Multi-nurse assignment, remote push notifications, diagnosis, emergency prediction and automated clinical triage are not added. The demo has one staff operator and a human check.

## Exceptions are part of the patient journey

| Situation | Patient experience / system rule |
| --- | --- |
| No phone, cannot scan QR, or needs help | Answer on the laptop, then use the designated verified phone with explicit visit confirmation. The demo operator assists; “I need help” must not falsely claim a notification was sent. |
| Camera consent declined / enrollment failed | Retain a visit with visible incomplete enrollment and offer assistance. Do not invent a match or claim this completes automatic identity acceptance. |
| Unsupported torch/camera or unusable pulse | Keep answers saved. Retry or use the verified demo phone. If skipped, finish the visit with pulse unavailable and visible incomplete measurement status. This does not pass phone-acquisition acceptance. |
| User feels uncomfortable / phone becomes warm | Immediate Stop; release camera and torch. No pressure to complete a capture. |
| Two people scan the QR | First valid confirmed pairing consumes the grant. A second claimant gets an expired/already-used state, not access to the first person's answers. Re-pairing requires an explicit station action. |
| Old phone returns after next patient starts | Old session cannot read or write the new visit. A late reading remains bound to its original capture/visit or is rejected. |
| Connection fails after a save | Idempotent retry and readback must show what the server actually committed; no duplicate visit or pulse measurement. |
| Laptop and phone both edit answers | A single active questionnaire editor lease belongs to the paired phone or kiosk. Switching requires explicit takeover; reject late saves from the previous editor instead of silently overwriting answers. |
| Patient abandons kiosk | Warn before clearing the visible form, offer more time, then revoke local editing authority and return to Welcome. Preserve committed records; don't permanently delete them as timeout cleanup. Proposed timeout: 120 seconds of inactivity plus a 30-second warning; suspend while an intentional capture/save is in progress. |
| Completed session is reopened | Show “This check-in has ended.” No answers, face data or editable form from browser back/reload. A further pulse recheck needs a new explicitly authorized session. |

## One-laptop honesty and privacy

The first demo is sequential: enrollment/check-in, then seated monitoring. A single shared webcam cannot simultaneously be pointed at a new arrival and guarantee uninterrupted observation of the waiting patient. Mode changes must visibly pause monitoring and reset affected windows.

The patient-facing station must not expose room records, staff controls, audio history or another patient's data through its UI. A hidden navigation link is not authorization. Before implementation, freeze the patient/kiosk/staff permissions, staff unlock/re-entry, completion, takeover and expiry contracts. On one physical computer, a supervised kiosk is a demo boundary, not a claim of hardened unattended hospital deployment. Two stations are future scope, not a current purchase or requirement.

## One QR, one patient session — contract intent

Current code has separate `ppg` and `questionnaire` roles, and joining a new role replaces the prior session. Do not solve this by granting a phone `station` authority or by changing a label alone.

The proposed patient session may read its own safe visit summary, save its own questionnaire while holding the editor lease, and create/complete/cancel its own pulse capture. It cannot list visits, read room video, modify face bindings, assign seats, operate providers or acknowledge staff requests. Completion/re-pair/restart/expiry revokes it. Immutable capture IDs, original time mapping and idempotent completion survive the interface migration.

Preferred-name storage, session role, consent state, editor lease, visit completion and safe public readback are new contract requirements. The implementation plan must freeze their exact types, routes, validation and ownership before these changes are coded. Reuse the current DSP, camera lifecycle, clocks and persistence; do not restart the application.

## Apple-inspired, original apple-fruit visual direction

Reading this as: a calm, accessible patient check-in and evidence-focused staff workspace, with Apple-inspired restraint and a small original apple-fruit identity.

- Light neutral canvas, crisp dark type, softly rounded surfaces and controls; no glossy decoration behind essential text.
- System font stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif). No downloaded Apple font or new UI framework is required.
- Proposed colors: canvas `#F5F5F7`, surface `#FFFFFF`, text `#1D1D1F`, secondary text `#5B5B62`, leaf-green brand accent `#246B45`. Amber/red are reserved for labeled system/request states, not inferred disease severity. Green never means medically safe.
- Original apple-fruit mark with a leaf, visually distinct from Apple's bitten-apple logo. Branding stays in welcome/header/completion, not inside waveforms or every data tile. The apple proverb is a theme, not a medical promise.
- Patient flow: one clear heading, one main task and one primary action per screen; Back and Help remain easy to find. Use real step names, not marketing sections.
- Staff flow: live video, open request reason/actions and selected visit evidence visible together. Retain source, time, quality and uncertainty even if they make a screen less minimal.
- Proposed sizing: 16px body text, 24–32px patient headings, controls at least 44×44 CSS px, 12px control radius and 18px panel radius. Final rendered contrast and sizing must be measured.
- Only brief state-feedback transitions, disabled under reduced motion. No GSAP, pinned scrolling, cinematic marketing sections or decorative animated signals.
- Inline field errors plus a focusable linked error summary on failed submit; keep entered values. Keyboard, screen reader, 200% zoom and small-phone layouts are acceptance cases.

UI/UX Pro Max informs the accessible form/error behavior. The marketing-first layout/animation prescriptions in gpt-taste and design-taste-frontend do not apply to this clinical workflow; their generic clarity/alignment goals do not override evidence visibility or accessibility.

## Device/network gates, not promises

A browser-trusted HTTPS site is shared by all visiting phones; it does not require a separate certificate installation per judge. A public patient-only gateway is a proposed deployment choice, not permission to deploy. The backend must actually be reachable through that gateway; a hosted frontend cannot call the laptop's `localhost` from a phone. Keep staff/bootstrap/room endpoints private and test the boundary.

iPhone 13 Pro Max is the designated candidate, not yet a validated PPG device for this app. Verify the actual iOS/browser, selected rear lens, continuous torch, decoded frame cadence, real fingertip signal, stop behavior and automatic same-visit save. Other phones get capability detection and honest fallback, not universal compatibility claims.

Primary platform context: [W3C camera access](https://www.w3.org/TR/mediacapture-streams/), [W3C image capture constraints](https://www.w3.org/TR/image-capture/), [WebKit torch support issue](https://bugs.webkit.org/show_bug.cgi?id=243075), [Safari 17.5 torch fix](https://webkit.org/blog/15383/webkit-features-in-safari-17-5/), [Apple device specifications](https://support.apple.com/en-us/111870), [browser-trusted certificates](https://letsencrypt.org/how-it-works/). These establish platform feasibility, not success of our implementation.

## Acceptance stories for the revised journey

1. A fresh visitor creates one visit, consents, enrolls, scans the QR, answers the questions, records a real usable pulse and sees server-confirmed completion on both devices. Staff later selects that exact visit/track.
2. A visitor without a phone completes questions on the laptop and uses the designated phone without retyping answers or borrowing the prior person's visit.
3. Denied camera, unavailable torch and rejected signal leave the visit saved but the relevant capability visibly incomplete; no placeholder pulse or fake success.
4. Two visits and two browser sessions cannot exchange answers, captures or final receipts; used/expired grants and late saves are rejected.
5. Phone-to-kiosk takeover preserves the last committed answers; an old editor cannot overwrite them. Completion, restart and inactivity end editing without exposing the previous patient to the next.
6. No active screen, payload, provider prompt or spoken announcement contains system-generated temperature. Historical artifacts remain preserved and are not mounted as current demo UI.
7. Finish check-in and switch to monitoring on the actual one-laptop setup; prove camera ownership, visible pause/resume, fresh references and no leaked public patient data.
8. Complete the flow by keyboard and at 200% zoom; test phone layout, permission failure, field errors, Back, Help, reduced motion and visible saved/unsaved states.
9. Nurse selects the newly checked-in visit in live monitoring; original answers, contact measurement interval and currently verified track match that patient. No substitution based on the last-selected row.
10. Brief adjustment produces no request; qualifying sustained change produces one. Nurse selects it, locates the person, acknowledges, performs the demo in-person check and marks checked. Reload preserves actions; rearm requires a fresh reference.
11. Move the person or make identity ambiguous while Gemini/audio is pending: no stale confident location/wrong identity is spoken. Mute/retry cannot duplicate speech. Provider failure does not prevent nurse actions.
12. Stop the camera and fail an action save separately: expose stale sensing while preserving requests; expose an unsaved action instead of hiding the request. Test the real rendered dashboard, not only store mocks.

Passing mocked browser tests establishes software behavior only. Real face association, phone PPG, rPPG, breathing and speech still require their original device/provider evidence. Review this proposed flow before writing the replacement interface contracts or resuming implementation.
