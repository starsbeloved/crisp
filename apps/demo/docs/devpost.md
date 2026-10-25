# Crisp — Devpost submission copy

## General info

**Project name:** Crisp

**Elevator pitch:** A proactive, ambient AI assistant for hospitals and clinics, bridging physical spaces and digital systems to help patients and healthcare staff.

**Built with:** TypeScript, React, Vite, Node.js, Vultr, Google Gemini API, ElevenLabs Agents, ElevenLabs Text to Speech, MediaPipe, face-api.js, rPPG, Server-Sent Events, MJPEG, SVG, Vitest, Playwright, OpenAI Codex, Claude.

**Sponsor categories:** Best Use of Vultr; Best Use of Gemini API; Best Use of ElevenLabs.

**Track:** UI UX. Add Beginner only if the team meets the event's eligibility requirements.

**AI tools used:** OpenAI, Anthropic, Gemini, ElevenLabs.

**Try it out — source code:** https://github.com/starsbeloved/waiting-room-monitor/tree/crisp-demo

**Live demo and video:** Add the actual hosted application and uploaded video URLs. Do not use a placeholder as a submission link.

## About the project

### Inspiration

Imagine an assistant that lives throughout a clinic. It greets a patient, notices what is happening in the room, brings a nurse the relevant context, and has information ready when a doctor asks.

That is Crisp: a proactive AI assistant at the intersection of the physical and digital worlds.

The easiest way to picture its personality is Miss Minutes: a recognizable character that appears on screens and talks with people. We wanted that feeling of presence in healthcare, with an original apple character and tools that help patients and staff get things done.

Our ambition extends across hospital systems: patient support, records, administrative work, communication, and coordination. For this hackathon, we made that ambition concrete through one connected journey from arrival to the exam room.

Accessibility shaped the idea. A smaller clinic should be able to explore the first version using existing computers, cameras, displays, microphones and speakers. We wanted to lower the amount of specialized hardware needed to try a useful healthcare assistant.

### What it does

**Crisp welcomes the patient.** Patients check in by conversation or through a tap-through form. Crisp captures their own words, asks an adaptive follow-up, supports face enrollment, and gives them a queue number. An optional camera pulse check shows a waveform, signal quality and positioning guidance. Patients can skip it or request staff help.

**Crisp follows the physical room.** The browser recognizes enrolled patients, tracks body landmarks and posture, and attempts contact-free heart-rate and breathing estimates. Quality coaching and measuring/low-signal states make uncertainty visible. Recorded video is labeled REPLAY.

**Crisp brings forward a change.** Qualifying fall-like movement, sustained head-drop, or other configured observation rules create a “may need a check” request. The engine creates the request as soon as its conditions qualify; generated explanation and audio are added asynchronously. The Command Center brings together the patient's words, recorded observations, an incident debrief, trends and available replay frames.

**Crisp can describe what is visible.** With explicit opt-in, Gemini receives one alert frame and returns a short description of visible posture and scene. The screen discloses the transfer, and validation restricts identity guesses and medical interpretation.

**Crisp helps staff act.** “Hey Crisp, who's waiting?” “What happened with Jason?” “Call Jason to Room 1.” Supported tools retrieve recorded information and perform staff actions. Staff can also acknowledge requests, mark someone checked, remove a visit from the queue, or use the visible controls.

**Crisp takes initiative.** It proposes calling the next patient when a room becomes free, reminds staff about a long wait with a worsening report, surfaces ready charts and kiosk help requests, and offers patient check-backs. It can flag a missing camera sighting for staff verification and produce a shift summary on request. Suggestions have accept/dismiss controls.

**Crisp carries the context forward.** The hallway and lobby announce the patient's first name, queue number and destination. A public board shows initials, queue position and labeled wait-time estimates. Call-in preloads the exam-room chart, recorded visit context, a clinician handoff and a pre-visit brief. The doctor can ask for recorded allergies. “Patient done” frees the room for the next suggestion.

**Crisp remains one character.** Listening, thinking and talking animation, including an audio-responsive mouth, gives the assistant a consistent personality across the patient and staff screens.

### How we built it

**Vultr connects the devices.** We use Vultr to host the shared application so different laptops and PCs participate in the same demo. One device can handle intake, another can provide the camera view, and others can show the Command Center, lobby or exam room. They share visits, room status and actions through the central backend. This makes Crisp a connected environment across devices.

**The browser handles vision.** React and TypeScript provide the station interfaces. face-api.js detects faces and creates numeric identity descriptors. MediaPipe supplies body landmarks. A POS remote photoplethysmography pipeline estimates pulse from facial color changes; shoulder and torso movement supplies the breathing signal. Models are served with the app and run in the browser.

**Node coordinates the workflow.** A plain Node HTTP server holds room state with local persistence. Server-Sent Events update the screens, and MJPEG carries overlaid room video. Deterministic rules create check requests. Staff commands and proactive suggestions operate on the recorded shared state.

**Gemini turns context into useful language.** The Gemini API generates complaint-specific follow-up questions, short check-in summaries, request explanations, SBAR-style handoffs, doctor briefs, recorded-context answers and shift summaries. The opt-in vision path describes an alert frame. Gemini also serves as the language model for the configured check-in agent. Structured outputs, numeric grounding checks and template fallbacks constrain generated text.

**ElevenLabs gives Crisp its voice.** ElevenLabs Agents connects natural conversation to client tools for check-in and staff actions. Text to speech delivers validated check requests, proactive prompts and patient call-outs. Microphone/sound controls, text paths and browser speech provide alternatives when voice is unavailable.

### Why the first version is accessible

