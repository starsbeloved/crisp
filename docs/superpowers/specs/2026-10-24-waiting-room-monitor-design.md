# Waiting Room Monitor — Design Specification

Date: 2026-10-24  
Status: Original design approved 2026-10-24; implementation partially exists. User subsequently removed temperature and selected Codex-only development. The revised patient/nurse flow awaits written review.
Event: SBUHacks 2026  
Working title: Waiting Room Monitor; product name remains open.

Latest decision (2026-10-24): use an existing phone's rear camera and flashlight for contact PPG at check-in. No additional sensor hardware is required for the current demo. The full written spec is now approved; this is not a claim of a working implementation.

Additional selected refinements (2026-10-24): show live room-camera footage on the staff dashboard; identify the enrolled patient needing a check; allow an optional assigned seat alongside face recognition/tracking; generate an evidence-grounded Gemini explanation and notification text for ElevenLabs. The user later removed temperature entirely and selected Codex/GPT for all implementation, including Apple-inspired original apple-fruit UI. A thermometer and dedicated finger pulse oximeter are not required purchases.

**Revision entry point:** Read the [scope amendment](../../plans/2026-10-24-waiting-room-monitor/scope-amendment.md) and proposed [patient and nurse journeys](2026-10-24-self-check-in-revision-design.md). The combined phone-session/self-service behavior is proposed, not yet implemented or approved as a written replacement design. Existing work is paused for review.

## 1. Purpose

Help hospital staff notice a waiting patient who may need someone to check on them. The system connects check-in information and an initial contact pulse measurement to subsequent camera observations of that same patient. A staff dashboard shows what changed, where the patient is, and what evidence is available.

This is a hackathon prototype supporting a human check request. It does not diagnose illness, establish clinical urgency, or predict a medical emergency.

### Agreed brief

| Area | Requirement from the discussion |
| --- | --- |
| Check-in | Laptop/webcam face scan, three quick text/multiple-choice questions, and initial contact PPG using a phone's rear camera + flashlight. |
| Waiting area | Laptop/webcam observes the patient; camera pipelines estimate pulse through rPPG, breathing, posture, and activity. |
| Identity | Enroll the patient's face, recognize and track them, and identify the specific visit/person needing a staff check. Optional seat assignment adds location context alongside recognition. |
| Response | Persistent observable change can produce a request for a nurse to check the patient, with supporting evidence. |
| Interface | A polished staff dashboard with live room-camera footage, patient/track overlays, patient details, room location, trends, quality indicators, and alert handling. |
| Gemini | Interpret the short questionnaire and explain why an existing check request was raised using recorded evidence; produce concise notification text for ElevenLabs. |
| ElevenLabs | Speak the validated Gemini notification through the staff dashboard laptop/speaker, with a factual template fallback if Gemini fails. |
| Temperature | Excluded entirely: no input, card, scenario, default value, provider fact or spoken measurement. |
| Hardware | Use an existing phone and laptop/webcam; no additional sensor purchase or Arduino integration is required. The $30–50 ceiling and Micro Center availability apply only if additional hardware is reconsidered later. |
| Scale | Demonstrate the complete journey with one volunteer first. Larger rooms are the intended future setting, not demonstrated capacity. |

### Corrections that must survive handoff

- The face scan at check-in is already selected. Optional seat assignment is allowed alongside face recognition/tracking; it does not replace the completed identity solution.
- Live room-camera footage must appear on the staff dashboard, not only a room diagram or prerecorded clip.
- A detected event must have a Gemini evidence explanation and Gemini-to-ElevenLabs notification path; the visible request must still work if either provider fails.
- Phone rear-camera access and flashlight control are now required for the selected check-in PPG flow. Earlier instructions excluding phone-camera access are superseded. Check-in face enrollment and room sensing still use the laptop/webcam.
- Use one designated, compatible phone for the first demo; patients do not each need to supply a compatible phone. No MAX30102, pulse oximeter, or custom sensor build is required. Do not assume the UNO Q itself measures pulse.
- A volunteer acting tired may have unchanged pulse and breathing. Show what was actually measured.
- This project replaces the earlier ECHO direction. Preserve the existing ECHO files as historical drafts.

## 2. Users and demonstration boundary

**Patient/volunteer:** checks in, provides a face scan, answers the short form, and places a fingertip over the designated phone's rear camera for a contact pulse estimate.

**Staff member:** sees the waiting area and patient evidence, receives check requests, acknowledges them, and records that someone checked the patient.

**Demo operator:** confirms device permissions and lighting, enrolls a consenting volunteer, and runs the demonstration. Operator controls must be visibly separate from staff evidence; a simulated event cannot masquerade as a live observation.

