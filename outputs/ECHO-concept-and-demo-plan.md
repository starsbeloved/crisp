# ECHO — Consolidated Concept, Challenges, and Demo Plan

Working draft · October 24, 2026 · America/New_York

**Current execution plan:** [ECHO-software-first-plan.md](ECHO-software-first-plan.md) reflects solo overnight software work, later sensor/printing access, public-data options and verified submission requirements.

**Updated delivery plan:** [ECHO-build-plan.md](ECHO-build-plan.md) incorporates the confirmed UNO Q, selected phone motion feed, apple enclosure, intended Vultr hosting, and complete demonstration sequence. Its architecture and build order supersede the earlier proposed baseline below; the concept critique remains relevant.

Status: planning only. No application, firmware, account, deployment, or sensor integration has been implemented or tested. This document consolidates the supplied ECHO proposal and the discussion; recommendations are identified as proposals rather than decisions silently attributed to the team.

## 1. What is agreed

- Build a health project with a memorable physical interaction and a real measurement loop.
- Four-person team, using AI coding tools heavily. Hardware experience is limited.
- Gemini and ElevenLabs must do useful work in the demonstrated product.
- Available hardware was described as an Arduino, touch sensor, moisture sensor, rotary control, Raspberry Pi, speaker, phones and laptops. Exact models, sensor capabilities, connectivity and API access are unverified. An ESP32, environmental gas sensor, IMU and Apple Watch are not confirmed.
- **All three proposed promises must appear in the demo:** manual context capture, recognition of familiar conditions, and automatic event capture. A spoken explanation and event report complete the loop. This preserves the user's explicit response that everything should be demonstrated.
- The original proposal makes Apple Watch and other expansion features optional. Their presence in the vision does not establish available hardware.

## 2. Consolidated idea

**Pitch:** ECHO is a personal health black box: mark when you feel different, recover the measured context leading up to that moment, compare earlier episodes, and ask a companion to explain the evidence.

**Proposed first user:** someone with recurring, self-reported headache episodes who struggles to remember the surrounding circumstances. “Headache” is a user-supplied label, not a diagnosis inferred by ECHO. The software should allow a generic event marker before the user adds a label.

**Core question:** “What did this device measure before I marked this event, and how does that compare with other recorded periods?”

**Proposed product hypothesis:** automatic context capture could reduce the effort and recall burden of keeping a useful event journal. Whether people will wear it, find the measurements useful, or pay for it is unvalidated. Clinical utility and health outcomes are also unvalidated.

The full vision remains remember → compare → recognize → explain. The weekend build demonstrates the engineering and interaction across that loop. It cannot establish that the selected signals predict headaches or identify their causes.

## 3. The hardest challenges

### A. The product could become a room monitor with a chatbot

Peel has a visible measurement process applied to a physical sample. ECHO measures surrounding conditions and must connect them to a person's experience. That connection is the difficult, unproven part.

The strongest demonstration is an evidence chain: a judge changes a real sensor, presses a real control, sees the earlier trace preserved, and asks a question whose answer points to those exact measurements. A rising percentage based on invented history cannot carry the technical claim.

### B. Event counts alone are weak evidence

“Bright conditions before 4 of 5 events” is not informative if bright conditions also appear in 4 of 5 ordinary periods. Compare event windows against appropriate ordinary windows from the same profile, with the denominator and missingness visible. “Ordinary” means no event was reported, not proof that no symptom occurred.

Do not describe a sensor as an important health factor merely because it closely matches a reference. Similarity, differences between groups, predictive performance, and causation are separate questions.

### C. A similarity percentage invites the wrong interpretation

Mapping a distance to 86% does not calibrate a medical probability or confidence. Proposed main UI: show “familiar reference conditions,” the closest reference windows, measured differences and comparison coverage. A numeric distance may appear in a technical detail view, with its definition.

Preserve live recognition in the demo. Include a deliberately non-matching case and an insufficient-data state so recognition is not an always-on animation.

