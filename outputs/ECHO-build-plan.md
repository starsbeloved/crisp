# ECHO — Full Demo and Build Plan

Recommended working plan · October 24, 2026 · America/New_York

**Superseded execution allocation:** the user is working solo overnight and cannot obtain environmental sensors/printing until later Saturday. Use [ECHO-software-first-plan.md](ECHO-software-first-plan.md) and its linked specification for the current build order. The earlier four-person allocation and immediate hardware checkpoints below are historical proposals.

**Status:** ready for team review. This is a plan, not a record of completed implementation. The workspace currently contains planning documents and hardware-photo conversions, with no application or tested firmware. This plan updates the earlier concept document with the confirmed UNO Q, selected phone motion source, apple enclosure, and intended Vultr hosting.

## 1. What we are building

**ECHO is an apple-shaped personal health context recorder. Press it when you feel different; it preserves what its sensors measured beforehand, compares recorded periods, and helps you explain the episode.**

Recommended first person: someone with recurring headaches who struggles to remember the circumstances before an episode. This is a product hypothesis, not a validated clinical use case. The user asked for our judgment on this choice; they have not independently selected a symptom population.

All requested demo layers remain: live sensing, manual capture, automatic motion capture, historical comparison, live recognition, a spoken companion, and an event report. The apple character supplies personality through listening, recording, saved, and speaking states.

We measure context and device movement, and record the person's own symptom descriptions. We do not currently have confirmed heart-rate, blood-pressure, oxygen, or body-hydration hardware. Recognizing reference conditions does not establish that a headache is imminent or what caused it.

## 2. The full five-minute demo

Use one desktop session and one connected phone. Start monitoring before the pitch. A persistent badge identifies synthetic reference history whenever it is used. Every measurement and event retains its own provenance.

| Time | What the judge sees | Feature proved |
|---|---|---|
| 0:00–0:25 | Show the apple: “When you feel unwell, remembering what happened beforehand is hard. ECHO saves that context.” | A clear person, problem, and physical interaction |
| 0:25–0:55 | Phone motion and any verified environmental readings update on the laptop. Show sources and units. | Real acquisition, phone pairing, live dashboard |
| 0:55–1:25 | Change a verified input to a prepared reference condition. ECHO displays the closest references and measured similarities. Show it leave that state too. | Historical comparison and live recognition |
| 1:25–2:05 | Judge presses the apple's button. The timeline preserves the preceding readings, then the apple confirms successful saving. Add “headache” as a user label. | Physical manual capture and pre-event replay |
| 2:05–2:55 | Ask “What changed before I marked this?” Gemini retrieves the event's evidence. ElevenLabs speaks the supported answer while the relevant trace is highlighted. | Useful AI interpretation and voice |
| 2:55–3:35 | Perform the pretested, safe device-motion sequence. A separate automatic event appears with its trigger evidence and a confirm/dismiss control. | Automatic capture; a prototype device-motion detector |
| 3:35–4:10 | Open the event report: timestamps, trace, note, measured context, missing channels, and reference comparison. | One shareable summary of the same stored evidence |
| 4:10–4:40 | Explain the phone/UNO Q/backend data flow and each sponsor's actual role. | Technical contribution and integration |
| 4:40–5:00 | State the next validation step and take a question if the slot permits. | Honest limits and a coherent next step |

The motion demonstration uses a secured device and a controlled bench sequence; nobody falls. It demonstrates the capture algorithm rather than validated human fall detection. Recognition uses explicitly synthetic reference history until real longitudinal data exists.

**The dramatic moment:** a button press reveals data from before the press. The companion answers from that preserved evidence. All screens operate on the same event ID.

If only 30 seconds have accumulated, show “30 seconds available.” The storage target is ten minutes; neither a short session nor an accelerated replay may be labeled ten minutes of live history.

## 3. Build choices and alternatives