The first demonstration uses one enrolled, seated volunteer, one designated phone for contact PPG, and one laptop webcam for face enrollment followed by room monitoring. The architecture must accept multiple patient records and tracks. A second person is an identity-confusion test, not a promise of reliable room-wide physiological measurement. Two laptops may be used later if available; neither a second laptop nor a second webcam is a prerequisite.

## 3. Patient journey

### 3.1 Check in and create a visit

Create a new visit with a non-identifying demo label, such as Patient 014. The visit is the common link for the questionnaire, face enrollment, contact pulse, and later observations. A new visit must not inherit another patient's information.

The patient can open the questionnaire through a QR link on their own phone. The link must identify or pair with the intended check-in session. The designated PPG phone must also pair explicitly with that visit; the questionnaire and PPG may be completed on different devices. A generic room QR code alone must not attach answers or pulse to whichever face happens to be nearest the camera. The check-in and phone screens show the pairing/visit code so the operator can confirm the association. Starting a different visit clears any unfinished acquisition for the previous visit.

### 3.2 Capture the face scan at the check-in station

The check-in laptop/webcam captures the consenting person's face and enrolls a face representation under the visit ID. Give visible feedback for no face, more than one face, an unusable capture, and successful enrollment. Do not enroll the wrong person silently.

Face detection locates a face; face recognition matches it to an enrollment; tracking follows the person between frames. These are separate responsibilities in the implementation.

The operator may also assign a seat label, such as B4, during check-in or afterward. Keep the assigned seat separate from the person's currently observed location. Assignment is optional, editable, and does not establish identity or prove that the patient is still in that seat. Section 5 defines how location conflicts are shown.

### 3.3 Complete the short form

Target completion time: approximately 30 seconds, to be measured in the demo rather than claimed as an achieved result.

| Question | Input |
| --- | --- |
| What brings you here today? | Short free text, maximum 500 characters. |
| When did this start? | Today / Yesterday / Several days ago / Longer ago / Not sure; optional short clarification. |
| How has it changed since it started? | Getting better / Staying the same / Getting worse / Comes and goes / Not applicable. |

Retain the original answers. Gemini produces a proposed editable summary with the complaint, reported onset, and reported course. Unstated details remain “not mentioned.” The patient or operator confirms/corrects the summary. If Gemini is unavailable, the form can still be saved and the original answers remain readable.

Example: “Been dizzy since this morning, feels worse now” becomes dizziness reported, onset this morning, worsening reported. It must not become a diagnosis or an invented severity score.

### 3.4 Record initial contact pulse using phone camera PPG

Use the phone's rear camera and adjacent flashlight to capture small changes in fingertip light intensity caused by pulsatile blood volume. This is contact PPG; room-camera facial rPPG remains a separate measurement pipeline.

1. Confirm the intended visit on the phone, request camera permission, select the rear camera, and enable the flashlight if supported.
2. Ask the volunteer to cover the lens gently with their fingertip, illuminated by the flashlight, and hold still. Target approximately 30 seconds of usable data; rejected time does not count toward the usable window. Stop the flashlight when capture ends or is cancelled, and allow an immediate stop if it feels uncomfortable.
3. Extract a timestamped intensity trace, remove slow drift, filter the pulse component, and estimate pulse rate using classical signal processing. No trained model or stress dataset is required for initial contact PPG.
4. Show acquisition progress, a waveform derived from captured data, BPM only when usable, and quality/status. Movement, poor finger coverage, exposure changes, saturation, or insufficient signal must cause a retry/unavailable result rather than a plausible-looking number.
5. Save a completed reading to the paired visit with the measurement interval, source device/browser, method (`phone-camera-contact-ppg`), quality, and provenance. A later recheck is a new reading; it does not overwrite the earlier one. Switching visits during capture must not redirect the result to the new visit.

The phone browser processes fingertip frames locally. Send only structured results and, when needed for the live waveform, a bounded derived signal trace to the project service; do not upload fingertip video to AI providers. A submitted completed reading needs an explicit saved/failed state so a lost connection cannot silently lose it or attach it to another visit.

For the phone web flow, use HTTPS and camera permission. A laptop's plain HTTP LAN address is not a secure context on the phone; `localhost` refers to the phone itself. The implementation plan must define and verify a phone-accessible HTTPS setup without assuming deployment is authorized. Verify rear-camera selection and continuous flashlight control on the exact phone/browser before building around it. If either is unavailable, show the incompatibility; do not silently substitute simulated data or promise cross-device support.