### D. The storage policy conflicts with the learning promise

If all non-event data expires after ten minutes, there is no historical ordinary-window denominator. Proposed resolution:

- Keep non-event raw readings only in the rolling buffer.
- Explicitly offer retention of compact, time-stamped ordinary-window summaries for comparison.
- Preserve event-window raw readings when the user marks an event.
- Keep synthetic demonstration history in its own profile.
- If summary retention is disabled, continue capture/reporting and explain that historical event-versus-ordinary comparison is unavailable.

Those summaries are still personal data. They must appear in the retention explanation. No production retention duration or cloud storage policy has been agreed.

### E. Sensor identity and placement determine what we can say

A soil-moisture probe is not an ambient-humidity sensor. A rotary control can inject a test value, but cannot serve as measured VOC. A light-dependent resistor can provide relative light readings without automatically supporting lux. Consumer microphone amplitude is not calibrated sound-pressure level.

A VOC index is sensor-specific. Sensirion's index is relative to recent history and cannot identify particular compounds or stand in for measured CO₂. Exact interpretation must follow the actual sensor's documentation.

A device hanging from a stationary bag does not show whether the person is sedentary. A light sensor on a clip measures light at that clip, not retinal exposure. Use labels such as “device movement” and “light at device.” Fix the demo placement and display it.

### F. A moving or dropped device is not a verified human fall

The automatic-event demonstration remains required. Build a motion-sequence detector and show it triggering a saved window during a safe, controlled bench sequence. Describe the result as a “fall-like device-motion event.” Do not claim that the prototype identified fainting or validated real-world fall detection. Do not ask someone to fall for the demonstration.

### G. The time horizon is unresolved

Ten minutes is a technical retention choice, not an established medically useful lead-up interval. The supplied report also describes thirty-minute history and forty-five-minute inactivity, which a ten-minute buffer cannot provide by itself. Display actual retained coverage and avoid invented longer histories.

Store the time of marking separately from the user's optional estimated symptom onset. If onset is unknown, label the trace “before the event was marked.”

### H. The category already has competitors

Bearable supports symptom/factor comparisons; Migraine Buddy offers event and weather-related reports. ECHO's proposed distinction is directly measured local context, a physical event marker, pre-mark replay and explanations tied to specific evidence. This is a positioning hypothesis, not a claim that no competitor has these capabilities.

## 4. Approaches considered

| Approach | Strength | Limitation | Treatment |
|---|---|---|---|
| Wireless all-in-one clip with all sensors and local storage | Closest to the eventual product | Board, battery, radio and sensors unconfirmed; large integration load | Conditional upgrade after a working full loop |
| Tethered clip/control board, laptop buffer and web interface | Fastest route to real sensors, event capture and all analysis layers | Requires a laptop and cable; not an autonomous wearable | **Recommended baseline** |
| Phone-only foreground sensor session | Uses available devices and can show motion capture | Environmental sensing is limited; background behavior and hardware-category eligibility unresolved | Explicit fallback if physical integration fails |

The choice concerns implementation risk; every route is expected to demonstrate the agreed layers. A phone-only fallback cannot honestly reproduce environmental channels it does not measure.

## 5. Demo contract: all layers in one session

### 1. Live monitoring and manual capture

Show a real device stream, timestamps, connection state and per-channel units. Change light or another verified sensor while the trace is visible. Press the physical event control. After successful persistence, show an acknowledgement, freeze the actual preceding history, and optionally add a note.

Show the number of seconds actually captured. A short session must not announce “ten minutes saved.” The buffer target is ten minutes; the live demonstration uses an explicitly configured thirty-second analysis window. Reference windows used for that demonstration must use the same duration and feature definitions.

### 2. Automatic capture

Run a predetermined, safe device-motion sequence. The detector marks a candidate, preserves the prior window and exposes the measurements that crossed its criteria. Test a nuisance movement that should not trigger it. Display “fall-like device-motion event,” with a dismiss/confirm control.