| Route | Benefit | Cost | Decision |
|---|---|---|---|
| Phone motion + UNO Q controls/sensors + shared backend | Uses existing equipment; parallel software and hardware work; supports the full demo | Two timestamped sources must be aligned | **Recommended** |
| Entire device standalone, including battery and motion sensing | Closest to a future wearable | Adds IMU, battery, packaging and integration dependencies | Later hardware revision |
| Foreground phone alone | Useful fallback for acquisition and automatic capture | Loses the physical apple interaction and purchased environmental channels | Explicit fallback with those gaps disclosed |

Recommended stack: React/Vite and TypeScript for web; Node/TypeScript for the single backend; SQLite on persistent storage; C++ MCU sketch plus Python Linux-side collector for UNO Q. Select supported dependency versions during implementation and lock them. A small Python board collector avoids inventing our own UNO Q bridge implementation.

```text
Phone foreground webpage -- motion batches over WSS ---------+
                                                            |
Grove button / optional environmental sensors                v
       -> UNO Q MCU -> Arduino Bridge -> Linux/Python -> HTTPS backend
                                                            |
                                      validate + align clocks + ring buffer
                                                            |
                                  save event + ordinary summaries in SQLite
                                                            |
                                     deterministic comparisons and references
                                                            |
                                      Gemini evidence answer -> ElevenLabs
                                                            |
                                    laptop timeline / apple character / report
```

Vultr is the intended deployment host. Local development uses the same application. No deployment, purchase, or cloud configuration has occurred. A trusted HTTPS endpoint is an early dependency for testing browser phone motion; a laptop's plain LAN HTTP URL is insufficient. Use a team-approved existing HTTPS development endpoint or resolve hosting access explicitly during setup.

Phone and board join the same application session independently. Bluetooth phone-to-board pairing is unnecessary for this version. The laptop creates a short-lived QR join link; the phone opens it, the user taps Start sensing, grants any required permission, and keeps the page in the foreground. Show sample gaps and disconnections. Background and locked-screen operation are not promised.

UNO Q's MCU-to-Linux route uses Arduino's documented Bridge RPC. Do not assume ordinary UNO R3 USB-serial behavior or reuse the Bridge's internal transport for unrelated serial work. Confirm the working App Lab/board versions on the actual device before writing the collector.

## 4. Hardware we have and what remains

| Confirmed in photos | Planned role |
|---|---|
| Arduino UNO Q, front and back photographed | Reads physical controls and additional compatible sensors; Linux side forwards data |
| Grove Button v1.2 | Preferred symptom/event marker |
| Grove Micro Switch v1.0 | Alternative physical event marker |
| Grove Touch v1.1 | Optional touch interaction after the button works |
| Grove Rotary Angle Sensor(P) v1.2 | Optional manually entered severity/control; label as user input |
| Grove LED Socket Kit v1.3 | Save/connection indication after the inserted LED and drive requirements are checked |
| Grove Moisture Sensor v1.4 | Soil/conductive-medium moisture; does not supply ambient humidity or body hydration |

Still inspect: Grove leads/breakouts, pin adapters, power supply and USB cable. An attached connector does not establish correct pinout or voltage compatibility. Check UNO Q's pinout and the exact module documentation before wiring; Grove and Qwiic connectors are not interchangeable by default.

**Procurement priority:** one documented, compatible digital ambient-light breakout with usable cables; next, a temperature/humidity breakout if readily available. These give meaningful environmental context without making gas calibration a prerequisite for the whole project. Air sensing remains a target channel conditional on obtaining and stabilizing a known module. A generic gas/VOC reading cannot become measured CO₂ or a specific toxin concentration. Stock and compatibility have not been checked; no purchases have been made.

The UNO Q board footprint is approximately 68.58 × 53.34 mm before connectors, controls, case walls, or power. Plan a palm-sized apple prototype. A small everyday keychain is a later miniaturization goal. Use USB power initially; a battery is a separate fit, runtime, and power-management task.