This version reports pulse/BPM and signal quality. It does not output SpO₂, blood pressure, temperature, a stress score, or a diagnosis from fingertip video. A borrowed real pulse device can be used as an evaluation reference; manual transcription must be labeled, and cannot pass acceptance for automatic phone PPG acquisition. If phone capture fails, show “contact measurement unavailable.”

### 3.5 Monitor in the waiting area

The room camera recognizes the enrolled person and tracks their current location. Separate pipelines produce camera pulse, breathing, and posture/activity observations. Staff can inspect the available evidence throughout the wait.

An initial contact pulse is a timestamped comparison point. It is not a permanent calibration offset for camera rPPG. Different conditions, times, and measurement methods must remain visible when comparing readings.

The check-in value is an initial snapshot, not necessarily a resting baseline. It does not by itself improve rPPG accuracy. Compare phone PPG and facial rPPG over overlapping stationary intervals when evaluating their agreement, retaining separate quality states. Sequential readings can show changes over time but cannot isolate measurement error from a real pulse change. Agreement between the two is not a substitute for an independent reference.

### 3.6 Ask staff to check the patient

For the first demo, a sustained seated posture change creates a check request. The dashboard immediately highlights the specific enrolled patient/visit and current camera location, links the request to their live-camera track, and shows the detector's factual reason and other available data. If identity is uncertain, state that uncertainty rather than naming a patient confidently.

The service then sends a bounded event/evidence snapshot to Gemini. Gemini explains why the check was requested, distinguishes observations from patient reports and simulated inputs, and generates concise notification text. After programmatic validation, that text goes to ElevenLabs and plays through the staff dashboard laptop/speaker. This does not require a new human approval step for each notification. The core visible request is not delayed by the providers; section 8 defines fallback and stale-result handling.

Staff can acknowledge the request and mark it checked. Neither action means the patient has recovered medically.

## 4. Data layers and interpretation

| Layer | Input and output | Role in this prototype | Required failure behavior |
| --- | --- | --- | --- |
| Patient report | Original form answers and confirmed summary | Context about why the person is waiting | Show original answers if summarization fails. |
| Contact PPG | Phone rear-camera + flashlight fingertip video → derived waveform, pulse/BPM, and quality | Initial pulse snapshot and later rechecks, associated with a visit | Unsupported camera/flashlight, poor signal, or interrupted capture stays unavailable; retry explicitly. |
| Camera rPPG | Facial color signal over a time window → pulse estimate | Pulse estimate and trend while usable | Show collecting/low quality/unavailable/stale, not a frozen “live” number. |
| Camera breathing | Visible torso/chest motion over a time window → respiratory-rate estimate | Separate respiratory observation | Motion or insufficient visibility can invalidate the window. |
| Posture/activity | Body landmarks and temporal movement | Detect sustained posture change and explain movement context | Unknown posture/activity stays unknown; walking must not be inferred from pulse. |
| Identity/location | Face enrollment, recognition, and tracking | Associate observations with visit and current location | Ambiguity stops confident patient attachment. |

All observations carry a source, source/receipt timestamps, measurement interval, quality state, and provenance. Distinguish live measurements, manually entered measurements, replay, and synthetic fixtures. Do not mix fixture values into a live patient timeline without a prominent mode label.

Contact PPG and rPPG both describe the pulse phenomenon. Multiple channels from the same camera also share visibility and motion limitations. The dashboard must not present their agreement as independent clinical confirmation.

Breathing measurements cannot be turned into a measured heart rate simply by applying a stress dataset. No stress classifier or disease classifier is required for this demo. No oxygen saturation is inferred from the webcam.

### Temperature removed from scope

The user explicitly removed temperature. Do not implement measurement, manual entry, simulated values, a scenario panel, a default or a “Not measured” card. Do not include system-generated temperature in provider snapshots or speech. Historical artifacts are preserved but do not feed the active demo. Patient-authored text mentioning fever remains an original patient report, never a system-generated temperature reading.

## 5. Identity and location rules

Enrollment ties a face representation to a visit. Room-camera recognition proposes a match; tracking maintains continuity and supplies location. A seat label such as B4 is a location, not a patient's identity.

The staff outcome is concrete: select a check request and see the enrolled visit label, current recognized/tracked person in the live feed, and the best available current location. A bounding box alone without the visit association does not satisfy patient identification. Use a non-identifying visit label for the demo; a real legal name is not required.

Optional seat assignment stores the assigned seat and assignment time separately from camera-observed location and observation time. A small operator-configured seat map may associate image regions with labels. Only a confidently tracked person visibly occupying a configured region supports a current observed seat label. Otherwise show the current camera region or “location uncertain.” Do not add automatic chair recognition as a requirement.