This requires a working IMU or a confirmed foreground phone-motion feed. If neither is available, this requirement is blocked; a pre-recorded replay can explain the algorithm but must not be presented as a live automatic detection.

### 3. Historical comparison and live recognition

Switch explicitly to a **synthetic demo profile** containing marked-event and ordinary windows. Show both denominators. Compare a live trace against the synthetic reference profile only under a persistent “live measurements + synthetic reference history” label.

Manipulate the same real channels used by the reference features. Recognition should enter and leave its configured match state and identify the channels used. Thresholds and feature definitions must be fixed before rehearsal, not changed to force a desired result mid-demo.

The language must say that the live trace resembles the demo references. It must not call the synthetic references the wearer's actual health history. An event captured in the live profile remains real measured data, with a user-supplied symptom label if present.

### 4. Companion and report

Ask “What changed before that event?” and “Was that unusual compared with the ordinary periods?” Gemini retrieves the corresponding data through bounded tools; the backend computes comparisons. ElevenLabs speaks the supported answer. Each material answer links to a trace, interval or computed comparison.

Generate a single event-context report containing the label, marking/onset information, actual window, sensor placement, readings, missingness, source provenance, historical comparison and supported summary.

## 6. Required depth and conditional channels

| Capability | Requirement |
|---|---|
| Real signal ingestion | Required; identify and test exact hardware first |
| Physical manual event control and acknowledgement | Required target; touch control or button depends on identified board |
| Rolling buffer and saved event replay | Required |
| Automatic motion event capture | Required; real motion source is a dependency |
| Historical comparison and live reference recognition | Required; synthetic-history provenance always visible |
| Gemini evidence questions and ElevenLabs spoken answers | Required; successful provider tests remain a dependency |
| Context report | Required |
| Light, temperature and humidity | Target environmental channels, conditional on actual sensors |
| VOC | Conditional on an identified, supported sensor and adequate stabilization; otherwise visibly unavailable |
| Noise | Optional derived amplitude channel; do not label dB SPL without calibration |
| Apple Watch heart rate | Optional as in the original proposal; native permissions and setup need a separate decision |
| Battery-powered standalone operation, polished enclosure | Upgrade after integration works |
| Location, maps, several symptom profiles, proactive health advice | Later expansion; unnecessary to demonstrate the agreed promises |

“Everything in the demo” does not make unavailable data measured. Missing channels remain missing; synthetic test inputs are visibly synthetic.

## 7. Proposed technical structure

```text
Sensor board + physical event control
                    |
                 USB serial
                    v
       Local collector / backend <--- optional foreground phone motion
                    |
       normalize + time-align + quality flags
                    |
       rolling buffer + motion-sequence detector
                    |
           saved event + ordinary summaries
                    |
          deterministic comparison engine
                    |
             web timeline / report
                    |
          Gemini bounded evidence tools
                    |
         validated answer --> ElevenLabs
```

Proposed stack: TypeScript, React/Vite web client, Node backend/serial bridge, SQLite for saved events, ordinary summaries and demo fixtures. A local host can run the whole loop; deployment is a later, separately authorized step. Use a live-stream transport such as server-sent events for browser updates. Confirm SDK and library versions when implementing.

The collector owns the buffer in the recommended tethered build. This avoids assuming that a small Arduino has enough memory for ten minutes of high-rate IMU samples. Proposed rates: environmental samples around 1 Hz, motion around 25 Hz, with one-second motion summaries retaining impact peaks. Confirm rates from actual hardware. Expose sampling configuration and missed samples.

A backend restart loses unpreserved in-memory history; show the new monitoring start time. Saved events must survive restart. The device may indicate a pending capture immediately, but “saved” feedback follows durable acknowledgement.

### Component responsibilities