Crisp is primarily software. A clinic can assign existing laptops or PCs to station roles through a browser. A kiosk can use a touchscreen connected to a computer, with a microphone and speaker for conversation and a camera for optional enrollment and sensing. Staff can use computers already at their desks.

Our demo uses Vultr, while the same application can be hosted on a hospital-managed server. Browser vision runs on the camera computer. Enabled Gemini and ElevenLabs features still use their external APIs with either hosting arrangement.

Existing security cameras offer a possible expansion path where compatible streams, camera placement, resolution and lighting support the task. The current demo uses webcams; connecting arbitrary CCTV systems requires an adapter and evaluation.

This approach is intended to lower the hardware barrier for smaller clinics and under-resourced healthcare settings. Hosting, provider costs, connectivity, security and clinical evaluation still matter; we have not established cost savings or real-world clinical outcomes.

### Challenges we ran into

**Making the assistant proactive and useful.** We connected recorded events to concrete proposals such as a newly free room. A suggestion needs current context, a clear action, and a way for staff to accept or dismiss it.

**Keeping multiple devices on the same story.** A call-in must update the staff view, hallway and exam room consistently. Shared state and event updates gave those screens a common source of truth.

**Getting trustworthy signals.** Movement, lighting, camera conditions and skin tone can affect optical estimates. We added quality gating, coaching, waveforms, unavailable states and reference-comparison tools. Performance across diverse people and environments needs further evaluation.

**Giving generated language boundaries.** A fluent explanation can overstate the evidence. We retained original answers, constrained generated output, checked numeric claims, and used templates when providers failed or output was rejected.

**Making voice work in a real room.** Background noise, permissions, autoplay restrictions and microphone ownership required explicit controls and visible fallbacks.

### Accomplishments that we're proud of

- A connected prototype across patient, nurse and doctor workflows, hosted through Vultr for use on different devices.
- A character with voice, personality and useful client tools.
- Proactive suggestions that connect room events to the next staff action.
- Browser vision with identity, posture, optical estimates and explicit signal quality.
- A check-request workflow with an incident debrief, trends, replay and human response controls.
- Gemini explanations, handoffs, doctor briefs, grounded Q&A and opt-in image descriptions.
- Patient call-outs, a public waiting board and exam-room context that preload from staff actions.

### What we learned

An assistant's initiative becomes useful when it brings the right context to a concrete next step. Personality makes that interaction approachable, while visible confirmations make its actions understandable.

Physical observations and digital records need a common workflow. A camera event becomes more useful when staff can connect it to the patient's own words and later retrieve that context in the exam room.

A software-first design makes existing equipment valuable. Deployment flexibility and clear hardware requirements belong in the design from the beginning.

We used Codex and Claude during planning, implementation and review, alongside automated and browser checks. Small interfaces helped us integrate parallel work.

### What's next

Extend authorized connections to EHR/FHIR, scheduling, documentation and other administrative systems. Build compatible camera-stream adapters, add more languages, and evaluate sensing across lighting, motion, skin tones and camera setups. Work with healthcare staff on useful reminders and actions, and add the access control, identity, retention and operational safeguards needed for clinical deployment.

The vision is one attentive assistant across the hospital's physical spaces and digital systems, helping people care for people.

**Prototype scope:** Camera values are estimates with quality labels. Crisp requests a human check and does not diagnose or assign clinical triage. Demo medical histories are fictional; recorded footage is labeled REPLAY. The prototype has not been clinically validated.

## Additional-info answers

### Use of generative AI

Yes. Gemini generates adaptive questions, visit summaries, request explanations, clinician handoffs, doctor briefs, recorded-context answers, shift summaries and opt-in scene descriptions. It also provides the configured conversational check-in agent's language model. ElevenLabs Agents supports patient and staff conversations through client tools, while ElevenLabs text to speech voices validated requests, proactive prompts and call-outs. Deterministic rules create check requests; generated language is constrained by validators and template fallbacks.

### Best Use of Vultr

Vultr hosts the shared application connecting the demo's separate devices. Intake, room observation, the staff Command Center, public call-outs and exam-room context operate against the same backend. Node HTTP manages shared state and actions, Server-Sent Events distribute changes, and MJPEG transports the overlaid room video. Vision inference stays in the browser on the camera device. Vultr lets the team demonstrate one assistant operating across a physical environment through existing computers.

### Best Use of Gemini API

We use the Gemini API for adaptive follow-up questions, concise intake summaries, explanations of recorded check requests, SBAR-style clinician handoffs, pre-visit briefs, recorded-context Q&A and shift summaries. Opt-in Gemini vision describes visible posture and scene from a single alert frame. Structured outputs and validators limit length, unsupported numbers and diagnostic language; template fallbacks keep the workflow available.

### Best Use of ElevenLabs

ElevenLabs gives Crisp a recognizable voice and conversational interface. Agents call client tools to conduct check-in and supported staff actions. Text to speech announces check requests, accepted workflow prompts and patient destinations across the connected screens. Audio-responsive animation gives the character a visible speaking presence. Visible controls, text and browser speech offer fallback paths.

### Technology feedback

Gemini's structured outputs helped us turn recorded facts into concise language, but validation and bounded waits were necessary. ElevenLabs Agents and client tools connected dialogue to real application actions; browser microphone and autoplay behavior required care. Vultr provided the shared host that let existing devices take different roles in one connected demo. React, MediaPipe and face-api.js made browser-based interfaces and sensing possible, with performance and signal-quality work remaining central to the experience.

### Remaining team-specific fields

Supply the team's actual schools, the Gemini Project Number, and the uploaded demo-video URL. List GoDaddy Registry domains only if actually registered during the hackathon; otherwise enter N/A. The repository's privacy and judge access must be arranged by the owner. This file does not submit the Devpost entry.