CAD follows a measured layout: board and module dimensions, connector clearance, button position, USB opening, vents, and fastening. Then create a parametric OpenSCAD source, validate its export if a renderer is available, and slice for the actual printer. Printer availability and fit testing remain dependencies. A valid drawing alone does not establish a printable, fitting enclosure.

## 5. What to do first: the next 90 minutes

Times are targets after implementation begins, not work already completed. One person owns integration and the common data contract.

- [ ] **Minutes 0–15, together:** accept the demo above; assign four owners; fix the session, sample, event, and comparison interfaces. Choose the actual phone and reproducible placement. Record the available HTTPS endpoint and API test status without copying credentials into docs.
- [ ] **Minutes 15–45, phone/UI owner:** obtain real acceleration and rotation values on the phone; send them to the backend; display them on the laptop. The phone uses a user-initiated permission flow over trusted HTTPS.
- [ ] **Minutes 15–60, hardware owner:** boot the UNO Q, run a supported board/Bridge example, and get one physical button event through its Linux collector to the backend. Inspect cable and sensor compatibility. Do not block phone work on this task.
- [ ] **Minutes 15–60, AI owner:** test one Gemini response from a fabricated event and one ElevenLabs spoken response. Record successful provider/model identifiers or specific failures; no sensitive personal data is needed.
- [ ] **Minutes 15–60, backend/integration owner:** receive samples, retain a rolling buffer, save an immutable event, and return an event ID with actual available duration.
- [ ] **Minutes 60–90, together:** move the phone, mark an event, and replay earlier readings. Prove a changing signal existed before the mark. Attach the physical button when ready.

**First milestone:** real motion arrives, a saved event contains pre-mark samples, the event survives a backend restart, and each external provider has a recorded success or a concrete blocker. Those independent results make subsequent work concrete.

If a dependency fails, record exactly what failed and choose a repair or explicit fallback. A browser mark can keep event development moving while the physical control is repaired; the physical-button target remains open. Synthetic input can test a module but remains visibly synthetic.

## 6. Four-person ownership

| Owner | Files/modules they own | Delivery |
|---|---|---|
| A — hardware | `device/uno-q/`, `device/collector/`, `hardware/` | Button, LED, available environmental channels, wiring notes, measured enclosure layout |
| B — backend and integration | `packages/contracts/`, `server/ingest/`, `server/events/`, `server/storage/`, `server/detection/` | Validated data, buffering, persistence, automatic capture, session isolation; integration authority |
| C — analysis and companion | `server/analysis/`, `server/companion/`, `fixtures/` | Synthetic references and ordinary windows, recognition, evidence retrieval, Gemini, ElevenLabs |
| D — phone and experience | `web/phone/`, `web/dashboard/`, `web/report/` | Phone permission/pairing, shared UI, event replay, character states, printable report; submission coordination |

Owner B makes shared-contract changes after notifying the others. Each task consumes the same fixture and types. Integrate a working change at least hourly. Give AI workers one owned module and an acceptance check; inspect the result before combining it. Passing a prompt to an agent is not verification.

## 7. Delivery order and exit checks

### Stage 1 — Capture and replay, target first 3 active hours

- [ ] Implement session joining, phone ingestion, connection/coverage status, and a ten-minute time-based raw buffer.
- [ ] Implement manual event creation with an idempotent request ID, user mark time, optional onset estimate, actual bounds, and an immutable copy of the pre-mark data.
- [ ] Acknowledge Saved only after the database commit. Persist notes separately from measured samples.
- [ ] Connect the UNO Q button and any ready environmental channel to the same event service.
- [ ] Prove restart persistence, duplicate-request handling, buffer expiry, and short-history labeling.

### Stage 2 — Every remaining feature, target next 4–5 active hours