- **Acquisition:** sensor drivers, button debounce, boot/session identity, sequence numbers and connection status.
- **Collector:** unit conversion, timestamps, quality metadata, ring buffer and bounded reconnect handling.
- **Event service:** idempotent capture, immutable snapshot, optional note, onset estimate and durable acknowledgement.
- **Motion detector:** explicit state sequence, candidate event, suppression of duplicate triggers and visible evidence.
- **Comparison engine:** versioned features, baseline normalization, reference selection, coverage checks and per-channel differences.
- **Companion:** retrieves evidence and explains it; never supplies missing measurements.
- **Interface:** live state, event replay, comparison, conversation and printable report using the same records.

### Minimum data contract

Every observation needs device/session identity, a sequence number, source time or monotonic device time, received time, channel name, value, unit and quality. Every report must retain measurement provenance: live, recorded replay or synthetic. A calibrated conversion is distinct from an arbitrary raw reading.

Every event needs marking time, optional onset estimate and uncertainty, capture method, user label, requested/actual window bounds, available channels, coverage, device placement and linked samples. Capture method and data provenance are separate fields: an automatic event can still be synthetic during a test.

Every comparison needs the profile, event/reference IDs, ordinary-window selection, analysis duration, feature/baseline version, channels used, coverage and result. Avoid aggregating overlapping event windows as independent episodes.

## 8. Minimum credible comparison engine

1. Use comparable fixed-duration windows. Never compare a thirty-second live feature against a ten-minute historical feature as if their meaning were identical.
2. Compute a small set of interpretable features from verified channels: mean light, light change, mean temperature and one-second device-motion summaries, for example. Do not infer a forty-five-minute human activity history from them.
3. Define normalization from ordinary/baseline periods, independently of the event examples being compared. Retain the normalization version; handle zero-variance features explicitly.
4. Use transparent distance over the same channels with fixed weights. Avoid letting several correlated variants of one sensor dominate the calculation.
5. Keep ordinary reference windows as well as event windows. Exclude overlapping event periods and document selection. Counts are descriptive, not independent clinical evidence.
6. Missing readings remain missing. Show per-channel coverage and withhold results below the coverage rule selected during the sensor feasibility checkpoint. A sensor disconnect is never a zero reading.
7. Distinguish “these values look similar” from “this factor differs between marked and ordinary windows.” Show the actual values and windows supporting either statement.
8. Include a no-match case, an ordinary-reference match, and an insufficient-data case. With synthetic data these validate the software's behavior, not health relevance.

No external clinical dataset is required to demonstrate the capture/analysis machinery. It would be misleading to treat another person's dataset as this wearer's learned history, or validate a clip sensor using unrelated clinical signals.

## 9. Gemini, ElevenLabs and failure behavior

Gemini should choose among read-only evidence operations: retrieve an event, inspect a time interval, compare specified events, and inspect comparison coverage. The backend owns arithmetic and matching. Answers should distinguish measured observations, user statements and descriptive comparisons, with evidence references.

ElevenLabs speaks capture acknowledgements and answers. Text remains visible. Optional push-to-talk can use its transcription API if tested; button/text input must still work. Raw conversations are not continuously recorded. Prototype cloud requests should use synthetic or explicitly consented demo material and omit identifiers unnecessary to the answer.

When either provider is unavailable, capture and reporting continue. Show a deterministic factual summary or text-only answer with a provider-unavailable state. Do not play prerecorded audio while implying that a new provider request succeeded.

The MVP does not provide treatment instructions or automatic “get fresh air” advice based on a generic gas reading. It can state what changed, what is missing and what resembles the selected references.

## 10. Phased delivery plan and four-person ownership

Times are planning targets, not completion claims. At preparation, approximately 03:00 EDT Saturday October 24, about thirty hours remained until the brief's Sunday 09:00 EDT deadline. Recheck current organizer announcements before submission.