| Condition | Required behavior |
| --- | --- |
| Confident match to one enrolled visit | Attach observations to that visit and show current location. |
| Unknown face | Show an unrecognized track without borrowing a patient's record. |
| Ambiguous match or conflicting track | Show identity uncertain and hold patient-specific attachment. |
| Brief face turn with uninterrupted, confident person tracking | Continuity may be retained; quality of each measurement is assessed separately. |
| Occlusion, crossing, lost track, or seat change with lost continuity | Require a reliable match before resuming attachment; do not use the previous seat occupant's identity. |
| Assigned seat differs from current observed location | Keep both labels distinct, flag the mismatch, and use the current observed location in the check request/voice. Do not change identity based on the seat. |
| Assigned seat exists but current location is unverified | Show the assignment as historical/planned context; do not announce it as the patient's current location. |
| Recognition unavailable | Show the failure. An explicitly labeled manual demonstration may be possible, but does not satisfy automatic identity acceptance. |

Enrollment and matching thresholds must be evaluated on the actual consenting demo participants. Do not assign a medically meaningful probability to an uncalibrated similarity score. The exact recognition library and thresholds belong in the implementation plan after a compatibility check.

## 6. First automatic event: sustained seated posture change

### Observable event

After an upright seated reference is collected, the volunteer gradually droops their head or slumps. The system detects a persistent change relative to that person's reference. It reports a posture observation, not “the patient is fatigued,” unconscious, ill, or deteriorating.

### Proposed engineering defaults for review

| Setting | Initial specification |
| --- | --- |
| Seated reference | At least 10 seconds of usable seated pose observations before posture-change monitoring starts. |
| Persistence | A continuous 10-second qualifying posture change before creating a check request. |
| Tracking/pose gap | A gap exceeding 1 second resets an unfinished candidate; missing time does not count toward persistence. |
| Camera pulse window | Target 30 seconds of usable observations; update the estimate about every 2 seconds after collecting enough data. |
| Camera breathing window | Target 45 seconds of usable observations; update about every 2 seconds after collecting enough data. |

These are prototype timing choices, not clinical thresholds or measured device performance. The implementation plan must define the posture features and quality checks precisely, then test them using the actual camera. No pretrained pose model is presumed to classify medical fatigue.

### Event lifecycle

`collecting reference → monitoring → candidate → open check request → acknowledged → checked`

A short adjustment returns from candidate to monitoring without an alert. One continuous episode creates one request; it must not generate a new spoken announcement every frame. Acknowledged requests stay visible until staff mark them checked. After a check, a fresh usable reference is required before rearming the posture detector. Camera loss does not resolve an existing request.

The first automatic trigger uses posture persistence. Pulse, breathing, recent activity, and check-in context accompany it as evidence. Their absence must not be hidden, and unchanged physiology does not invalidate the acted-posture demonstration. Additional physiological alert rules require their own defined criteria and evaluation; they are not silently invented by Gemini.

### Announcement copy

“Please check the patient at seat B4. A sustained change in seated posture was detected.”

If location or identity is uncertain, adapt the visible request to the known camera region and state the uncertainty. Do not speak a stale seat label as the patient's current location. Keep names, questionnaire answers, and detailed symptoms out of the spoken announcement.

This copy is also the deterministic fallback. Gemini may phrase the notification naturally using the same supplied evidence; it cannot replace the observed reason with a guessed medical cause.

## 7. Staff dashboard

The visual objective is a polished, legible monitoring workspace. The room view, current check requests, and selected patient evidence should be understandable at a glance.

| Surface | Required content and interaction |
| --- | --- |
| Room overview | Live room-camera video embedded in the dashboard, with track/visit labels and location overlays. Selecting a person opens their details; selecting a request highlights the matching track when currently visible. Show connection, monitoring, and identity uncertainty states. |
| Check-request queue | Reason, patient/location or uncertainty, duration, creation time, acknowledge/check actions. |
| Selected patient | Visit label, enrolled identity status, optional assigned seat and distinct current observed location, questionnaire/original answers, phone contact pulse with measurement interval/source/quality, camera estimates, activity/posture, and quality. No temperature card. |
| Trends and evidence | Time windows, missing sections, source labels, and the observations that caused the request. No interpolated line across missing data presented as measurement. |
| System/audio controls | Camera/model/provider status; explicit enable/mute voice and an audio test. Failed audio never hides the visible request. |

Live footage is required, not an optional decorative element. The first demo renders the same laptop camera stream used by sensing; a second feed or cloud video service is not required. Overlay coordinates must match the video's displayed crop, scaling, and mirroring so staff can locate the correct person. A stale, disconnected, paused, replayed, or synthetic feed must not be labeled live; show its state prominently. Full-session video recording is not required.

