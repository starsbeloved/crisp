# Waiting Room — patient, nurse and operator experience blueprint

Date: 2026-10-24, America/New_York. Status: **Proposed UI revision for review. No application changes or external uploads authorized by this document.**

Read with [the approved product specification](../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md), [the self-check-in journey](../../superpowers/specs/2026-10-24-self-check-in-revision-design.md), and [the tool-neutral agent workflow](agentic-ui-workflow.md).

**Latest clarification:** the user wants this design usable by any coding agent, including Gemini, and explicitly requested local Git, a GitHub repository, and `main`, `dev`, `fix/ui` branches. Lovable is optional, not the required executor. The visual/behavior boundaries below apply to every agent. Repository setup is authorized; this UI proposal still awaits design review before implementation.

## 1. Brief and decision boundary

Build an interface a tired or anxious first-time visitor can understand without a technical explanation, and a staff workspace that answers: **who, where, what changed, and what can I do?** The prototype supports a human check, not diagnosis or medical triage.

The user requests fewer unnatural sentences, an original apple-fruit theme with Apple-like restraint, an explicit patient/nurse story, and a cost-conscious Lovable UI handoff. This document proposes the copy, component anatomy, interactions and rationale. It is not an exact transcript of every current runtime string and does not assert that proposed behavior is implemented.

Preserve: laptop face enrollment; three questions; one phone continuation for questions and contact pulse; camera recognition, rPPG, breathing and posture; live staff video; evidence-bound explanations and speech; acknowledge/check actions; honest incomplete states. Temperature remains excluded. No account/password flow is added. The page previously described as a login page is actually **self-check-in**.

Latest user interest in Lovable changes the proposed presentation owner only. It does not authorize database migration, publishing, credentials transfer, or rewriting sensing. Older plan statements saying no Lovable are historical for this new proposal; other product boundaries remain intact. Do not treat stale plan paragraphs about paused workers as live session status.

### Three approaches considered

| Approach | Benefit | Cost/risk | Decision |
| --- | --- | --- | --- |
| Simplify copy and restyle current components locally | Smallest integration risk | Uses Codex credits for visual iteration | Valid fallback |
| Lovable builds isolated presentation components; local code keeps behavior | Uses existing Lovable credits; clear review boundary | Needs a small typed handoff and integration pass | Recommended |
| Import the full app and use one shared Lovable engineering repository | Unified remote editor after migration | Framework/backend changes, privacy review, new repository and deployment assumptions | Not recommended for this UI task |

## 2. Source-grounded current-state audit

Source inspection on October 24; implementation is changing, so these are file-level observations, not a device-validation report. Paths below are relative to `apps/waiting-room/`.

| Surface/source | Observed issue or boundary | Proposed correction |
| --- | --- | --- |
| `client/App.tsx` | Launcher has two-line slogan and infrastructure caveats; gallery is separate; `/questionnaire` now mounts PatientPage | Launcher becomes operator workspace chooser; never the public arrival screen. Preserve existing routes initially |
| `client/check-in/CheckInPage.tsx` | Welcome includes journey, camera, limitations and laptop-topology paragraphs | Welcome carries one task and one sentence; move consent to consent, topology to setup |
| Same file + `vision/IdentitySetup.tsx` | Patient face step mounts model-loading/calibration instructions and a link to vision setup | Operator completes setup first; patient sees readiness or assistance, not model controls |
| `client/patient/QuestionnaireForm.tsx` | Form repeats AI/originals/unsaved language and can show multiple competing save actions | One primary action per state; optional summary has its own review state |
| `client/patient/PatientPage.tsx` | Phone receipt cannot verify in-memory laptop enrollment | Say “Check on the laptop”; never turn unknown into “Not scanned” or “Saved” |
| `client/phone/PhonePage.tsx` | Controller and presentation coexist; wording exposes capture clocks/engineering gates | Extract/retain presentation boundary; map known errors to useful patient instructions |
| `client/staff/StaffPage.tsx` | Connection screen has marketing-style heading; seat form is always present when a visit is selected | Concise connection state; seat editing behind an explicit edit action |
| `client/ui/dashboard/DashboardView.tsx` | Each reading renders many paragraphs plus trend and table | Summary first; details disclosure for history, retaining source, time and quality up front |
| `client/vision/VisionPage.tsx` | Track labels can expose raw visit IDs; setup/technical panels compete with the camera | Approved public labels in primary UI; technical IDs in diagnostics only |
| `client/media/StaffCamera.tsx`, `client/staff/VoiceControls.tsx` | Real media/voice controls are separate runtime components, now mounted by StaffPage | Preserve their effects; theme presentation without recreating transport/playback |
| Workspace | `git rev-parse --show-toplevel` reports not a Git repository | Do not use pasted `git add .`/push/merge instructions as if a repository exists |

Examples of current wording versus proposed wording:

| Current | Proposed | Reason |
| --- | --- | --- |
| “Welcome. Let’s get you checked in.” plus multiple paragraphs | “Check in” / “Start here, then answer three short questions.” | Clear destination without repeated explanation |
| “Preferred name or demo alias” | “Name (optional)” / “You can use a first name or nickname.” | No unfamiliar “alias”; preserves optionality |
| “Continue with identity unavailable” | “Continue without a face scan” | Describes the user's action, not an internal data state |
| “Take over questions on this screen” | “Answer here instead” | Keep technical editor-lease semantics in the confirmation dialog |
| “Finish with pulse unavailable” | “Finish without a pulse reading” | Natural wording without implying a measurement succeeded |
| “Open local staff view” | “Open dashboard” | Local service is infrastructure, not the nurse's task |
| “Prototype engineering gates passed; accuracy requires device verification.” | “Experimental estimate” with quality/time | Do not mistake an algorithm gate for a validated measurement |