| Phase | Concrete work | Exit evidence | Ownership |
|---|---|---|---|
| **0. Dependency checkpoint — first 60–90 minutes** | Identify exact boards/sensors, inspect pin voltage/power requirements, obtain one real stream and button event, confirm motion source, test Gemini and ElevenLabs with non-sensitive input | Actual values with units/raw labels; button receipt; motion samples; provider success/failure recorded | Hardware lead + integration lead |
| **1. One complete capture loop — next 3–4 hours** | Collector, thirty-second demo window/ten-minute buffer configuration, event persistence, saved timeline, acknowledgement and basic UI | Real sensor change survives in an event snapshot after the live trace moves on; saved event survives restart | Hardware, backend and UI leads together |
| **2. Automatic capture — parallel after data contract is fixed** | Motion state sequence, quality checks, duplicate suppression, candidate review | Safe bench sequence captures earlier data; nuisance-motion counterexample shown | Hardware + backend leads |
| **3. History and recognition — next 3–4 hours** | Synthetic event/ordinary profile, feature extraction, baseline/versioning, deterministic comparison and live reference state | Matching, non-matching and missing-data scenarios; provenance labels in every relevant view | Analysis lead + UI lead |
| **4. Companion and report — next 2–3 hours** | Gemini evidence tools, supported summaries, ElevenLabs output, context report | Questions produce evidence-linked answers; numbers agree with stored measurements; provider failure does not block capture | Integration lead + UI lead |
| **5. Full demo integration — target Saturday 18:00 EDT** | Connect every required layer in a single running session; check reset/reconnect and source labels | An uninterrupted complete rehearsal with all four demonstration segments | Whole team |
| **6. Freeze and presentation — target Saturday 20:00 EDT onward** | Fix reliability issues, improve clarity/accessibility, add restrained character states, record video, prepare public submission assets | Repeatable five-minute demo, shorter version and clearly labeled backup recording | Whole team |
| **7. Submission — target Sunday 08:00 EDT** | Verify repository/video access, AI contribution disclosure, selected categories and final links | Submission complete before 09:00 deadline, leaving contingency time | Named submission owner |

Four workstreams: (1) hardware/acquisition, (2) buffer/events/motion, (3) comparisons/Gemini/voice, (4) interface/report/presentation. Assign one integration owner and one submission owner explicitly. Do not have several agents edit the shared schema concurrently. Agree on a small synthetic sample contract before parallel work. Integrate continuously rather than meeting only at the end.

The cut boundary preserves all agreed demo layers. Cut extra channels, additional symptom profiles, native Watch work, maps, wireless packaging and decorative pages first. If a required dependency fails, record the failed requirement and choose a narrower honest mode; do not silently replace its measurements with synthetic data.

## 11. Five-minute demonstration

| Time | Action and evidence |
|---|---|
| 0:00–0:20 | Explain the recall problem and show the physical event control. Have monitoring running beforehand. |
| 0:20–1:10 | Change a real sensor, press the button, and inspect the preserved lead-up and actual coverage. |
| 1:10–1:50 | Perform the safe bench motion sequence; show automatic capture and what triggered it. |
| 1:50–3:00 | Open the labeled synthetic reference profile; show an ordinary comparison, live resemblance change, and a non-match. |
| 3:00–4:00 | Ask a specific evidence question; Gemini retrieves the record and ElevenLabs speaks the supported answer. |
| 4:00–4:30 | Open the event-context report with units, trace evidence, coverage and provenance. |
| 4:30–5:00 | State what was built, the hardest technical issue and what remains unvalidated; allow questions if the slot includes them. |

Rehearse a shorter version because Q&A allocation is unresolved. Record the actual build; label playback as playback. Do not induce symptoms, expose people to fumes or perform a human fall to create a demonstration event.

## 12. Verification that matters

