# Project Instructions

## Selected project — Waiting Room Monitor

**The user has selected this idea for SBUHacks 2026.** This is the active project in this workspace. ECHO and the other earlier ideas are historical explorations, not the current product direction.

Build a hospital waiting-room monitoring prototype that helps nurses notice a patient who may need someone to check on them. Connect check-in information to subsequent camera observations of the same patient, show the supporting evidence on a polished staff dashboard, and provide a spoken staff notification.

### Source of truth

Read [the design specification](docs/superpowers/specs/2026-10-24-waiting-room-monitor-design.md) before planning or implementing features.

The written specification is **approved by the user on 2026-10-24**. Read the [implementation plan and agent guide](docs/plans/2026-10-24-waiting-room-monitor/agent-handoffs.md). The revised implementation plan was **approved for execution by the user on 2026-10-24**. P1-A1 is complete. The user subsequently authorized three parallel Codex GPT-6.1 Sol High workstreams: integrator/environment P1-A2, backend P2-A1/A2 and phone P1-B. Each stops at its scoped checkpoint; no subagents or additional sessions/messages. Backend exclusively owns server/http.ts, server/store.ts and their tests; phone owns client/phone/ and its tests; integrator alone owns shared/config/dependencies/lock/API/App/clocks/model manifest/canonical ledgers. External uploads/projects/deployments and trust changes still require their respective authorization.

### Required patient journey

1. **Check-in:** create a visit, scan/enroll the patient's face with the laptop/webcam, collect a short questionnaire, and take an initial contact PPG-derived pulse estimate using a paired phone's rear camera + flashlight.
2. **Waiting area:** use a laptop/webcam to recognize and track the enrolled patient and estimate camera pulse through rPPG, breathing, posture, and activity.
3. **Patient association:** attach observations to the correct visit using face recognition and tracking so staff can locate the specific enrolled patient needing a check. Optional assigned seats supplement identity; current observed location remains separate. Show uncertainty rather than assigning ambiguous observations to a patient.
4. **Staff check request:** detect a persistent observable change and show which patient, their current location, what changed, and the available supporting evidence.
5. **Staff response:** display the request immediately alongside live room-camera footage and the patient's track. Gemini explains the supplied event evidence and generates concise notification text; programmatically validate it, then pass it to ElevenLabs for the dashboard speaker. Staff can acknowledge/mark the request checked. Provider failure uses a factual template or visible failure state without hiding the request.

### Decisions agents must preserve

- **Face scanning at check-in is selected.** Face enrollment, recognition, and tracking are required capabilities. Optional seat assignment is allowed alongside them; it does not fulfill identity by itself. Show assigned seat separately from current observed location and never announce an unverified assignment as current.
- **Live room-camera footage is required on the polished staff dashboard**, with patient/track/location overlays, patient details, trends, quality indicators, and alert handling. Selecting an identified patient/request must connect to the correct visit and current track; frozen/replayed footage cannot be labeled live.
- **Gemini has two jobs:** interpret check-in answers and explain why an existing check request was raised using recorded facts. Its event-bound, validated notification text feeds ElevenLabs. It must preserve missing/uncertain/synthetic evidence, avoid invented medical causes, and cannot decide the initial trigger. Reject stale generated text/audio after location/identity changes or acknowledgement; deduplicate speech per request. No per-alert human text approval is required.
- The questionnaire has three quick text/multiple-choice questions: why the patient is here, when it started, and how it has changed. Preserve original answers alongside any confirmed Gemini summary.
- Keep all agreed data layers: initial contact PPG, camera rPPG, camera breathing, posture/activity, and patient-reported context. Identity, timestamps, source, and quality apply across them.
- **Phone rear camera + flashlight PPG is the selected contact pulse method.** This supersedes earlier instructions excluding phone-camera access. Use one designated phone for the first demo; patients need not each supply one. Use the laptop/webcam for face enrollment and room sensing. The text questionnaire alone does not request camera access.
- Pair the PPG phone explicitly to the intended visit. Target about 30 seconds of usable capture, calculate BPM and quality with signal processing, and submit the real result automatically with its measurement interval and provenance. No trained model or additional sensor is required initially.
- Verify rear-camera/flashlight support, permission, phone-accessible HTTPS, signal quality, and result transport on the actual phone/browser. A failed capture stays unavailable; never fabricate a waveform or baseline. Phone PPG does not supply SpO₂, blood pressure, temperature, or a diagnosis.