The request detail shows the detector reason immediately, followed by Gemini explanation status and the validated explanation when available. Keep evidence, generation status, and speech status visible separately. The current location and identity state remain readable while Gemini or speech is pending.

Use distinct copy for “collecting,” “usable estimate,” “low quality,” “unavailable,” and “stale.” A stale estimate may remain in history with its time but must stop appearing as a current live reading. Do not use a green state to mean medically safe.

An identity issue, a sensor-quality issue, and a staff check request must look different. Keyboard access, readable contrast, and text labels alongside color are required. The final aesthetic and product name can be chosen during UI design without altering the data model or event semantics.

## 8. AI and voice boundaries

### Gemini

Gemini has two required jobs:

1. **Check-in:** interpret the three short answers into an editable summary, preserving the original text and the confirmation flow in section 3.3.
2. **After detection:** explain the factual basis for an existing staff check request and generate the short text that ElevenLabs will speak. “Why” means which observations support checking this patient; it does not establish the medical cause of those observations.

The event service creates the visible request first, then supplies a bounded structured snapshot: event ID, visit/track association and uncertainty, current verified location and timestamp, detector reason and duration, available pulse/breathing values with windows/quality, recent posture/activity and relevant confirmed questionnaire context. No temperature scenario. Include absent/stale readings as such; do not fill them. Send only the minimum relevant context, not raw video or face representations.

Require structured output containing the same event ID, an explanation, references to supplied evidence IDs, missing-data/uncertainty notes, and concise notification text. Both explanation and notification must preserve provenance. Patient reports remain reported context, and synthetic values remain simulated; neither becomes a measured cause. Validate the schema, event binding, evidence references, and consistency of numeric/location claims against the snapshot before displaying or speaking generated content. If unsupported statements cannot be excluded, use the factual template instead.

Example supported explanation: “A sustained seated posture change lasted 10 seconds. The patient reported dizziness at check-in. The current camera pulse estimate is unavailable.” This supports a human check; it does not establish why the person slumped. Unchanged measured pulse or unavailable breathing must remain unchanged/unavailable in the explanation.

Gemini does not assign identity, invent readings, decide the initial posture trigger, assign clinical priority, or make a diagnosis. Patient text is data, including text that resembles instructions. Invalid output, timeout, or provider failure leaves the original evidence and visible request accessible, marks Gemini unavailable, and uses the detector's factual explanation/notification template. The implementation plan defines a bounded provider timeout so speech cannot wait indefinitely.

Before using a generated result, recheck the event state, identity association, and current location. Drop results for acknowledged/checked requests or superseded snapshots. If the patient moves or identity becomes uncertain, regenerate from a fresh snapshot or use a template with the currently verified location/uncertainty; never send a stale confident identification to speech.

### ElevenLabs

The normal path is `detected event → visible request → Gemini explanation + notification text → programmatic validation → ElevenLabs audio → staff dashboard speaker`. ElevenLabs receives the validated notification text, not the raw questionnaire or sensor stream, and does not interpret physiology. Gemini failure substitutes a factual template before the same text-to-speech step. ElevenLabs failure leaves the visible text/request and a clear speech-failed status.

Audio can be muted and is deduplicated by request ID across retries and fallback. Acknowledged/checked requests are not announced later from a delayed queue. Check the event, identity, and location again before playback; discard audio that would announce a superseded location or identity. Enable audio once through the dashboard if the browser requires a user gesture. Do not require staff to approve each generated message. Keep names, detailed symptoms, questionnaire text and temperature values out of notification copy.

Use synthetic or explicitly consenting demo material for provider testing. No raw room video or face representations are required by either integration. Accounts, credits, and keys have not been checked; keys belong only on the server, never in exported UI code.

## 9. Architecture and subsystem boundaries

### Approaches considered

| Approach | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Browser capture/processing plus a local service | One laptop can acquire the webcam and serve the staff experience; clear UI/sensing boundaries | Browser performance and model compatibility need an early check | Recommended starting architecture. |
| Python camera processing plus web dashboard | Access to established computer-vision/scientific tooling | Separate process/runtime and frame transport add integration work | Alternative if the browser feasibility check fails; explicit plan revision required. |
| Cloud video analysis | Remote processing possible | Uploading video, latency, connectivity, and biometric-data handling add dependencies | Outside the initial demo. |

The spec selects responsibilities and behavior. Exact packages, model versions, routes, schemas, and file ownership are defined in the next-stage implementation plan. No model training is required initially; pretrained perception models and classical signal processing are candidate tools.

