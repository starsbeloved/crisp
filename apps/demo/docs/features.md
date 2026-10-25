# Crisp — implemented features and technical roles

The current application is in `apps/demo`. This inventory describes code in the prototype; a feature's implementation does not establish clinical performance or prove it appeared in the filmed demo.

## Patient intake

| Feature | What it does | Implementation |
| --- | --- | --- |
| Conversational check-in | Collects the patient's name and reason for visiting through conversation, with visible feedback. | [Check-in agent tools](../client/checkin/agent/tools.ts), ElevenLabs Agents, and its configured Gemini language model. |
| Tap-through intake | Provides a form alternative, symptom choices, onset/trend, and optional identity details. | [Check-in controller](../client/checkin/controller.ts). |
| Adaptive follow-up | Asks one question tied to what the patient said; records their response. | [Gemini provider functions](../server/providers/index.ts) and a complaint-specific fallback policy. |
| Face enrollment | Enrolls numeric face descriptors for later matching; permits skipping the scan. | [Enrollment](../client/checkin/enrollment.ts) and [local face models](../client/lib/face.ts). |
| Camera pulse check | Attempts an initial estimate with a waveform, countdown, quality and light/movement coaching; skip and no-reading continuation remain available. | [Pulse acquisition](../client/checkin/useKioskPulse.ts), [POS tracker](../client/camera/signals/pulse.ts). |
| Help request | Lets a patient notify staff from the kiosk. | [Proactive service](../server/proactive.ts), `kiosk_help`. |
| Queue confirmation | Saves the visit, shows its number, and makes it available to other connected stations. | Shared server state and SSE updates. |

## Physical-space awareness

| Feature | What it does | Implementation |
| --- | --- | --- |
| Patient recognition | Matches enrolled faces and keeps uncertain/unknown identities explicit; staff identity-correction controls are available. | [Vision pipeline](../client/camera/useVision.ts), [tracking](../client/camera/tracking.ts). |
| Body and posture tracking | Associates body landmarks with tracks and records head-drop, slump, stillness and fall-like movement cues. | [MediaPipe loader](../client/camera/pose.ts), [posture processing](../client/camera/signals/posture.ts). |
| Pulse and breathing estimates | Samples facial color for POS rPPG and landmark movement for breathing; displays quality and unavailable states. | [Signal tracker](../client/camera/signals/index.ts). |
| Visual feedback | Shows names, skeletons, measured waveforms, quality coaching, LIVE/REPLAY and camera state. | [Camera page](../client/camera/CameraPage.tsx), [overlay](../client/camera/overlay.ts). |
| Shared room video | Sends overlaid frames to the server for the staff video feed. | [Camera output](../client/camera/output.ts), [MJPEG server](../server/mjpeg.ts). |
| Privacy mode | Supports obscuring unknown faces in the streamed overlay. | [Camera overlay](../client/camera/overlay.ts). |

## Staff response and context

| Feature | What it does | Implementation |
| --- | --- | --- |
| Check requests | Applies deterministic duration, posture, quality and estimate rules; produces red/amber requests. A request is created when its conditions qualify. | [Engine](../server/engine/index.ts). |
| Generated explanation | Turns recorded facts into a short request explanation and spoken sentence. The visible request can exist before provider text/audio is ready. | [Provider functions](../server/providers/index.ts), [orchestration](../server/orchestrator.ts). |
| Spoken request | Announces validated text through ElevenLabs; browser speech is a fallback. | [ElevenLabs TTS](../server/providers/elevenlabs.ts). |
| Incident debrief | Brings the recorded reasons and patient context together on the dashboard. | [Incident debrief](../client/dashboard/IncidentDebrief.tsx). |
| Patient detail | Shows original answers, summary, signal quality, trends, baselines, request history and handoff. | [Patient drawer](../client/dashboard/PatientDrawer.tsx). |
| Reference comparison | Pairs a manually entered reference HR with a usable camera estimate and calculates error across paired samples. No validated accuracy result is claimed. | [Patient drawer](../client/dashboard/PatientDrawer.tsx). |
| Replay | Plays available frames from before a request alongside relevant signal history. | [Replay player](../client/dashboard/ReplayPlayer.tsx). |
| Gemini sees | With opt-in/manual action, sends one frame for a short visible-scene description; validates identity/medical-language restrictions. | [Vision provider](../server/providers/vision.ts), [consent UI](../client/dashboard/GeminiSees.tsx). |
| Ask Crisp | Answers questions from recorded room facts, with explicit unavailable/template behavior. | [Grounded Q&A](../server/providers/index.ts). |
| Human response | Acknowledge, mark checked, call in, or remove a visit from the waiting queue after staff action. | [Staff commands](../server/commands.ts). |
| System status | Exposes camera/provider health and stale or disconnected information. | [System strip](../client/dashboard/SystemStrip.tsx). |

