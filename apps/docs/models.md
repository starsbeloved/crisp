# Crisp models and providers

Crisp combines local computer-vision models, signal-processing code, and hosted generative AI services. The active application is `apps`.

## Local vision assets

All paths below are relative to `apps`.

| Component | Local assets | Used for |
| --- | --- | --- |
| Tiny Face Detector | `public/models/face-api-1.7.15/tiny_face_detector_model.bin` and its weights manifest | Finding faces. |
| 68-point tiny landmark model | `public/models/face-api-1.7.15/face_landmark_68_tiny_model.bin` and its weights manifest | Locating facial landmarks and sampling regions. |
| Face recognition model | `public/models/face-api-1.7.15/face_recognition_model.bin` and its weights manifest | Computing 128-dimensional descriptors for enrolled-patient matching. |
| MediaPipe Pose Landmarker Lite | `public/models/pose/pose_landmarker_lite.task` | Body landmarks used by posture and breathing estimation. |
| MediaPipe Tasks Vision runtime | `public/models/mediapipe-1.1.1/wasm/` | The WebAssembly loaders and runtime variants needed for pose inference. |

The complete directory is approximately **50.8 MiB**, including the WebAssembly runtime variants. These files are committed to Git and served from `/models/`; the app does not download its face/pose weights from a third-party model host during inference.

[`client/lib/face.ts`](../client/lib/face.ts) loads the three face-api models. [`client/camera/pose.ts`](../client/camera/pose.ts) loads MediaPipe's runtime and Pose Landmarker Lite. Pose uses CPU by default; the optional GPU path has a CPU fallback.

Asset sources, sizes, and SHA-256 hashes are in [`public/models/manifest.json`](../public/models/manifest.json). License and notice files live alongside the weights. The manifest's preparation-time verification fields are historical asset records, not a current clinical-accuracy evaluation.

Keep these assets, weights manifests, and license files with the app. Removing them breaks the corresponding camera features.

## Pulse and breathing estimation

The heart-rate pipeline uses POS remote photoplethysmography on sampled facial RGB values. Its implementation is in [`client/camera/signals`](../client/camera/signals/).

There is no separate downloaded pulse-estimation model. Breathing estimation uses landmark motion and signal processing. Neither pipeline establishes clinical accuracy merely by running successfully.

## Hosted providers

| Service | Configuration | Repository behavior |
| --- | --- | --- |
| Direct Gemini API | `GEMINI_MODEL` | Used for follow-up questions, summaries, explanations, handoffs, recorded-context Q&A, and opt-in frame descriptions. The source-code fallback model identifier is `gemini-3.5-flash-lite`; private server configuration may override it. |
| ElevenLabs text to speech | `ELEVENLABS_MODEL_ID`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_CRISP_VOICE_ID` | Voices validated text and call-outs. The source-code fallback model identifier is `eleven_flash_v2_5`; private server configuration may override it. |
| ElevenLabs conversational agents | `ELEVENLABS_AGENT_ID`, `ELEVENLABS_NURSE_AGENT_ID` | Agent language-model and voice settings are configured in ElevenLabs. Agent IDs connect the application to those hosted configurations. |

These identifiers describe the checked-in configuration paths; this document does not verify which overrides are currently set or query live provider-account settings. Gemini and ElevenLabs model weights are hosted by their providers and are not stored in this repository.

## Private configuration

The server reads an untracked environment file selected with `PROVIDERS_ENV`. Set it to a private path outside public assets. Provider API keys must never go into `public/`, browser code, or `VITE_*` variables.

There is a legacy absolute default pointing to `apps/waiting-room/.local/providers.env` in the original checkout. Set `PROVIDERS_ENV` explicitly when moving the project or cleaning historical folders. The provider reader and signed-agent-session helper both use this setting.

## Historical duplicate

`apps/waiting-room/public/models/` contains an older copy of the same asset set. The current application's loaders use `apps/public/models/`. The duplicate is a cleanup candidate; the active copy and its licenses are required. No model files were removed as part of this documentation update.