| Subsystem | Responsibility | Boundary provided to other subsystems |
| --- | --- | --- |
| Check-in | Visit creation, short form, laptop face enrollment, paired phone PPG capture/quality/result submission | Visit-linked enrollment, original answers, confirmed summary, and timestamped contact pulse estimates. |
| Identity | Enrollment representation, recognition, track association, optional assigned-seat metadata | Track-to-visit match state, uncertainty, current observed location separate from assigned seat. |
| Camera sensing | Frame acquisition, pose/activity, rPPG, breathing, per-channel quality | Timestamped observations tied to tracks, without diagnosis. |
| State/event service | Validate observations, maintain visits/evidence, enforce freshness, run deterministic detector and request lifecycle | Readable room/patient snapshots and auditable check requests. |
| Staff UI/providers | Render live video/overlays and snapshots; handle staff actions; request Gemini explanations/notification text and ElevenLabs speech | User actions, validated event-bound explanation/text/audio, and separate provider states; no duplicate detector logic. |

Room capture runs where the laptop/webcam is attached. Phone contact PPG runs on the paired phone; the laptop does not need direct access to that camera. A local service coordinates structured observations and UI state. Raw video is not sent to Gemini or ElevenLabs. If a second laptop is added, exchange structured data rather than assuming access to its webcam. The text-only questionnaire does not request camera permission; the separate phone PPG capture screen does. Define the phone's HTTPS access and result transport in the implementation plan before parallel building.

Before implementation resumes, freeze the revised shared interfaces and fixture set. Codex/GPT owns every component, including presentation, styling, behavior, forms, state, sensing, identity, API/provider calls, tests and integration. Lovable and Antigravity are not used. This chat owns plan revision/integration; any future parallel work requires renewed authorization and non-overlapping ownership.

## 10. Data lifecycle and failure handling

Use visit IDs, track IDs, camera/source IDs, and event IDs for their separate meanings. Preserve source timestamps and receipt timestamps; do not treat delivery time as the time an entire physiological window was measured. Reject duplicate or out-of-order observations according to the shared contract. A delayed packet must not revive an old reading as current.

An observation is attached to a patient only with valid identity association for its measurement interval. Windows crossing an ambiguous identity change are discarded for patient-specific use. Restarting a camera or losing continuity starts a new signal window rather than combining unrelated histories.

For the prototype, keep video frames and face representations local and session-scoped by default. Persist only the minimal structured demo visit, readings, questionnaire, and request history needed for the demonstration. Do not silently claim that face embeddings are anonymous. Do not implement automatic permanent deletion; follow the user's Trash-only policy for local artifacts.

| Failure | Required behavior |
| --- | --- |
| Camera permission denied/disconnected | Clear unavailable state and retry action; no invented observations. |
| Phone rear camera/flashlight unsupported or permission denied | Explain the blocked check-in capability, stop capture/flashlight, and offer retry on a verified compatible phone; no invented baseline. |
| Finger signal unusable or phone capture interrupted | Reject the affected window, show the reason, and retry; never submit the last plausible BPM as a completed reading. |
| Phone result submission fails or visit changes | Show unsaved/failed status and retain the original visit association for an explicit retry; never redirect the reading to the current visit. |
| Face/model initialization fails | Explain which capability is unavailable; do not claim identity monitoring works. |
| Motion/poor visibility invalidates physiology | Null/unavailable current estimate with reason, while valid posture/activity evidence can remain usable. |
| Delayed/lost connection | Mark data stale, retain clearly timestamped history, reset unfinished candidates after disqualifying gaps. |
| Service restart | Preserve committed visit/request records if persistence is implemented; camera windows and recognition continuity restart visibly. |
| Gemini/ElevenLabs failure | Core evidence and visible check requests continue; show the unavailable integration. |
| Gemini response/audio is delayed after movement, identity change, or acknowledgement | Discard superseded content; use fresh verified context or suppress speech, without creating a duplicate request. |
| Live video stops while structured readings remain visible | Mark the footage unavailable/stale immediately and handle each measurement's freshness separately; a frozen frame is not live. |
| Legacy temperature fixture exists | Preserve the historical artifact; do not mount it in active UI or send it to providers. |

## 11. Hardware and feasibility decisions

The selected demo uses an existing phone's rear camera/flashlight and a laptop/webcam. No additional hardware purchase is required. The exact phone/browser is not yet verified for capture, flashlight control, and usable pulse extraction.

The inventory also includes an UNO Q and Grove components, but they are optional and outside the required demo path. There is no confirmed contact PPG module, pulse oximeter, GSR module, or radar in the project inventory. A controller or generic environmental sensor must not be relabeled as a medical sensor.