## 3. Information architecture and physical setup

```text
Operator chooser (/station)
├── Check-in (/check-in): Welcome → About you/consent → Face scan → Phone handoff
│   └── No-phone alternative: Questions → Summary review (optional) → Pulse handoff/Finish
├── Room camera (/vision): Operator setup → Live camera + tracks + sensing states
└── Dashboard (/staff): Requests + small live camera + patient evidence + staff actions

Phone (/patient): Join → Confirm visit → Questions → Summary review (optional)
                 → Pulse → Review → Finished

Developer-only: /gallery and legacy /phone; /questionnaire remains a compatibility entry.
```

These are three laptop workspaces, not three mandatory browser tabs for the patient. Patient chrome exposes no staff navigation. The phone is a fourth responsive surface, not a downloadable app.

One laptop: check-in then monitoring use the webcam sequentially. The current Vision implementation stops capture when hidden; three ordinary tabs cannot guarantee a simultaneously live dashboard. During demonstration use a verified visible-window arrangement, or accept an explicit pause. UI styling cannot fix camera ownership or browser scheduling.

Three laptops later: check-in station, camera station, staff station. Shared records alone do not establish shared video or shared face enrollment. Network transport, station identity, enrollment distribution, HTTPS and permissions must be verified separately before calling that arrangement supported. Do not design a fake “All stations connected” badge.

## 4. User stories and success criteria

### Patient: first-time self-check-in

“I want to tell the clinic why I came, know what the camera will do, and finish without installing an app or repeating myself.”

1. See Check in immediately, not a product pitch or staff controls.
2. Start; enter an optional name and make a genuine camera-consent choice.
3. If consenting, explicitly start a laptop face scan and receive actionable framing feedback.
4. Scan a visit-specific QR, compare the same public visit label on both screens, and confirm it.
5. Answer three questions; optionally review/correct an AI summary. Originals remain intact.
6. Explicitly permit phone camera/flashlight, follow fingertip guidance, stop any time.
7. See whether the reading was saved, not just calculated. Review incomplete steps honestly.
8. Finish; see “You’re checked in” only after server confirmation. Public kiosk is reset before another visitor.

Success: one visit, no repeated answers, no automatic camera start, no data from another visitor, and no uncertainty about whether finishing succeeded. A skipped sensor allows check-in but does not count as complete scientific acquisition.

### Patient: needs assistance or cannot use a phone

“I want to continue even if I cannot scan a QR, use a camera, or understand an error.”

Get help remains in the same position. Answer here instead uses the kiosk. A designated phone can be paired explicitly for pulse; no phone still permits finish with the missing reading visible. Assistance is in person: the UI must not claim it paged staff. Changing editor retains committed answers but cannot promise transfer of unsaved text from another device.

### Nurse: locate and respond

“I want to see the person needing a check, their current location and the evidence, then record my response.”

Open dashboard → enable voice if wanted → review requests → select one → locate the matching current track in the small live view → inspect trigger evidence and relevant patient context → Acknowledge → check the person in the demonstration → Mark checked. Save failures keep the request visible. Neither action means “recovered.”

### Nurse: uncertainty and failure

“When the camera or identity is uncertain, I need the interface to show what is unknown instead of pointing me at the wrong person.”

A lost track removes the confident current highlight, not the saved request. Current location differs from assigned seat. Stale readings become historical. Provider failure leaves factual evidence/actions available. Muting never hides requests; late audio must not announce obsolete identity/location.

### Operator: prepare and explain the demo

“I need to prepare the devices and show what the system is actually observing without turning setup jargon into the patient experience.”

Connect service, prepare identity session/calibration, confirm camera/phone readiness, and start the consenting demonstration. Show the large camera illustration on Vision; show the same source in Dashboard. Diagnostic IDs, inference timing, model versions and calibration steps belong in setup/details. A pretty preview is not a passed device test.

## 5. Apple-fruit identity: purpose, restraint and tokens

### Why the apple

The user's proverb, “An apple a day keeps the doctor away,” supplies a familiar care association. Use that as internal brand inspiration, not a claim that the prototype prevents illness. The actual product asks people to seek a human check; the proverb would be misleading as its primary call to action.

Use an original **whole apple with a short stem and single leaf**, distinct from Apple's bitten silhouette. Keep the working name **Waiting Room** until the user chooses another. Do not invent a rebrand, Apple affiliation, or branded font download.

| Element | Design decision | Why |
| --- | --- | --- |
| Mark | Small 28–36px vector in header; optional larger mark on welcome/completion only | Recognition without wasting task space |
| Leaf green | Primary actions, selected navigation, brand mark | Warm identity; never “patient is healthy” |
| Apple red | At most a tiny decorative brand accent outside status regions | Avoid red branding competing with errors/check requests |
| Rounded panels | 18px panels, 12px controls; not every paragraph gets a card | Approachable but structured; avoids nested “card soup” |
| Typography | System font; calm sentence case; no giant slogan | Fast rendering, familiar controls, readable language |
| Motion | 100–150ms color/opacity feedback; reduced-motion disables it | Confirm interaction without competing with live sensing |
| Illustration | Small static fingertip-placement diagram with equivalent text | Explains physical action; not decorative filler |
| Data graphics | Real waveform and gapped trends only | Decorative pulses would misrepresent measurement |

