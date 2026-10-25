# Crisp

**A proactive, ambient AI assistant for hospitals and clinics.**

Crisp works across a clinic's cameras, screens, speakers, and software. Its apple character gives people a familiar face to talk to. We are building an assistant that connects events in the physical space with patient information and staff tools, so it can notice changes, offer useful next steps, and help patients and healthcare staff throughout a visit.

For **SBUHacks 2026**, we built a demonstration across patient arrival, room observation, staff coordination, and the exam room. The waiting-room workflow is the first demonstration of a much broader healthcare assistant.

## The vision

Imagine an assistant that knows a patient has arrived, remembers what they said, notices when someone may need attention, knows which room is available, and has the relevant context ready when a clinician asks.

- **For patients:** a familiar voice to explain the next step, help with intake, answer supported questions, and connect them with staff.
- **For nurses:** awareness of the room, timely reminders, patient context, and voice-controlled coordination.
- **For doctors:** relevant history and visit context ready to retrieve, summarize, and hand over.
- **For administrative staff:** help with intake, queues, room turnover, appointments, and routine coordination as system integrations grow.

Crisp's longer-term role spans the hospital's authorized systems: records, scheduling, cameras, room status, displays, and communication. It would combine current observations with relevant past information and proactively offer useful actions. Hospital-wide integration and general administrative automation are future work.

## What the demo implements

| Area | Current prototype |
| --- | --- |
| Patient intake | Conversational check-in, adaptive follow-up questions, a visible form, face enrollment, and a request-for-help action. |
| Room awareness | Recognition of enrolled patients, body tracking, posture observations, and heart-rate/breathing camera estimates with signal quality. |
| Staff Command Center | Patient context, recorded timelines, check requests, incident debriefs, acknowledgment, and call-in controls. |
| Proactive coordination | Suggestions for a newly free room, long waits with a worsening report, a missing camera sighting, a ready chart, and patient check-backs; shift summaries on request. |
| Voice actions | "Hey Crisp" interactions to retrieve recorded context and carry out supported staff commands. |
| Hallway and lobby | Patient call-outs and public queue information that omit complaints and camera estimates. |
| Exam room | Preloaded visit context, a generated handoff, and retrieval of clearly labeled fictional demo history, including recorded allergies. |
| Gemini sees | An opt-in description of visible posture and scene from one alert frame, with disclosure that the frame is sent to Gemini. |

Crisp notices events and proposes next steps. Staff confirm workflow suggestions and remain responsible for clinical decisions. A missing camera sighting, for example, is a prompt to verify someone's whereabouts.

## How it works

The active application is **[`apps/demo`](apps/demo/)**.

- **React + TypeScript + Vite** provide the station interfaces and the animated SVG Crisp character.
- **face-api.js + MediaPipe** run face and pose inference in the browser using locally served model assets.
- **POS remote photoplethysmography** estimates pulse from facial color changes; shoulder/torso motion supplies the breathing signal.
- A **Node.js HTTP server** owns room state, local persistence, deterministic check-request rules, and supported staff actions.
- **Server-Sent Events** update the connected screens. **MJPEG** carries the overlaid room video to the Command Center.
- **Gemini** supports follow-up questions, summaries, explanations, handoffs, grounded Q&A, and opt-in image descriptions.
- **ElevenLabs Agents and text to speech** give Crisp conversational interactions and spoken announcements.
- **Vultr** hosts the shared application connecting separate demo devices. Intake, room observation, staff, lobby, and exam-room screens share visits, call-outs, actions, and room state through the same backend.

The current prototype retrieves recorded visit context and fictional histories. Real EHR/FHIR connections and hospital-wide data access remain part of the roadmap.

## Built around existing equipment

Crisp is primarily software. The first version can reuse a clinic's laptops, desktop PCs, displays, microphones, speakers, and compatible cameras. Staff open their station in a browser. A touchscreen connected to a computer can become a check-in kiosk, with a microphone and speaker for conversation and a camera for face enrollment.