| Decision | Rule for the next stage |
| --- | --- |
| Contact PPG source | Selected: existing phone rear camera + flashlight. First prove a real waveform, usable BPM, and rejection of poor input on one phone/browser. Record device and capture provenance. |
| Phone connectivity | Verify camera permission, continuous flashlight control, phone-accessible HTTPS, and visit-linked result submission. No deployment or public tunnel is authorized by this spec. |
| Additional purchases | None required now. If revisited, stay within $30–50 including adapters and verify Micro Center stock/compatibility; no purchase is authorized. |
| Existing Arduino/Grove contribution | Deferred from the required demo; an optional physical interface must not block phone PPG or automatic room monitoring. |
| Thermometer / dedicated pulse oximeter | Not required or selected for purchase. Temperature is out of scope; phone PPG supplies pulse only. Actual SpO₂ remains unavailable unless a separate real device is explicitly added later. |
| Webcam capture | Verify the actual laptop's framing, lighting, resolution, and achievable processing performance. Do not claim 100-person sensing from a small-room demo. |
| Hardware prize | Check the actual SBUHacks track criteria separately; no eligibility claim is made here. |

There is no required external contact-sensor acquisition gap under this design. The open feasibility gate is a working phone PPG pipeline on an actual phone, including usable signal quality and result transport. A failed phone measurement remains a visible missing capability. Integrating only simulated or manually transcribed contact readings cannot pass phone data-acquisition acceptance.

## 12. Demonstration and acceptance

### Demonstration sequence

1. Enroll the volunteer's face, complete the questionnaire, pair the PPG phone to that visit, and capture/save a real fingertip pulse measurement with quality.
2. Optionally assign a seat, then seat them within the camera's useful view; show live dashboard footage, recognition/visit overlays, observed location, and real quality states while reference windows fill.
3. Make a brief posture adjustment; show it clearing without a check request.
4. Hold a gradual slump long enough to create one request; immediately highlight the patient and evidence, then show Gemini's explanation and play its validated notification through ElevenLabs on the dashboard speaker.
5. Acknowledge/check the request, then demonstrate uncertain identity or camera loss without assigning another person's data.

No volunteer needs to hyperventilate, hold their breath, or induce a high pulse. Any prerecorded/replayed/synthetic illustration is clearly labeled and cannot count as successful live sensing.

No temperature scenario is included. Test a changed seat/location before speech to show that an old assigned seat or delayed generated message is not announced as current.

### Acceptance matrix

| ID | Observable acceptance criterion |
| --- | --- |
| AC-01 | New check-in creates a unique visit; original form answers and confirmed summary remain attached after reopening the visit. |
| AC-02 | Check-in enrolls a real face; room-camera matching identifies the same consenting person. An unknown person does not automatically inherit that record. |
| AC-03 | Leaving/reappearing or changing seats cannot silently transfer the previous occupant's data. Ambiguity is visible and patient attachment stops. |
| AC-04 | On a verified phone/browser, rear-camera + flashlight capture produces a real fingertip-derived waveform and usable pulse estimate, saved automatically to the intended visit with measurement interval/source/quality. Denied permission, unsupported flashlight, poor signal, capture interruption, visit switching, and failed submission are handled visibly without fabricating or misassigning a reading. An unavailable/manual/synthetic reading does not satisfy automatic acquisition. |
| AC-05 | Camera rPPG produces a real estimate in a usable stationary test, with a separate labeled reference comparison. Poor input is rejected rather than always producing plausible BPM. |
| AC-06 | Camera breathing produces a real estimate in a usable stationary test, with a timed manual/reference count. Its window and quality remain separate from camera pulse. |
| AC-07 | Posture/activity observations are visible; recent movement is available as context and does not become an automatic stress diagnosis. |
| AC-08 | A brief posture change under 10 seconds creates no request; a qualifying continuous change of at least 10 seconds creates one. Missing pose time does not satisfy the hold. |
| AC-09 | The request shows patient/location or uncertainty, reason, measurement times, and available supporting evidence. Staff acknowledgement/check actions change the actual request state. |
| AC-10 | Gemini supports both questionnaire interpretation and event explanations with notification text. Output preserves originals, evidence references, measured/reported/synthetic provenance, missing facts, and uncertainty. Unsupported claims fail validation; timeout/failure uses a factual template while the request remains visible. |
| AC-11 | Validated Gemini notification text reaches ElevenLabs and plays once per eligible request through the dashboard after audio is enabled. Gemini failure uses template text; speech failure remains visible. Mute, retries, changed location/identity, acknowledgement, and delayed audio cannot duplicate or misrepresent the request. |
| AC-12 | Stale/missing/replay data is visibly distinct from current live data. The UI does not label an unavailable estimate as normal or safe. |
| AC-13 | The dashboard embeds live room-camera footage with correctly aligned track/visit overlays. Selecting an identified person/request opens the correct visit and highlights the current track when visible. A stopped or frozen feed is visibly non-live. |
| AC-14 | Optional seat assignment is editable and distinct from camera-observed location. Moving from the assigned seat does not transfer identity or cause stale location announcements; absent/ambiguous location is shown explicitly. |
| AC-15 (revised) | Temperature has no active input/card/scenario/default, generated provider fact or spoken value. Historical artifacts are preserved but excluded from the active demo. This replaces the retired optional-temperature criterion; it is not an implementation pass. Original patient reports are not erased. |