Proposed tokens: canvas `#F5F5F7`, surface `#FFFFFF`, primary text `#1D1D1F`, secondary text `#5B5B62`, brand `#246B45`, subtle border `#D6D6DC`, focus `#175CD3`. Error/request/status pairs require measured contrast before shipping; these tokens are not proof of accessibility. A subtle panel divider need not be a form control's only visible boundary.

Spacing scale: 4/8/12/16/24/32/48 CSS px. Patient content width 560px, horizontal padding 24px desktop and 16px phone. Body 16px/1.5; patient H1 28–32px/1.2; section title 20px/1.3; metadata 14px/1.45; reading value 28px with tabular numerals. Use fluid heights. Controls target at least 44×44 CSS px as our usability choice, not a claim about the WCAG AA minimum.

Patient layout: header → compact step names → one main task → actions → small demo notice. Dashboard layout is intentionally denser; don't apply spacious marketing layout to evidence. Camera stage may be dark for contrast while all controls retain the light theme. No dark-mode project, GSAP, carousel, 3D fruit, confetti, decorative photos or animated health score.

## 6. Shared copy and interaction contract

All quoted strings below are **proposed exact English copy**. Braced tokens are runtime values, never hardcoded sample readings. Text not shown in a state must not remain invisibly focusable. Labels remain visible; placeholders never substitute for labels.

| Component | Content and behavior | Rationale |
| --- | --- | --- |
| Patient header | Mark + “Waiting Room”; secondary “Check-in”; “Get help” button | Stable orientation; no staff links |
| Brand mark | Decorative when adjacent to name; no mid-flow navigation action | Prevent accidental reload/session loss |
| Step list | “About you”, “Face scan”, “Questions”, “Pulse”, “Finish”; current step uses `aria-current="step"`; skipped step says “Skipped” | Names explain progress; don't show fake completion |
| Back | “Back”; stays within authorized session and preserves current draft | Predictable recovery, not browser-history roulette |
| Primary button | Verb + object when needed; busy label; semantic disabled during duplicate-sensitive request | Makes outcome legible; avoids double saves |
| Inline error | Problem + recovery beside field, linked by `aria-describedby` | Error belongs to the task it blocks |
| Error summary | “Check your answers” with links for multiple field errors; focus after failed submit | Keyboard/screen-reader recovery, not a toast only |
| Save state | “Saving…” → “Saved”; on unknown result “Save not confirmed. Try again.” | Network failure may follow a server commit; don't falsely say definitely lost |
| Status notice | One concise relevant status; reveal “Details” for diagnostics | Less repetition without hiding failures |
| Footer | “Demo prototype · Not for medical decisions” | Persistent limit without a paragraph on every page |
| Help dialog | “Need help?” / “Ask the person running this demo. This button does not send an alert.” / “Back to check-in” | Honest assistance; no fake nurse notification |
| Focus/dialog | Focus heading on deliberate step change; dialog traps focus, Escape closes, trigger regains focus | Changes remain understandable without a mouse |
| Live updates | Announce meaningful save/error/new-request changes politely; not every frame or BPM tick | Avoid drowning out the task or staff speech |

No raw exception strings, UUIDs, request IDs, clock-sync wording or provider stack traces in patient copy. Known error codes map to approved text; unknown errors say what action is safe and expose technical details only to the operator. User-entered text renders as text, never HTML/instructions.

## 7. Patient screen and component catalogue

### P01 — Welcome / `/check-in`

Purpose: make the first action unmistakable. No account creation.

Boxes: minimal shared header; centered main task; small demo footer. Do not put three introductory cards above the button.

- H1: “Check in”. Body: “Start here, then answer three short questions.”
- Primary: “Start check-in”; pending “Starting…”. Connect/resume safely; create no duplicate visit on repeated click.
- Secondary: shared “Get help”. No redundant second Help button.
- Failure: “Check-in is unavailable. Try again or ask for help.” Action “Try again”. Preserve a pending creation identifier in the controller.
- Welcome intentionally excludes model status, HTTPS, provider names, expected pulse duration and monitoring architecture. Those belong at the relevant action or in setup.

### P02 — About you and consent

Purpose: optional personal label and informed participation. Keep this together initially to match current behavior; splitting it into additional screens is not needed for brevity.

- H1: “About you”. Field “Name (optional)”; hint “You can use a first name or nickname.” Maximum 80 characters, as currently implemented.
- Consent heading “Camera monitoring”. Body: “With your permission, we’ll scan your face to help match you to this visit while you wait. Matching may be uncertain.”
- Unchecked checkbox: “I agree to face scanning and camera monitoring for this demo.”
- Main action “Agree and continue”; secondary “Continue without camera”. No implied penalty for declining. If unchecked main action submitted, error “Choose whether to use the camera, or continue without it.”
- Pending “Saving…”. Failure “We couldn’t confirm your check-in was saved. Try again.” Retry preserves original visit/consent operation; editing after uncertain submission must not silently create another visit.
- Back returns to welcome only when safe; leaving an existing visit requires the explicit end-session flow.

No unsupported claim that face data is anonymous, encrypted, deleted automatically, or permanently stored. Detailed data notice must reflect the actual session-scoped implementation and be checked before external use. A visual rewrite is not permission to change consent semantics.