## Voice and proactive workflows

[Staff tools](../client/staff/tools.ts) support `list_waiting`, `patient_summary`, `call_patient`, `acknowledge_request`, `mark_checked`, `get_record`, `accept_suggestion`, `shift_summary`, and `remove_patient`. Wake listening opens the conversational session; visible controls and text remain available.

The [proactive service](../server/proactive.ts) supports:

- **Room free:** proposes calling the next patient by arrival order after staff mark a room free.
- **Long wait:** reminds staff about a prolonged wait combined with a recorded worsening report.
- **Missing sighting:** asks staff to verify whether someone left; camera absence is not proof.
- **Chart ready:** surfaces available handoff context after call-in.
- **Patient check-back:** offers a hallway message inviting a patient to contact the desk if feeling worse.
- **Kiosk help:** surfaces a patient's request for assistance.
- **Shift summary:** generates a recorded-event summary on request.

Suggestions can be accepted or dismissed. Acceptance rechecks the current conditions. Spoken suggestions are managed by the staff sound controls.

## Handoffs, public screens and stations

| Feature | What it does | Implementation |
| --- | --- | --- |
| Call-out | Announces first name, queue number and room, without public complaints or camera estimates. | [Lobby](../client/lobby/LobbyPage.tsx), [hallway](../client/room/NowCallingPanel.tsx). |
| Waiting board | Shows initials, people ahead and labeled estimated wait time; the early estimate is explicitly marked as a fallback. | [Wait-time board](../client/lobby/WaitTimeBoard.tsx), [estimator](../server/waittime.ts). |
| Clinician handoff | Generates a bounded SBAR-style note from recorded facts. | [Handoff provider](../server/providers/index.ts). |
| Exam chart | Preloads a called patient's context; an optional face match can confirm arrival, while manual selection remains available. | [Exam page](../client/exam/ExamPage.tsx). |
| Doctor brief | Summarizes today's words and recorded events, with Gemini/template source labeling. | [Pre-visit brief](../client/exam/DoctorBrief.tsx). |
| Recorded history | Retrieves fictional history and can read recorded allergies by voice. | [Demo records](../server/records.ts). |
| Room turnover | “Patient done” frees the room and enables the next-patient suggestion. | [Proactive service](../server/proactive.ts). |
| Device roles | Assigns a browser device to kiosk, room, Command Center or exam-room use; the lobby is directly accessible. | [Station model](../client/station/model.ts). |

## Technology roles in one sentence each

- **Vultr:** hosts the shared application used to connect the demo's separate devices to the same visits, events, call-outs and room state.
- **Gemini API:** generates adaptive questions, summaries, request explanations, handoffs, recorded-context answers and opt-in frame descriptions.
- **ElevenLabs:** provides conversational agents and the voice for patient intake, staff interactions, requests, proactive prompts and call-outs.
- **face-api.js and MediaPipe:** run local browser inference for faces, identity descriptors, body landmarks and posture.
- **POS signal processing:** extracts the camera pulse signal; breathing estimation analyzes landmark motion.
- **Node HTTP, SSE and MJPEG:** coordinate state, screen updates and room video across devices.

The current camera source is a browser-accessible webcam or labeled replay. Security-camera adapters, hospital EHR integration and general-purpose administrative automation are future work.