Report the measured error and usable-window rate for pulse/breathing tests, along with the actual camera, participants, lighting, motion, and reference method. The implementation plan must set engineering smoke-test tolerances before those tests run. A successful one-person demo is not clinical validation or evidence of performance across skin tones, patient populations, or large crowded rooms.

For phone PPG, record phone/browser, sampling timing, usable-window rate, and comparison against a separately obtained pulse reference. A timed manual pulse count is a coarse smoke-test reference when no instrument is available; do not present it as ECG validation. Also test phone PPG and facial rPPG during overlapping stationary intervals, reporting agreement separately from accuracy against an independent reference. If no reference is available, report signal acquisition and agreement only, not validated accuracy.

## 13. Scope exclusions

- Disease diagnosis, medical triage ranking, stress classification, mind reading, and guaranteed deterioration detection.
- Webcam or phone-camera SpO₂, phone-derived blood pressure/temperature, inferred ECG, or a promised heart rate derived solely from respiratory data.
- Required custom PPG electronics, MAX30102 procurement, or Arduino integration for the current demo.
- Radar, ultrasonic speakers, RFID physiological sensing, GSR, and other unselected sensor additions.
- A demonstrated 100-person room, guaranteed face recognition, or a hidden substitution of fixtures for measurements.
- Deployment, hospital-record integration, purchases, cloud video upload, or unrequested GitHub/project creation.

## 14. Evidence and current project state

The workspace audit on 2026-10-24 found an earlier ECHO TypeScript draft, no frontend, and no runnable server entrypoint. Node v26.5.0 is installed. Running `npm test` produced 8 passing tests and 1 failed test-file load because `server/src/http.ts` is missing. Those tests exercise the old draft, not this project. The directory is not currently a Git repository; no commit was created for this specification.

The following sources establish available methods or platform capabilities; they do not validate our unbuilt system:

| Source | What it supports |
| --- | --- |
| [Prospective validation of smartphone-based heart rate and respiratory rate measurement algorithms](https://pmc.ncbi.nlm.nih.gov/articles/PMC9053269/) | Fingertip smartphone-camera pulse measurement was evaluated in 95 participants. Supports feasibility of the method, not the accuracy of our unbuilt implementation. |
| [Smartphone fingertip and facial PPG validation study](https://pmc.ncbi.nlm.nih.gov/articles/PMC5368348/) | Rear-camera fingertip capture illuminated by the adjacent flashlight was compared with ECG under study conditions; motion and capture conditions matter. |
| [Browser camera access requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) | Camera access requires a secure context and user permission. Phone-accessible HTTPS must be planned and tested. |
| [Media track constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints) | Camera/torch constraints exist; actual device/browser support must be checked rather than assumed. |
| [rPPG-Toolbox](https://github.com/ubicomplab/rPPG-Toolbox) | Published/research implementations of camera pulse methods, including classical approaches and pretrained models. |
| [RGB camera breathing research](https://pubmed.ncbi.nlm.nih.gov/31248200/) | Respiratory monitoring studied using a webcam under controlled conditions. Our implementation needs its own evaluation. |
| [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js) | Pretrained body landmarks suitable as inputs to posture/movement logic. |
| [face-api.js project](https://github.com/justadudewhohacks/face-api.js) | Browser face-recognition implementation exists. Package maintenance/compatibility and suitable model licensing must be checked before selection. |
| [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) | Schema-constrained extraction is available; semantic accuracy still requires validation. |
| [ElevenLabs text to speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) | Text can be converted to staff notification audio. |

## 15. Review and next step

The user approved the original written spec on 2026-10-24 and later explicitly removed temperature and selected Codex-only development. Phone-camera + flashlight contact PPG, live dashboard footage, patient identification, the Gemini-to-ElevenLabs event explanation/notification flow and optional seat assignment remain selected. Approval is not implementation evidence.

Revise the existing plan using writing-plans and evidence-driven-planner. Review the new patient/nurse journey proposal, then freeze exact interfaces, ownership, dependency order and acceptance tests for Codex-only implementation. Existing work remains preserved and paused; no automatic restart while the replacement flow is undecided.