### P03 — Face scan

Purpose: one consenting face linked to the existing visit.

Boxes: visit label; H1 “Look at the camera”; one preview with outline guide; live instruction; controls. Instruction “Keep your face in the frame.” Explain “The camera starts when you choose Start face scan.” only before start.

| State | Visible text | Actions/result |
| --- | --- | --- |
| Ready | “Ready when you are.” | Primary “Start face scan”; secondary “Continue without a face scan” |
| Permission prompt | “Allow camera access in your browser.” | “Cancel”; no fabricated preview |
| No face | “Move your face into the frame.” | “Stop scan” remains available |
| Multiple faces | “Only one person should be in the frame.” | No enrollment success |
| Poor capture | “Face the camera and hold still.” | Real reason may say “Move to better light.” when supported |
| Collecting | “Hold still…” | Real progress only; never a fake percentage |
| Saved | “Face scan saved” | Primary “Continue”; stop/release enrollment capture |
| Permission denied | “Camera access is blocked.” | “Try again”; “Continue without a face scan”; Help |
| Model/session not ready | “Face scanning is unavailable. Ask for help or continue without a scan.” | No model/calibration controls here |
| Declined consent | “You chose not to use the camera.” | “Continue”; no permission request |

Skipping is visibly incomplete, not a green checkmark. Session loss may invalidate enrollment later; receipt copy must distinguish scan captured then from recognition ready now. Operator setup is removed from this patient step only after setup has a reachable operator home.

### P04 — Phone handoff on laptop

Purpose: move questions and pulse together to the correct phone, with an accessible kiosk alternative.

Boxes: visit label; “Continue on your phone”; instruction “Scan this code to answer the questions and check your pulse.”; QR; plain-text HTTPS address + 8-digit code alternative; secondary action.

- Primary when no grant exists: “Show QR code” (current explicit pairing action retained). Display actual grant only after creation succeeds; no automatic grant churn on render.
- Under QR: “Or open {patientAddress} and enter {code}.” Use readable digits; don't put name/answers into visible URL text.
- Secondary: “Answer here instead”. Help includes “You can use the demo phone for the pulse reading.”
- Waiting status: “Waiting for your phone…”; connected status only after authoritative pairing readback. If current readback lacks that state, omit it rather than infer connection from code disappearance.
- Expired: “This code has expired.” If session may still be connected, append “Already connected? Continue on your phone.” Replacement action is explicit.
- No configured phone access: “Phone check-in is unavailable. You can answer here.” Operator Setup holds the trusted-HTTPS explanation.
- Replacement dialog: “Connect a different phone?” / “The previous phone will lose access. Any unfinished pulse reading will stop. Saved answers stay.” Actions “Connect another phone” / “Keep this phone”.
- Editor switch dialog when a phone owns questions: “Answer on this screen instead?” / “The phone will stop editing. Only saved answers will appear here; unsaved changes on the phone won’t transfer.” Actions “Answer here” / “Stay on phone”. This explicit confirmation is a proposed behavior refinement, not cosmetic only.

QR is not the sole means of access. Never mark “phone connected” merely because it has been displayed or scanned by an unrelated camera.

### P05 — Join and confirm on phone / `/patient`

- Code page H1 “Continue check-in”; label “Check-in code”; hint “Enter the 8-digit code from the laptop.” Numeric keyboard, paste allowed, leading zeros retained. Primary “Continue”; busy “Connecting…”.
- Valid QR can supply the code; do not force unnecessary retyping. Pairing logic still validates grant and does not expose answers before confirmation.
- Confirmation H1 “Is this your check-in?”; large `{visitLabel}`; body “Check that this matches the laptop.” Actions “Yes, continue” / “No, go back”. Only the safe visit label is needed, not full patient details.
- Used/expired code: “This code can’t be used. Ask for a new code at the check-in screen.” Never open a different visitor's session.
- Restorable existing session: resume it through server validation, not by reusing the consumed code.
- No camera prompt on either screen. Remove repeated “camera has not started” prose unless explaining a specific permission concern.

### P06 — Three questions / laptop or phone

Purpose: collect the agreed facts once. Recommended one short form, not three separate pages: two choices plus a text field do not need a lengthy wizard.

H1 “A few questions”. No introductory paragraph needed; labels explain the work.

| Component | Exact copy/options | Behavior and why |
| --- | --- | --- |
| Reason textarea | “What brings you here today?” | 500 characters; no diagnosis suggestions or prefilled symptoms |
| Character count | “{count}/500” | Adjacent quiet text, not live-announced on every keystroke; paste cannot silently truncate unnoticed |
| Onset choice | “When did this start?” — Today / Yesterday / Several days ago / Longer ago / Not sure | Native select initially, preserving current semantics/default; don't turn an unselected value into a new answer |
| Optional note | “Anything else about when it started? (optional)” | 200 characters, existing contract |
| Course choice | “How has it changed?” — Getting better / Staying the same / Getting worse / Comes and goes / Not applicable | Plain words, no severity/color inference |
| Primary | “Save answers” | Originals-only path; after server success proceed with saved status |
| Secondary | “Review an AI summary” | Explicit provider request; doesn't save or confirm generated content |
| Secondary | “Back” | Preserve local draft |

