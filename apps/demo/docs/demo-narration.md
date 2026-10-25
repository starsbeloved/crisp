# Crisp — complete demo walkthrough

English narration and production notes for judges. This is a proposed walkthrough, not a rendered or timed video. Use the [feature inventory](features.md) for the full checklist and the [Devpost copy](devpost.md) for written detail.

## Opening: physical and digital

**Show:** a real kiosk, staff computer and room camera; Crisp on their screens. Label wider unimplemented connections “Vision”.

“Meet Crisp, a proactive, ambient AI assistant for hospitals and clinics. Picture a character with the presence of Miss Minutes, living across screens and speaking with people. Crisp connects what happens in the physical room with information and actions in the digital system, helping patients and healthcare staff get things done.”

## Patient arrival

**Show:** voice intake, visible fields, face scan, follow-up and queue confirmation. If the pulse check is not in the available footage, show the actual current UI in a separate capture or label a supporting illustration.

“A patient checks in by conversation. ElevenLabs gives Crisp its voice and connects the dialogue to application tools. Gemini helps ask a relevant follow-up and summarize the patient's own words. The patient can use the form or request staff help. Face enrollment supports recognition, and an optional camera pulse check displays a waveform and signal quality.”

## Awareness and response

**Show:** recognition, landmarks, quality coaching; a safely staged movement followed by the real request. Retain the actual delay before the request.

“In the room, browser-based face and pose models recognize enrolled patients and track movement. Signal processing attempts heart-rate and breathing estimates. Poor signals remain visibly unavailable.

“When the configured movement or signal conditions qualify, the rule engine raises a request for a human check. The request appears before the AI explanation finishes. Gemini summarizes the recorded evidence; ElevenLabs voices the request. Staff can review the incident debrief, trends and available replay, or opt in to a Gemini description of the alert frame.”

## Staff tools and proactive behavior

**Show:** actual voice command and result, then actual suggestion cards. Label a recreated card or unfilmed sequence as a workflow illustration.

“Staff can ask who's waiting, retrieve recorded context, acknowledge a request, mark a patient checked, or call someone to a room.

“Crisp also takes initiative. It surfaces kiosk help, reminders about long waits, ready charts and patient check-backs. A missing camera sighting prompts verification. When a room becomes free, Crisp proposes the next patient. Staff accept or dismiss the suggestion. A shift summary brings together recorded events.”

## Handoff and exam room

**Show:** call-in, hallway, public waiting board, exam chart, doctor brief and recorded-allergy answer. Keep fictional-record labels visible.

“Hey Crisp, call Jason to Room 1.

“The hallway announces his first name, number and destination. The public board shows queue position and labeled wait estimates. His exam screen preloads the visit, handoff and doctor brief. The doctor can ask for recorded allergies. Our demonstration history is fictional. Marking the patient done frees the room and enables Crisp's next suggestion.”

## Explain the infrastructure

**Show:** real devices around a shared Vultr-hosted application. Show the services' names beside their actual roles.

“Vultr hosts the shared application connecting these separate devices. Node manages the visits and actions, Server-Sent Events update the screens, and MJPEG carries the room video. Vision runs in the camera browser. Gemini provides useful language from the recorded context, and ElevenLabs makes the interaction conversational.”

## Supporting features montage

**Show:** station picker, identity correction, privacy mode, reference-HR comparison, health strip, sound controls and fallback labels. Use actual UI captures for each.

“Each device chooses a station role. Staff can correct an identity match, and privacy mode can obscure unknown faces in the shared video. The detail view keeps original answers, baselines and request history, and can pair camera pulse estimates with manually entered reference readings. The status strip makes camera and provider problems visible. Microphone and sound controls, text, visible buttons, browser speech and template responses keep supported actions accessible when a provider or voice session is unavailable.”

## Accessibility and closing vision

**Show:** existing PC/laptop, touchscreen and peripherals. Label CCTV and hospital-record integrations as future connections.

“Crisp is primarily software. The first version can reuse existing PCs, laptops, displays, microphones, speakers and compatible cameras. A touchscreen computer can become a check-in kiosk; staff open their station in a browser. The application can also be hosted on a hospital-managed server, while enabled Gemini and ElevenLabs features still use their APIs.

“We want to lower the hardware barrier for smaller clinics and under-resourced healthcare systems. Compatible security-camera connections, records and broader administrative workflows are the next integrations.

“Crisp: a proactive presence between the physical and digital, helping people care for people.”

## Coverage checks before recording

- Show Gemini/Template and quality labels as they actually appear; do not relabel fallback output.
- Explain that rules create the check request; Gemini writes its context and explanation.
- Keep Vultr in the implementation segment rather than the product title or identity.
- The voice kiosk needs a microphone and speaker plus a computer; face enrollment also needs a camera.
- The current camera input is webcam/replay. CCTV adapters and real EHR connections are roadmap items.
- Match the supporting montage against the [full inventory](features.md) so reference comparison, health, privacy, station roles and fallbacks are covered.
- Time a read-through before fixing the edit duration. All these features need a longer walkthrough than a short elevator pitch.