- [ ] Automatic capture: use the phone feed and one reproducible motion-sequence detector. Derive its configured thresholds from observed bench data, record the configuration, and freeze it before rehearsal. Test the intended sequence, nuisance movement, sample gaps, and duplicate suppression. Do not use Gemini as a sample-by-sample detector.
- [ ] Comparison: create a synthetic profile with event and unmarked ordinary windows, all 30 seconds long for demonstration. Use the same feature extractor for references and the trailing live window. Display coverage, channels used, reference IDs, and measured differences.
- [ ] Recognition: fixed, documented feature scaling and matching rules; demonstrate match, non-match, and insufficient-data states. A missing sensor is never zero. Motion-only resemblance is labeled as device-motion resemblance.
- [ ] Companion: backend computes facts; Gemini receives bounded evidence and explains it. Answers contain evidence IDs. ElevenLabs speaks the answer, with the same text visible. Test questions about missing sensors, absent history, and diagnosis requests.
- [ ] Report: build a printable view from the saved event and the same comparison/answer records. Include actual captured duration, sources, sensor placement, missingness, and synthetic-reference labels.

### Stage 3 — Complete rehearsal, target Saturday 18:00 EDT

- [ ] Run the five-minute script on the actual phone, laptop, board, and intended network.
- [ ] Use the same backend build for local and intended Vultr hosting. Resolve HTTPS, WSS, persistent storage, provider secrets on the server, and session access before calling the hosted version ready. External configuration/deployment is a separate requested action, not something this document performs.
- [ ] Verify a second session cannot read the first session's data. Keep pairing secrets and provider keys out of sample packets, screenshots, and logs.
- [ ] Disconnect the phone, restart the backend, and disable each AI provider in turn. Saved records remain available; missing streams and unavailable voice/AI have explicit states. Show factual report/text fallbacks honestly.

### Stage 4 — Packaging, polish, and submission

- [ ] Begin measured enclosure work in parallel after Stage 1's wiring/layout is stable. Confirm print access early; use a test fit before a final case. Keep the board accessible if the print fails.
- [ ] Target Saturday 20:00 EDT for feature freeze. Repair failures and improve clarity, interaction states, keyboard access, and readable charts. Add purposeful apple reactions to pairing, saving, recognition, and speaking.
- [ ] Record a complete run, then prepare the submission video and shorter live variant. Identify recordings as recordings.
- [ ] Target Sunday 08:00 EDT for submission, leaving a buffer before the supplied brief's Sunday October 25, 09:00 EDT deadline. Confirm current organizer requirements, public-repository/video rules, selected prize categories, and AI-use disclosure. Publishing and submission require the team's explicit action/authorization.

All seven demo layers stay. Optional scope to defer: native Watch support, maps, multiple symptom populations, a custom trained model, additional databases, advanced gas interpretation, and battery miniaturization. If a required layer remains broken, record that gap; do not relabel a replay or simulation as a working live feature.

## 8. Shared interfaces to agree before parallel coding

Create `packages/contracts/src/index.ts` first. Other modules import these definitions. JSON shape is versioned; no credentials belong in these records.

| Record | Required fields |
|---|---|
| `Sample` | `schemaVersion`, `sessionId`, `deviceId`, `bootId`, `seq`, `sourceMonotonicMs`, `alignedAtMs`, `receivedAtMs`, `clockUncertaintyMs`, `channel`, `value`, `unit`, `quality`, `provenance` |
| `Event` | `id`, `sessionId`, `requestId`, `markedAtMs`, optional `estimatedOnsetAtMs`, `method`, `requestedStartMs`, `actualStartMs`, `endMs`, `coverage`, `placement`, `sampleIds`, user label/note |
| `Comparison` | `id`, `eventId` or live-window bounds, `profileId`, reference IDs, feature/config version, window length, channels used, coverage, per-channel differences, state |
| `Answer` | `eventId`, `text`, `evidenceIds`, provider/model identifier, provider status, optional audio reference |

Use milliseconds for application timestamps, acceleration in m/s², and browser rotation rates in degrees/s. Preserve raw device time, sequence, gaps, and alignment uncertainty. Check timing alignment with a deliberate synchronized mark; receipt time alone does not prove simultaneous sensing. Missing channels have an explicit unavailable state.