Reason error: “Tell us what brings you here.” Save uncertainty: “Save not confirmed. Your answers are still on this screen.” Action “Try saving again”. Do not claim unsaved text survives closing/reloading the browser unless implemented. Drop the repeated “not yet saved” paragraph before the user has done anything; show status when editing a previously saved form, saving, or an error occurs.

### P07 — Optional summary review

Purpose: preserve patient control over generated wording without turning the normal form into two competing save paths.

- Preparing status “Preparing a summary…” with “Cancel” returning to the original form. No full-screen blocked spinner.
- Review heading “Check this summary”; body “Edit anything that doesn’t match what you meant. Your original answers will also be saved.”
- Three editable fields: “Reason for visit”, “When it started”, “How it changed”. Values are returned, validated, unconfirmed summary fields; missing facts remain “Not mentioned”.
- Primary “Confirm and save”; secondary “Use original answers”; tertiary “Back to questions”. Confirm sets the explicit confirmation bit; original-only saves no unconfirmed summary.
- Failure “A summary isn’t available. You can save your answers without it.” Primary “Save original answers”.
- Editing source answers invalidates prior generated/confirmed proposal for this draft. Returning to summary may regenerate explicitly; don't silently bill a new provider request on render.
- Proposed separate visual state can be implemented within QuestionnaireForm; no new route/backend is required. Changing from the current inline block needs interaction tests.

### P08 — Saved answers / route choice

H1 “Answers saved”; visit label; primary “Continue to pulse”; secondary “Review answers”. Confirmed summary is available under “View summary”, not repeated in full by default. For kiosk fallback, primary becomes “Continue on a phone”, secondary “Finish without a pulse reading”. Do not label “Continue with original answers” when a confirmed summary was also saved.

### P09 — Phone pulse preparation

Purpose: explain the physical action and obtain capture consent immediately before it occurs.

- H1 “Check your pulse”; visit label stays visible.
- Static diagram + proposed instruction: “Place your fingertip gently over the rear camera lens, with the flashlight lighting your finger. Hold still without pressing hard.” Final lens-placement illustration must be checked on the actual phone; do not assume one diagram fits every camera/flash layout.
- Timing hint “Aim for about 30 seconds of usable signal.” Not a guaranteed countdown or total duration.
- Consent label “Use my camera and flashlight for this reading.” Unticked. Primary “Start measurement”. Secondary “Skip pulse reading”.
- Comfort note “Stop if your finger feels warm or uncomfortable.” Always visible before/during capture.
- Disclosure “How this works”: “This estimates pulse from fingertip video. It does not measure oxygen levels or diagnose illness.” Data handling statements must match implementation.
- No unsupported universal-phone promise. Device/browser/torch failures are capability-specific, not the patient's fault.

### P10 — Pulse acquisition, result and save

Boxes: compact real status; real local waveform with text equivalent; usable-progress indicator; immediate Stop; result/save state when eligible. No rotating apple loader pretending to be a pulse.

| State | Main copy | Actions and constraints |
| --- | --- | --- |
| Permission | “Allow camera access to start.” | “Stop”; release on cancel |
| Preparing | “Preparing the camera…” | “Stop”; clock sync remains operator detail |
| Collecting | “Hold still” / “{usableSeconds} of 30 usable seconds” | “Stop measurement” never hidden; progress uses accepted duration |
| Bad signal | “Adjust your finger and hold still.” or mapped supported reason | Progress can pause/reset truthfully; no plausible fake BPM |
| Timeout/interruption | “We couldn’t get a clear reading.” | “Try again” / “Continue without a reading” after capture release |
| Unsupported flash | “This browser can’t use the flashlight for this reading.” | “Use the demo phone” assistance instructions or skip; no automatic substitute |
| Processing | “Checking the reading…” | No saved badge yet |
| Unsaved result | “Pulse estimate: {bpm} bpm” + “Not saved” | “Try saving again”; “Discard reading” with confirmation |
| Saving | “Saving reading…” | Duplicate actions disabled; camera/torch already released |
| Saved | “Pulse reading saved” + `{bpm} bpm` + interval + “Experimental estimate” | “Review check-in”; optional new measurement as a new capture |
| Stopped | “Measurement stopped” | “Try again” / skip; don't submit partial result |

Discard dialog: “Discard this unsaved reading?” / “It won’t be added to your visit.” Actions “Discard reading” / “Keep reading”. Retrying save always uses the original capture, visit and timestamps. Starting again after discard must not secretly carry over a previous pulse. Live metrics and a historical saved reading must not occupy the same unlabeled numeric slot.

The current maximum-attempt rule (60 seconds) remains owned by the controller. UI simplifies its presentation, not its enforcement. Switching apps, ending session, interruption and errors stop camera/torch through existing lifecycle controls.

### P11 — Review and finish

H1 “Ready to finish?”; `{visitLabel}`; a simple three-row list, not three celebratory cards:

- “Answers” — “Saved” / “Not confirmed saved”.
- “Face scan” — “Saved for this session” only from valid receipt; “Not completed” when known; otherwise “Check on the laptop”.
- “Pulse reading” — “Saved” / “Not completed” / “Not confirmed saved” as supported by readback.

Body when incomplete: “You can finish with these steps incomplete.” Primary “Finish check-in”; secondary “Back”. Pending “Finishing…”; failure “Finish not confirmed. Try again.” No success transition before receipt matches visit. Unsaved pulse must be resolved by retry/discard first, not silently lost on Finish.

### P12 — Completion

H1 “You’re checked in”; body “Please take a seat”; `{visitLabel}`. Only genuine outstanding assistance produces an additional short note. Don't display a medical all-clear, score or green health badge.