- Compare displayed raw readings with the hardware output. Confirm units, sensor placement and missing/stale states.
- Prove the event contains earlier samples, rather than starting recording at the button press.
- Confirm a button bounce or retried capture creates one event and only acknowledges successful persistence.
- Confirm partial history reports its actual duration, and readings older than the buffer limit expire.
- Disconnect a sensor and restart the collector: missingness and session boundaries remain visible; saved events remain accessible.
- Demonstrate both the automatic motion sequence and a non-triggering nuisance sequence. This evaluates the scripted detector, not clinical fall-detection performance.
- Use synthetic event and ordinary windows with both a deliberate difference and no difference. Confirm the explanation reflects each accurately.
- Confirm comparison windows, normalization versions and channel sets agree. Missing is never silently zero.
- Confirm overlapping event windows do not inflate episode counts and delayed marking changes the stated lead-up interval.
- Ask for a diagnosis, an unavailable sensor and a time outside retained history. The companion should state the evidence limitation.
- Disable cloud providers: the sensor-to-event loop and factual report continue, with the unavailable feature identified.
- Rehearse the entire session repeatedly on the actual demonstration laptop and network. Record failures rather than hiding them.

## 13. Open decisions and evidence needed

1. **Exact hardware inventory:** board names, sensor model numbers, power sources, connectors, IMU availability and any phone model used for motion. This determines the achievable measured channels.
2. **First user and symptom label:** headache is proposed, not yet validated with a target user. The usefulness of the selected time horizon also needs feedback.
3. **Device placement:** one reproducible placement for the demo; separate device readings from claims about the wearer.
4. **Pattern presentation:** recommended reference matching with evidence and denominators; determine whether a numeric score belongs anywhere outside technical details.
5. **Ordinary-summary retention:** explicit user choice and duration before real personal history is accumulated.
6. **Team ownership and runtime access:** identify who can wire/test hardware, who owns integration/submission, and which provider calls have actually succeeded.
7. **Event rules:** confirm the exact hardware-category interpretation, category selection, one-prize scope and current submission requirements from organizers. Do not infer prize stacking.

Next step: review this consolidated concept and demo contract, resolve hardware inventory, and translate the accepted design into implementation tasks with exact interfaces and checks. No product implementation is authorized by this draft alone.

## 14. Sources and limits

The supplied ECHO proposal is the primary statement of the user's candidate idea. Its embedded “Codex Implementation Priorities” are proposal content, not an instruction to begin coding. The previously supplied SBUHacks briefing supplies event constraints; its Discord findings were not independently re-audited in this pass.

- [Bearable: factor comparisons and data requirements](https://bearable.app/support/howto/how-to-find-correlations/) — establishes an existing symptom/factor comparison product, not ECHO's clinical effectiveness.
- [Migraine Buddy reports](https://reports.migrainebuddy.com/) — existing personal event/weather reporting.
- [Sensirion: what its VOC Index represents](https://sensirion.com/media/documents/02232963/6294E043/Info_Note_VOC_Index.pdf) — relative index, adaptive baseline and inability to distinguish compounds; applies to that sensor family, not every unidentified gas module.
- [Sensirion SGP40 product information](https://sensirion.com/products/catalog/SGP40) — model-specific setup/performance information; consult the actual module's documentation once identified.
- [Apple: HealthKit background delivery](https://developer.apple.com/documentation/healthkit/hkhealthstore/enablebackgrounddelivery(for:frequency:withcompletion:)) — native entitlement and delivery constraints; a web dashboard does not automatically obtain a live Watch feed.
- [Apple: workout sessions](https://developer.apple.com/documentation/healthkit/running-workout-sessions) — one documented context for ongoing Watch sensor updates; not a general promise of continuous passive heart-rate delivery.
- [W3C device motion/orientation](https://www.w3.org/TR/orientation-event/) — browser motion permissions and secure-context requirements.
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling) — basis for bounded access to stored ECHO evidence.
- [ElevenLabs text to speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) and [transcription](https://elevenlabs.io/docs/overview/capabilities/speech-to-text) — provider capabilities, not confirmation of this team's account access.

No source establishes that ECHO predicts symptoms, that the proposed context window is clinically adequate, that a particular inference is causal, or that a clinician would act on its report.