Proposed backend operations: `ingestSamples(sessionId, samples)`, `captureEvent(sessionId, request)`, `getEvent(sessionId, eventId)`, `compareWindow(sessionId, window, profileId)`, and `answerQuestion(sessionId, eventId, question)`. The event service is the only path to creating manual or automatic saved events. The report reads persisted records, not an independently recomputed story.

Thirty-second comparison windows require at least 80% usable one-second bins for every feature included. Exclude a channel explicitly if it cannot meet coverage; comparisons require the same remaining feature set on both sides and a compatible configuration. If none remain, return insufficient data. This is an engineering demonstration rule, not a medically validated threshold.

Meaningful automated checks belong beside the core: buffering boundaries, immutable snapshots, idempotency, durable save/restart, missingness, reference matching cases, and evidence consistency. Actual phone permission flow, board wiring, voice playback, and enclosure fit require hands-on checks. Do not claim those passed from unit tests.

## 9. How JMO's skills fit

I reviewed the repository README and the six skill files. All six names are already available in this session; installation is not the next task. The separate install-guide site was inaccessible to the web reader, so that site's instructions were not verified or executed.

| Skill | Use for ECHO | When |
|---|---|---|
| `interview` | Resolve consequential unknowns and save a shared spec. We already have substantial context; ask only unresolved questions. | Now, before implementation |
| `ste` | Explain architecture and tradeoffs clearly; write evidence-grounded product copy. | Throughout |
| `codex` | Scoped second opinion or review with exact allowed files and acceptance criteria. The bundled wrapper is distinct from the original gstack workflow mentioned in the video. | After a concrete spec or working change exists |
| `better-ui` | Polish surfaces, icons, and state consistency once the interaction works. | After capture/replay is usable |
| `animate` | Give motion a specific purpose; make saving and state transitions understandable; respect reduced-motion preferences. | After states and layout exist |
| `agentation` | Optional element-attached visual feedback for UI refinement. Its bundled setup targets Next.js; the proposed Vite app does not depend on it. | Only if feedback is a real bottleneck |

Recommended sequence: agree on the demo and interfaces → prove real inputs → integrate every feature → review reliability → polish and rehearse. These skills support the work; no skill establishes clinical validity, sensor compatibility, or prize eligibility.

## 10. Evidence and limits

- [JMO repository and skill catalog](https://github.com/23jmo/jmo-skills)
- [JMO interview](https://github.com/23jmo/jmo-skills/blob/main/skills/interview/SKILL.md), [clear explanations](https://github.com/23jmo/jmo-skills/blob/main/skills/ste/SKILL.md), [Codex handoff](https://github.com/23jmo/jmo-skills/blob/main/skills/codex/SKILL.md), [UI polish](https://github.com/23jmo/jmo-skills/blob/main/skills/better-ui/SKILL.md), [animation](https://github.com/23jmo/jmo-skills/blob/main/skills/animate/SKILL.md), [Agentation setup](https://github.com/23jmo/jmo-skills/blob/main/skills/agentation/SKILL.md)
- [UNO Q datasheet and dimensions](https://docs.arduino.cc/resources/datasheets/ABX00162-datasheet.pdf), [UNO Q manual](https://docs.arduino.cc/tutorials/uno-q/user-manual/), [Arduino's Python Router Bridge](https://github.com/arduino/arduino-router-bridge-py)
- [Phone motion permission requirements](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static)
- [Vultr Node application guidance](https://docs.vultr.com/how-to-containerize-node-js-web-applications); this plan does not require adopting its Kubernetes example.
- Event schedule/rules come from the user's supplied `SBUHacks_2026_AI_Brainstorming_Brief.md`; they were not independently re-audited here. Hardware identity comes from the supplied photos. No provider calls, deployed website, sensor readings, CAD export, enclosure fit, or application tests have been verified.