Phone: no editable answers after finish; optional “View check-in status” only if safe readback exists—not a new proposed endpoint in this UI slice. Kiosk: primary “Done” calls verified reset/revocation, then returns to Welcome. A reset failure shows P15, not a new person's form. Small completion apple mark is sufficient; no confetti.

### P13 — Resume an unfinished visit

H1 “Continue check-in?”; safe `{visitLabel}`; “Continue only if this is your visit.” Actions “Continue this check-in” / “Start a different check-in”. The latter confirms ending/revoking the old session before allowing a new visit. Don't show previous answers merely to help the next visitor decide whose session it was.

### P14 — Inactivity and session ended

- Warning after current 120-second inactivity policy: “Need more time?” / “This screen will close in {remainingSeconds} seconds.” Button “Keep going”; 30-second warning, no every-second screen-reader announcements. Intentional capture/save work must not time out as inactivity.
- Ended H1 “This check-in has ended”; body “Ask for a new code at the check-in screen.” Button “Enter a new code”. Clear local patient display, stop capture, don't reopen answers with browser Back.
- Editor changed: “Questions are being answered on the other screen.” Saved data stays readable only as permitted; old editor cannot overwrite the new one. Explicit takeover returns through P04 confirmation.

### P15 — Reset failure / safe closed kiosk

H1 “Check-in is temporarily closed”; body “Ask for help before starting another check-in.” Action “Try closing again”; pending “Closing…”. Personal details stay cleared while server revocation is uncertain. No Start button until safe reset is confirmed. This is an essential safety state, not text to remove for cleanliness.

## 8. Operator surfaces and large Vision screen

### O01 — Workspace chooser / `/station`

H1 “Demo workspaces”; three links: “Patient check-in” / “Room camera” / “Staff dashboard”. Descriptions, respectively: “Start a visit.” / “View tracking and measurements.” / “Review requests and patient details.” Small “Demo setup” disclosure for readiness. No hero slogan. Developer gallery link belongs under tools, not patient navigation. No login or new authentication is invented.

### O02 — Setup (operator section, not patient step)

Sections: Service, Face matching, Camera, Phone connection, Speaker. Each shows its own actual status and one action; never a total readiness score derived from file existence.

- Service: “Not connected” / “Connecting…” / “Connected”; action “Connect”.
- Face matching: “Models not loaded” / “Loading…” / “Models loaded”; action “Load face models”. This does not activate camera.
- Calibration: heading “Set up face matching”; explicit consent for both volunteers; ordered “Capture first person” → “Capture same person again” → “Capture a different person”. Instructions disclose that the operator must follow the person order; system cannot prove compliance. Actions “Start calibration”, “Stop calibration”, appropriate step capture/retry. Failure never installs a default threshold.
- Recalibration warning: “This resets face matching for this session. Existing visitors will need a new face scan.” Require confirmation before destructive session invalidation; don't hide this in a tooltip.
- Session note: “Keep a station tab open. Closing all station tabs ends face matching for this session.” Display when relevant, no unsupported persistence claim.
- Phone: usable trusted address and readiness result or “Phone connection not configured”; diagnostics explain HTTPS and backend reachability. No credential fields or automatically created public tunnel in UI redesign.
- Details disclosure: model IDs, timings, session/source IDs, network errors, performance metrics. Do not claim “validated” because model loaded or calibration completed.

### V01 — Room camera / `/vision`

Story: a judge can see what the camera detects, while the operator can confirm the source is real and current. This is the same pipeline as the nurse's small view, not a staged second animation.

Desktop layout: compact header; large aspect-ratio-preserving video at approximately 70% available width; right rail with current people and selected track evidence. Setup collapses outside the main observation area once prepared. On narrow windows stack video then list; no clipped controls.

| Component | Copy/actions | Behavior |
| --- | --- | --- |
| Header | “Room camera”; “Start camera” / “Stop camera” | Explicit consenting start; Stop always available while active |
| Source badge | “Live”, “Starting…”, “Paused”, “Camera unavailable” | Driven by frame freshness, not merely service connection |
| Empty stage | “Camera is off” / “Start the camera when everyone in view has agreed.” | No canned background photo labeled live |
| Overlay | `{publicVisitLabel}` or “Unrecognized person” / “Identity uncertain” | Public label mapping; coordinates preserve crop/mirror transform |
| People list | “People in view”; each item label + observed region | Keyboard alternative to overlay selection; selected state not color-only |
| Selected track | “Current location”, “Face match”, “Posture”, “Camera pulse”, “Breathing” | Only supplied observations; per-channel quality/time; adding existing data to this surface requires a verified adapter |
| No person | “No person detected” only if detector actually reports that | When detector unavailable, say “Tracking unavailable” instead |
| Status note | “Keep this camera window visible while monitoring.” | Important current runtime restriction; not hidden in help |
| Details | “Camera details” | Resolution, frame timing, technical IDs and model diagnostics |

Do not expose full names/symptoms in a judge-facing overlay by default. No arbitrary bounding boxes, decorative skeletons, fabricated ROI or confidence percentage. Only render landmarks/regions actually provided by the runtime. Selecting a person does not create identity. Uncertain matching never borrows the last-selected patient's record.

## 9. Nurse dashboard component catalogue

### N01 — Connect and empty dashboard / `/staff`