### Demonstration and scientific limits

The first demo follows one consenting volunteer through check-in and seated monitoring. A brief posture adjustment should clear; a sustained slump should create a request for a nurse to check the patient. The proposed timing and acceptance criteria are in the specification.

Acting tired does not require a change in pulse or breathing. Display real readings, including unchanged or unavailable readings. Label replay and synthetic data explicitly. Never substitute them invisibly for live sensing.

**Scope revision (2026-10-24): temperature is removed entirely.** No temperature input, card, scenario control, default value, provider context, or speech is part of the current demo. Do not replace it with a “Not measured” card. Preserve historical artifacts; retire old runtime fields through a coordinated contract migration, not destructive cleanup. Read [the scope amendment](docs/plans/2026-10-24-waiting-room-monitor/scope-amendment.md) before continuing old packets.

The product supports a human check request. Do not describe it as a diagnosis, automatic medical triage, a validated stress detector, or a medical emergency predictor. Contact pulse is a timestamped comparison, not a permanent rPPG calibration offset. Do not infer measured heart rate solely from breathing or webcam oxygen saturation.

The intended future setting may be crowded, but the first demo does not establish capacity for 100 people.

### Hardware and project constraints

- Additional hardware budget: **$30–50**, including necessary adapters. Additional parts must be obtainable from Micro Center; verify availability and compatibility before recommending a purchase.
- **No additional hardware purchase or custom sensor build is required for the current demo.** Existing phone + laptop/webcam are the selected devices. The extra-hardware budget is a ceiling only if purchases are reconsidered.
- A thermometer and a dedicated finger pulse oximeter (including the earlier Sharper Image option) are not required purchases. Phone PPG supplies pulse only; actual SpO₂ remains unavailable unless a real device is explicitly selected later.
- Available inventory includes an UNO Q and Grove components; integrating them is optional and must not block the demo. No radar or dedicated contact physiological sensor is confirmed. Do not assume extra hardware has been purchased or that the UNO Q measures pulse.
- Preserve existing ECHO drafts, tests, research, and hardware photos. Earlier scope statements in `.plans/progress.md` describe ECHO; this file establishes the newly selected project direction.
- Follow the user's global safety guardrails. Do not publish, deploy, push, purchase, upload private data, or create external projects without the required user authorization. Follow the Trash-only deletion policy.

## Current workflow

Use the requested Superpowers workflow: written specification review, implementation plan review, then implementation. The user wants bite-sized task files for independent agents across Codex, Lovable, and Antigravity. Define shared interfaces, dependencies, editable file ownership, and acceptance checks before parallel implementation.

**Current ownership supersedes earlier tool assignments:** Codex/GPT writes the entire product, including Apple-inspired, original apple-fruit-themed frontend, backend, sensing, providers, tests and integration. Do not use Lovable or Antigravity; preserve their historical exports but remove them as dependencies. The user requested all three workstreams checkpoint and pause, then assigned plan revision/integration to this chat. Do not resume implementation or launch new workers automatically. The new [self-check-in design](docs/superpowers/specs/2026-10-24-self-check-in-revision-design.md) is a proposal awaiting review; temperature removal and Codex-only ownership are already user decisions. No subagents. Other workstreams retain their code until an explicit ownership transfer/resume.

Keep user-facing updates short, concrete, and easy to scan. Do not ask again for facts already established in this file or the specification.
