# Crisp — product vision

**Crisp is a proactive, ambient AI assistant for hospitals and clinics, living at the intersection of physical spaces and digital systems.**

The simplest character reference is Miss Minutes: a recognizable presence that appears on screens, speaks with people, and has a personality. Crisp's original apple character gives that presence a face. The assistant's ambition is to understand its environment, retrieve relevant information, anticipate useful next steps, and help people act through connected tools.

**Ambient** describes Crisp’s presence throughout the environment: available across connected screens and devices, aware of supported events, and ready to help in the flow of work. **Proactive** describes its initiative: bringing relevant context and useful next steps to people.

## One assistant throughout the clinic

For a patient, Crisp can be the voice that welcomes them and helps them navigate the next step. For a nurse, it can surface a change in the room and the context behind it. For a doctor, it can bring forward recorded history and prepare a handoff. For administrative staff, the long-term vision includes registration, documentation, scheduling, reminders, and coordination.

The vision connects cameras, microphones, screens, speakers, records, and everyday hospital software. It combines current observations with relevant past information. It can take initiative within its delegated permissions; the current prototype asks staff to confirm workflow suggestions.

## The current demonstration

The prototype connects conversational intake, face enrollment, an optional camera pulse check, room observation, check requests, staff voice commands, hallway call-outs, proactive workflow suggestions, and exam-room context. Recorded history in the demo is fictional. The [feature inventory](features.md) maps the implemented capabilities to their code.

The patient journey demonstrates the broader assistant. Hospital-wide interoperability, real EHR connections, and general administrative automation are future integrations.

## Accessible through existing equipment

Crisp is primarily software. The first version is designed to reuse equipment that a clinic can already have: laptops, desktop PCs, displays, speakers, microphones, and compatible cameras. This lowers the hardware barrier for smaller clinics and healthcare settings with limited equipment and staffing.

The team uses **Vultr** as the shared host connecting different devices in the demo. Each computer opens the same application and selects a station role. The Node application can also be hosted on a hospital-managed server; that is a supported deployment approach, not a completed hospital installation.

| Station | Basic equipment |
| --- | --- |
| Patient kiosk | A browser-capable computer and display; a touchscreen supports tapping, a microphone and speaker support voice, and a camera enables enrollment and pulse estimation. |
| Room view | A compatible camera and a browser-capable computer to process its frames. |
| Staff or doctor | An existing laptop or PC; a microphone and speaker enable voice interactions. |
| Public display | A browser-capable display or connected PC; a speaker enables announcements. |

The current demo uses browser-accessible webcams. Adapting existing security-camera streams is a deployment direction that requires a compatible video bridge, adequate resolution, lighting, and camera placement. Existing CCTV availability alone does not establish that pulse estimation will work.

Vision inference runs in the browser. Gemini and ElevenLabs features use external provider APIs when enabled, including with a self-hosted backend. Hosting and provider usage have operating costs. Clinical deployment still requires access control, privacy and retention work, and evaluation of sensing accuracy and workflow usefulness.

## Product language

Use **“a proactive, ambient AI assistant for hospitals and clinics”** as the public description. Explain its presence across physical spaces and digital systems in the introduction. Miss Minutes is a useful inspiration reference; the product name is Crisp.

Explain Vultr, Gemini, ElevenLabs, and the sensing stack in the implementation sections. Lead with the assistant, its personality, initiative, and usefulness to patients and staff.