Before connection: H1 “Staff dashboard”; one sentence “Connect to view visits and check requests.” Button “Open dashboard”; pending “Connecting…”; failure “Can’t connect. Try again.” No marketing hero. This is a supervised local staff entry, not proof of hospital-grade access control.

After connection: show the real empty dashboard, not fake sample patients. Empty queue “No check requests”; empty patient list “No check-ins yet”; patient detail “Select a patient or request”; camera has its independent stopped/unavailable state. “No requests” never means “Everyone is safe”.

### N02 — Desktop layout and hierarchy

At 1280×800: compact app bar; three named regions with approximately 16px gutters/gaps. Left: room camera + patients. Middle: open requests/actions. Right: selected patient/evidence. Video, selected request reason/actions, and patient identity/location must be visible together. Wider screens expand evidence, not typography to hero size.

Below 1100px: two columns, detail below. Below 760px: stack Requests → Room view → Patient details; add a “View person” anchor/action on the selected request to bring the camera region into view deliberately. This narrow-layout order is a proposed improvement over the older camera-first plan and requires review. Keep DOM and keyboard order consistent with the visible order. Never auto-scroll on polling.

### N03 — App bar and audio

Title “Waiting Room”; section “Staff dashboard”; actual service status “Connected” / “Connection lost”. Operator links “Room camera” and “Setup” are not patient links.

Audio group: “Enable voice” initially; after enabled “Mute voice” / “Unmute voice”; “Test speaker”. Pending “Enabling…” or “Testing…”. Small state “Voice off” / “Voice on” / “Muted”. Detailed provider/playback failures expand under “Audio details”, but a current failure badge remains visible. No large explanatory audio card permanently taking the top third of the dashboard.

Test speaker plays only the existing local test tone; label it accordingly in its accessible description. It does not prove ElevenLabs works. Do not add “Replay announcement” because replay conflicts with deduplication requirements. Muted/stale/acknowledged notifications are not replayed later automatically. Missing voice does not disable Acknowledge/Mark checked.

### N04 — Small room camera and patient list

Heading “Room view”. Display same source as Vision with its own freshness state. At no fresh frames: clear frozen imagery, label “Video paused” or “Video unavailable”, action “Reconnect video” where supported; “Open room camera” for source management. The staff component must not acquire a second webcam.

Selection highlight uses a high-contrast outline and label plus corresponding selected list item. Unverified selection text: “No current match for this patient.” Keep the patient's saved details selected; do not switch to a visually nearby person.

List heading “Patients”; row `{visitLabel}`, current region or “Location uncertain”, identity status. Assigned seat is not the row's current location. Selecting a row invokes exact visit-ID callback. Text truncation must not hide distinguishing labels; wrap instead or expose the full name accessibly.

### N05 — Check request card

Purpose: immediate action, not AI narration first.

Anatomy in order: “Check requested” → public patient label or identity uncertainty → “Current location: {verifiedLocation}” → “Sustained change in seated posture” → “Observed for {duration} · Requested {time}” → actions. Use the detector's supplied duration/time; no UI threshold computation.

- “View person” selects this exact request and its valid current track. If no verified track exists, it selects the request and shows uncertainty, without highlighting another person.
- “Acknowledge” persists responsibility state; pending “Saving…”. Failure “Acknowledgement not confirmed. Try again.” No premature handled state.
- “Mark checked” persists completed staff check; pending “Saving…”. Failure “Check not confirmed saved. Try again.” This is not a recovery/health label.
- Acknowledged card says “Acknowledged”; keeps Mark checked available according to supplied permissions. Checked card says “Checked” and remains in “Checked requests” disclosure/history.
- Disable actions from passed eligibility/pending state; never reconstruct eligibility from color or wording.
- Preserve selection and focus when request updates. Don't reorder focused cards beneath the pointer on every poll. Current open-request ordering comes from the controller.

### N06 — Explanation and evidence

Detector reason always visible before providers complete. Beneath it:

- “Explanation” with “Preparing…” / validated text / “AI explanation unavailable”.
- Factual fallback label “Recorded observation”, not “Gemini explanation”.
- “Evidence” disclosure contains triggering facts, method, measurement interval, source and quality. Trigger evidence is immutable; current patient values can differ.
- “Announcement” compact status “Queued”, “Playing”, “Played”, “Muted”, “Unavailable”, or “Out of date” from validated runtime status.

Never generate a diagnosis in the view. Patient-reported symptoms remain “Reported”; missing readings stay missing; stale explanations/audio are discarded or clearly historical according to runtime authority. Provider failure cannot remove the card.

### N07 — Patient details and optional seat

Top: `{visitLabel}`, verified identity state, **Current location**. Separate line **Assigned seat** with its assignment time when present; explicit mismatch text when required. “Edit assigned seat” reveals input and “Save seat” / “Cancel”; blank value means clear assignment, explained locally. Saving changes no recognition or current location.

Then: Posture/activity → three separate measurement summaries → Patient report → optional histories/details. No ubiquitous green badge, clinical rank, “risk index”, fever tile, oxygen tile or invented normal range.

### N08 — Measurement summary

One shared visual component, supplied data semantics. Labels:

1. “Phone pulse” — historical contact reading with actual interval; never “Live”.
2. “Camera pulse” — current usable rPPG or honest acquisition state.
3. “Breathing” — independent camera estimate, breaths/min.