The goal is to lower the hardware barrier for smaller clinics and under-resourced healthcare systems. Our demo uses Vultr; the application can also be hosted on a hospital-managed server. Enabled Gemini and ElevenLabs features still use their provider APIs with either hosting arrangement.

The current camera input is a browser-accessible webcam or labeled replay. Reusing security-camera streams is an expansion path requiring a compatible video bridge and suitable camera placement, resolution, and lighting.

## Run locally

Requires **Node.js 24 or newer** and npm.

```sh
cd apps/demo
npm ci
npm run dev
```

The web app runs at `http://localhost:5173`; the API runs at `http://localhost:8787`.

| Page | Purpose |
| --- | --- |
| `/station` | Choose this computer's station role. |
| `/check-in` | Patient intake. |
| `/room` | Room camera and hallway call-outs. |
| `/dashboard` | Staff Command Center. |
| `/exam?room=1` | Exam-room context and voice actions. |
| `/lobby` | Public queue and call-outs. |

For the optimized demo build, run `npm run demo` from `apps/demo`.

Camera and microphone use require browser permission. Remote devices need a trusted HTTPS origin. See the [deployment guide](apps/demo/docs/deploy-vultr.md) for the provided hosting kit.

### Provider configuration

Keep provider credentials in a private, untracked environment file. By default the server reads `apps/demo/.local/providers.env` (git-ignored); select another file with `PROVIDERS_ENV`:

```sh
PROVIDERS_ENV=/absolute/path/to/providers.env npm run demo
```

Configuration supports `GEMINI_API_KEY`, `GEMINI_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL_ID`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_CRISP_VOICE_ID`, `ELEVENLABS_AGENT_ID`, and `ELEVENLABS_NURSE_AGENT_ID`. [Agent configuration](apps/demo/docs/crisp-agent.md) describes the conversational setup.

Provider failures use template text, browser speech, or visible controls where supported. To exercise fallback behavior without loading the provider file:

```sh
PROVIDERS_ENV=/dev/null GEMINI_API_KEY= ELEVENLABS_API_KEY= ELEVENLABS_AGENT_ID= ELEVENLABS_NURSE_AGENT_ID= npm run demo
```

## Models and data

Computer-vision weights and their browser runtime are versioned under **[`apps/demo/public/models`](apps/demo/public/models/)**, approximately **50.8 MiB** in total. They are served by the app and run in the browser. [Model locations, sources, and provider configuration](apps/demo/docs/models.md) explains each component.

Gemini and ElevenLabs run through hosted APIs; their model weights are not included in this repository. Pulse estimation uses signal-processing code rather than a separate downloaded pulse model.

Environment files, local visit data, generated output, and recordings belong outside tracked source. API keys stay server-side. The demo uses face descriptors for identity matching; room video is streamed and transient frames support replay. It does not implement a complete hospital retention or access-control system.

## Verification

Run from `apps/demo`:

```sh
npm run typecheck
npm test
npm run build
```

Automated and simulated browser checks establish software behavior. Live camera accuracy, real microphone performance, provider playback, and clinical suitability require their own evaluation.

Camera values are **estimates** with signal-quality labels. Unavailable readings stay unavailable; recorded input is labeled **REPLAY**. Medical histories are labeled **Demo records — fictional**. Crisp requests a human check and does not provide diagnosis or clinical triage. This hackathon prototype has not been clinically validated.

## Repository guide

| Location | Purpose |
| --- | --- |
| [`apps/demo`](apps/demo/) | Current application, server, tests, and deployment kit. |
| [`apps/demo/docs`](apps/demo/docs/) | Application setup and technical notes. |
| [`apps/demo/public/models`](apps/demo/public/models/) | Required vision models, runtime files, manifests, and licenses. |

Earlier prototypes are preserved in git history and the `checkpoint-*` tags. The default branch is **`crisp-demo`**.

## License

Crisp is released under the [MIT License](LICENSE) © 2026 Thanh Nguyen. Bundled vision models keep their own licenses in [`apps/demo/public/models`](apps/demo/public/models/).