Always visible: label, value/unit **or state**, quality/experimental indicator, source and time. Do not display `0 bpm` for missing data. Use “Collecting”, “Low signal”, “Unavailable”, “Out of date” as appropriate; older value appears only in explicitly dated history. For a failure show one concise reason; “Details” reveals full quality explanation.

Trend: separate methods, actual timestamps and gaps; don't interpolate rejected windows. Accessible table under “Recent readings” provides time/value/quality. Never render a fabricated flat line to fill an empty chart. Current posture can trigger a check even if pulse is unchanged; the UI must not manufacture agreement among channels.

### N09 — Patient report

Heading “Patient report”; confirmed AI summary labeled “Reviewed summary”; original answers accessible under “Original answers”. If no confirmed summary, show originals directly. No summary says “No answers saved” unless actually absent; provider failure is different from missing answers. Keep original content escaped and bound to the selected visit; do not speak symptoms/names aloud.

### N10 — Service and historical states

Connection loss produces persistent “Connection lost — showing saved information”, suppresses misleading current labels, and preserves requests. Camera stopped does not imply backend disconnected. Unknown identity does not imply pulse sensor broken. Audio failure does not imply request failed. Keep these distinct rather than one global red status card.

Checked history stays reachable but secondary. Developer fixtures are always labeled “Synthetic preview — no live measurements” and never mounted as fallback when the service fails.

## 10. Accessibility, privacy and acceptance

These are test targets, not a certification claim. UI/UX Pro Max's initial generated marketing/neumorphic direction did not fit this task and was rejected; its focused web error-summary guidance informs retained-answer and focus behavior.

- Use semantic headings/forms/fieldsets/buttons, visible labels and meaningful accessible names. No clickable div standing in for a button.
- Verify normal text contrast ≥4.5:1; meaningful non-text boundaries/indicators ≥3:1 where applicable. Test actual rendered pairs, not just palette names.
- Our target is 44×44 CSS-pixel interactive areas. WCAG 2.2 AA minimum target-size rule is 24×24 with specified exceptions; don't conflate the two. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Test at 320, 390, 768 and 1280 CSS-pixel widths, 200% text zoom and reflow equivalent to 400% on a 1280px viewport. No two-dimensional page scrolling for ordinary content; necessary video/graph exceptions do not excuse clipped labels/actions. [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Keep Stop reachable during mobile capture, including landscape and visible keyboard; respect safe areas. Fixed action bars cannot cover fields/focus.
- Keyboard complete both journeys; test VoiceOver labels, selected states, errors, dialog focus and status announcements. No continuous frame-by-frame announcements.
- No forced animation, flashing requests, faux waveform, auto-advancing forms, timed toast-only errors, or timeout without warning/extension.
- Help, declining camera and no-phone fallback are first-class paths, not concealed links. No language picker until translated copy and its behavior are actually supplied.
- Shared device resets protect the next patient. Removing staff links is not an authorization boundary. Don't expose saved questionnaire/face data through back-navigation.

### Required walkthroughs after implementation

| ID | Scenario | Evidence required |
| --- | --- | --- |
| UX01 | Welcome → consent → face → phone → questions → real pulse → completion → staff | Same visit throughout; saved readback; actual device evidence separately |
| UX02 | No phone; consent declined; failed/unsupported pulse | Complete without fabricated data; missing capabilities visible |
| UX03 | Wrong code, expired code, two phones, editor takeover, old phone returns | No data crossing; clear recovery; no unsaved-answer transfer promise |
| UX04 | Network fails after save/finish/action request | No duplicate operation or false success; same-operation retry |
| UX05 | Patient reloads/backs after finish; kiosk reset fails | No old answers exposed; no new visitor until safe reset |
| UX06 | Select request → identify current person → acknowledge → checked | Correct visit/track/action; history survives readback |
| UX07 | Person moves or identity becomes uncertain before voice | No obsolete location/identity speech or wrong-person highlight |
| UX08 | Vision hidden/frozen; providers fail; pulse remains unchanged during slump | Honest individual statuses; visible request/actions still usable |
| UX09 | Keyboard, VoiceOver, zoom, small/landscape phone, reduced motion | No blocked action, lost focus, clipped Stop or color-only state |
| UX10 | Short novice walkthrough without coaching | Record task errors and hesitations; adjust copy based on observation, not assumed accessibility |

Proposed usability targets: first-time visitor finds Start within 5 seconds; staff can identify who/where/reason within 10 seconds for a prepared fixture. These are targets to measure, not measured results or clinical thresholds. Do not sacrifice consent reading or error clarity to achieve them.

## 11. Changes needing approval versus preserved implementation

Preserved product spec: all scientific channels, identity uncertainty, same-visit binding, request lifecycle, provenance, consent, no temperature and no diagnosis. Cosmetic copy/spacing/theme changes do not change these.

Proposed implementation/UX changes: move operator setup out of patient flow; isolate presentation components; separate optional summary review visually; explicit editor takeover confirmation; brand no longer navigates mid-session; narrow dashboard prioritizes request queue; hide seat edit/history/diagnostics behind purposeful controls. These need tests, not a new scientific spec.

External workflow change: optional Lovable presentation work is newly requested, but the exact sanitized files and any account connection/upload still require user review. Full migration, cloud video, new clinical semantics and three-laptop readiness remain outside this design's authorization.

Review these decisions first: P02 consent copy, P04 phone-first versus assisted path, P07 optional summary, N02 dashboard arrangement, and the restrained apple identity. After approval, execute the companion plan one screen family at a time.
