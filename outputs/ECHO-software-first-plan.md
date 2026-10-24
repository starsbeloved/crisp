# ECHO Software-First Implementation Plan

**Status update:** planning reference only. Idea selection is reopened; ECHO is a candidate. The user wants eventual tasks built in separate sessions, superseding the native-execution recommendation below. No build sessions should start from this document yet. The selected ECHO retention approach is compact ordinary-period summaries plus detailed marked episodes; earlier opt-in/pending wording below is superseded by that decision.

> Execution recommendation: native implementation in this workspace using the executing-plans workflow, with scoped reviews of completed modules. This document is a proposed plan; no product implementation or deployment has been completed.

**Goal:** build all ECHO software features with one human overnight, then connect sensors and the apple enclosure later on Saturday.

**Architecture:** phone motion, synthetic scenarios, recorded datasets and later hardware share a single ingestion contract. One backend owns buffering, persistence and analysis; the web interface, Gemini, speech and report use the same event records.

**Tech Stack:** React/Vite, TypeScript, Node, WSS, SQLite; Python only for an optional dataset experiment or the UNO Q collector.

**Spec:** [Software-first specification](../.plans/echo-software-spec.md). This plan supersedes the earlier four-person build allocation. Both documents await review before product implementation under the brainstorming workflow.

## Global constraints

- One human builder overnight; environmental sensors and printing arrive later Saturday, October 24.
- All seven layers remain: live sensing, manual capture, automatic capture, comparison, recognition, spoken companion, report.
- Raw buffer 600 seconds; demonstration comparison windows 30 seconds; minimum comparison coverage 80% of one-second bins per included feature.
- Sources are `live_phone`, `live_hardware`, `dataset_replay`, or `synthetic`; label mixed-source displays and separate reference profiles.
- Real ordinary-summary retention is opt-in. Saved events survive restart; unsaved in-memory history does not.
- API keys remain server-side. No live provider integration, hardware wiring, phone compatibility, trained model or deployment is assumed verified.

## Review focus

1. Partial/gapped history must show actual coverage and never silently become zero.
2. Retried or bounced captures must create one durable snapshot with one acknowledgement.
3. Synthetic or dataset signals must never be presented as live patient measurements.
4. Provider failures must preserve capture and reports with explicit feature status.
5. Reconnected phones, changed clocks and different sessions must not merge unrelated records.

## 1. What we do tonight

Build the application against a deterministic source simulator and the real phone. Simulated environmental inputs exercise the complete application now; the same channel interface accepts real sensor readings later. A development-only controller offers normal, changing-environment, reference-match, unusual-motion and disconnected scenarios. Its outputs always pass through ingestion, buffering and analysis; it never directly changes a score, saved-event state, or answer.

**First target:** launch one app, see a trace, press Mark event, and inspect pre-mark measurements. **Overnight target:** a complete software rehearsal with provider calls if account access works. These are development targets, not a guarantee that every integration finishes before dawn. Dataset training follows the complete loop and is timeboxed.

### Proposed module map

| Location | Responsibility |
|---|---|
| `packages/contracts/src/index.ts` | Shared sample/event/comparison/answer types and provenance |
| `server/src/ingest/` | Validation, source clocks, sequencing, per-session routing |
| `server/src/events/` and `server/src/storage/` | Buffer, idempotent capture, SQLite snapshots/notes |
| `server/src/analysis/` and `server/src/detection/` | Feature extraction, reference matching, motion candidates |
| `server/src/companion/` | Bounded evidence, Gemini adapter, ElevenLabs adapter |
| `web/src/phone/` | QR join, motion permission, foreground samples, manual mark |
| `web/src/dashboard/` and `web/src/report/` | Live state, replay, character, comparisons, printable report |
| `fixtures/` and `tools/replay/` | Deterministic scenarios and sourced replay adapters |
| `device/collector/` and `hardware/` | Later UNO Q adapter and measured wiring/layout notes |

### Task A — Shared ingestion and scenario replay

- [ ] Define `Sample`, `CaptureRequest`, `SavedEvent`, `ComparisonResult`, and `EvidenceAnswer` in the contracts module, including the spec's provenance and timing fields.
- [ ] Define `ingestSamples(sessionId: string, samples: Sample[]): IngestResult` and validate runtime inputs before buffer insertion. Reject invalid units/channels, deduplicate `(deviceId, bootId, seq)`, and keep session boundaries.
- [ ] Write failing ingest checks for invalid values, duplicate packets, stale/reordered packets and cross-session access, then implement the minimal path to pass them.
- [ ] Build deterministic scenario replay using that exact function. An accelerated source retains original time and a playback-speed label.
- [ ] Verify with `npm test -- ingest` once the project test command exists; expected result is all listed cases pass. Also inspect a replay in the browser with its source badge. The command is planned, not already run.

### Task B — Buffer, event persistence and basic timeline

- [ ] Define `captureEvent(sessionId: string, request: CaptureRequest): Promise<SavedEvent>`; deduplicate by request ID and acknowledge only after durable save.
- [ ] Test 600-second expiry, actual short-history bounds, an immutable snapshot after new samples arrive, duplicate capture, restart persistence and missing intervals. Use controlled clock inputs.
- [ ] Implement the event service and SQLite records, then connect a plain live chart and Mark event button.
- [ ] Verify with `npm test -- events`; then move a trace, mark it, continue streaming, restart and inspect the preserved lead-up. This is the first integrated deliverable.

### Task C — Real phone source

- [ ] Implement QR join and a Start sensing gesture with browser capability/permission status. Test on the actual phone over device-trusted HTTPS.
- [ ] Send acceleration in m/s² and rotation rate in degrees/s, with sequence and timing metadata; retain null/unsupported fields explicitly.
- [ ] Show foreground requirement, disconnects, sample gaps and actual observed rate. Rejoining does not attach old samples to a new session.
- [ ] Verify phone permission denied, unsupported sensor, reconnection and live laptop updates. Automated ingest tests cannot substitute for this real-device check.
- [ ] If HTTPS or motion is blocked, continue development using labeled replay while recording the specific phone integration gap.

### Task D — References, recognition and report

- [ ] Define `compareWindow(sessionId: string, window: WindowRef, profileId: string): ComparisonResult` using shared 30-second features, fixed scaling and the coverage rule.
- [ ] Seed synthetic event and ordinary examples. Verify match/non-match/no-difference/insufficient-data cases and ensure explanations reference the correct denominators and profile.
- [ ] Implement reference detail, live recognition and a report reading the exact stored event and comparison. Include note, placement, actual duration, sources and missing channels.
- [ ] Verify with `npm test -- analysis` and a browser walkthrough of all four states. A matching synthetic example verifies behavior, not health relevance.

### Task E — Gemini and ElevenLabs

- [ ] Define `answerQuestion(sessionId: string, eventId: string, question: string): Promise<EvidenceAnswer>`. Backend evidence includes computed comparisons and trace/window IDs; the LLM explains those facts.
- [ ] Run provider smoke tests on fabricated evidence. If access fails, record the exact failure and retain the provider-unavailable UI state.
- [ ] Test questions about a missing sensor, a period outside retained history, and a request for a diagnosis. Responses must identify limitations and retain supporting evidence references.
- [ ] Send the supported answer to ElevenLabs, play it after an allowed user interaction, and show text and playback status. Provider failure keeps the saved event and report usable.
- [ ] Verify with `npm test -- companion` for behavior and an actual API/audio check for integration. A stubbed response is labeled and does not count as provider success.

### Task F — Automatic device-motion capture

- [ ] Connect one deterministic motion-sequence detector to the same `captureEvent` operation. Configure from observed phone/bench data; record and freeze thresholds before rehearsal.
- [ ] Exercise a controlled motion sequence, a nuisance sequence, missing samples and repeated trigger packets. Verify candidate capture and duplicate suppression with `npm test -- detection`.
- [ ] Show trigger evidence and confirm/dismiss in the UI. Dataset replay can also exercise the detector, with a visible replay label.

### Task G — Finish the software experience

- [ ] Assemble the dashboard around one current event: live data, preserved window, references, companion and report. Keep provenance visible in every view that combines sources.
- [ ] Add the apple character's useful states, clear loading/saved/error feedback, readable charts, keyboard access and reduced-motion behavior.
- [ ] Run all automated checks and rehearse the full script in Section 4. Record actual successes and gaps. No separate test suite is needed merely to assert decorative choices.
- [ ] Prepare local run instructions, environment-variable names without credentials, a synthetic demo reset, source attribution and an AI-use disclosure draft.

## 2. Later Saturday: attach hardware

- [ ] Identify compatible light and temperature/humidity modules and cables before buying. Do not add a gas sensor without an identified output and warm-up plan.
- [ ] Wire the confirmed UNO Q button and run the documented MCU/Bridge/Linux collector path. Its HTTPS ingestion uses the existing sample contract; the physical mark uses the same capture service.
- [ ] Replace each synthetic channel with a verified live channel one at a time. Verify the reading and units; remove that channel's simulation badge only after the source really changes.
- [ ] Measure the board, cables and modules; design the apple enclosure with button access, USB clearance and vents. Confirm print access early and perform a fit check. Keep a functional open-board version if packaging fails.
- [ ] Prepare the Vultr deployment configuration with HTTPS/WSS and persistent SQLite storage. Deploy when the specific external action is requested/authorized; no cloud resources are created by this plan.

## 3. Public data and what it can improve

ECHO has separate analytical jobs. A motion detector/classifier can use external labeled motion data. Personal reference matching needs compatible context and event/ordinary records. Gemini already supplies language understanding; we do not need to train it for the demo.

| Dataset | Verified relevance | Recommendation and limits |
|---|---|---|
| **UCI smartphone activities + postural transitions, dataset 341** | Raw accelerometer and gyroscope at 50 Hz, 30 participants, ordinary activities and posture transitions; CC BY 4.0 | First motion replay/evaluation source. It has no fall labels; it cannot train a fall classifier by itself. Approximately 75.9 MB download listed. |
| **mBrain21 public excerpt** | Public data card lists four participants; wearable data, phone motion/light and headache/questionnaire labels; CC BY-NC-SA 4.0 | Most relevant exploratory headache/context replay. Inspect available files, terms, coverage and sensor placement before use. Four participants cannot establish a general headache predictor. No files have been downloaded or parsed. |
| **UniMiB SHAR** | Authors describe smartphone acceleration for daily activities and falls | Candidate fall-motion experiment. Official download page was inaccessible in this research pass; confirm access and license before committing time. No claim that our detector was trained or validated on it. |

**Model experiment, after the full loop works:**

1. Keep a transparent rule baseline. Use UCI ordinary movements to inspect false triggers and build an optional activity-context classifier.
2. For a fall classifier, obtain a dataset with actual fall labels; UCI 341 alone is insufficient.
3. Match observed phone sampling, gravity treatment, placement, and units. UCI acceleration is in g and gyroscope in radians/s; normalize to the live pipeline. Upsampling does not recover missing information.
4. Split by participant, fit scaling only on training participants, keep test subjects untouched, and report per-class recall/F1 and confusion counts. Overlapping windows from one participant must not leak across train/test.
5. Separately record ordinary movements on the actual phone to check transfer. Never induce a human fall for calibration. Dataset performance is distinct from actual-phone results.
6. Stop the experiment after 60–90 active minutes if it does not improve the demonstrated feature. Keep the functioning baseline and state what was evaluated.

A research replay uses its own participant profile, original annotation times, source citation and playback label. It never becomes the current user's history. Keep downloaded patient records local by default; use synthetic evidence for cloud provider demonstrations until an appropriate data-use decision is made. Public availability does not remove data-license conditions.

## 4. How to show the complete demo

Prepare two modes: **Live demonstration** with actual phone and ready hardware, and **Replay demonstration** with a clearly named dataset or synthetic scenario. Both execute the same software path. A prerecorded video is a third, explicitly recorded backup.

Before judging, open the laptop dashboard, connect the phone, start collecting, confirm audio, load the labeled reference profile and verify the report route. If ten minutes have not accumulated, show the shorter actual interval. Use a 30-second trailing comparison window so recognition can visibly change within the slot.

| Time | Action |
|---|---|
| 0:00–0:20 | “When a headache arrives, remembering the lead-up is hard. ECHO preserves the context.” Show apple or actual control. |
| 0:20–0:50 | Show real phone motion plus available environmental channels. Explain each source badge briefly. |
| 0:50–1:20 | Change a verified input; show familiar reference conditions, the measured differences and a return to non-match. |
| 1:20–2:00 | Press apple, or the visibly identified phone button if hardware remains unavailable. Replay the preceding window and add a self-reported label. |
| 2:00–2:50 | Ask what changed; Gemini explains the saved evidence and ElevenLabs speaks it. |
| 2:50–3:25 | Run the pretested controlled motion sequence; automatic candidate appears with its evidence. |
| 3:25–4:00 | Open the same event's report. |
| 4:00–4:30 | Explain the actual implementation, sponsor calls and what was learned. |
| 4:30–5:00 | Leave room for questions or shorten the preceding segments if the slot includes Q&A. |

The five-minute live slot comes from the supplied organizer brief. Reconfirm its Q&A allocation and logistics onsite. Demonstrate what works even if an integration is incomplete, as encouraged by the official rules.

## 5. Submission: verified requirements and practical process

The official Devpost overview and rules were read in the browser during this revision. The overview displays October 25, 06:00 PDT, equivalent to **Sunday, October 25, 2026, 09:00 EDT** in New York. Aim for an 08:00 EDT completed submission.

The rules explicitly require public code and say code/video must remain public for prize eligibility. They permit AI assistance with transparent disclosure and encourage demonstrating the actual build. The supplied organizer brief additionally reports a required GitHub repository, approximately three-minute recommended video, in-person check-in and Sunday judging logistics; those organizer-specific details were not re-audited in Discord this turn. The public rules contain a stale eligibility-date reference, so use specific current organizer clarifications for conflicts.

Practical checklist, with external actions performed only when requested/authorized:

- [ ] Open the [event Devpost](https://sbuhacks-2026.devpost.com/), join/register if needed, and open My projects to create the event submission. No submission form was created or submitted during this research.
- [ ] Enter the actual contributing roster; working alone tonight does not automatically change the registered team.
- [ ] Prepare name, short description, project story, actual stack, screenshots, source link, video link and any demo URL. Exact required form fields and category controls still need inspection in the submission flow.
- [ ] Explain inspiration, what it does, how it was built, challenges, accomplishments, learning and next steps. Identify live, replayed and simulated elements; cite datasets and AI tools.
- [ ] Record a concise screen-and-device walkthrough. Show interaction and results. Roughly three minutes is a recommendation from the supplied organizer brief, not a verified hard limit on the public rules page.
- [ ] Verify public repository and video links in a signed-out browser. A working website link is useful; its being universally mandatory was not established by the reviewed rules.
- [ ] Select relevant available categories and any sponsor-specific requirements. Gemini and ElevenLabs require functioning product integrations; Vultr requires actual use. Adding logos is insufficient. One-prize scope remains unresolved in the supplied brief.
- [ ] Complete the final submit action before the deadline, then confirm the project is listed as submitted rather than only saved as a draft.
- [ ] Confirm in-person check-in and live judging location/time with organizers. The supplied brief lists SAC Ballroom A, Sunday 10:30–13:00; do not treat a Devpost draft as completion of onsite requirements.

## 6. Sources and verification status

- [Official event overview](https://sbuhacks-2026.devpost.com/) and [rules](https://sbuhacks-2026.devpost.com/rules), read through the browser after the web text reader failed.
- User-supplied `SBUHacks_2026_AI_Brainstorming_Brief.md` for organizer Q&A, five-minute demo, recommended video length and onsite logistics.
- [UCI dataset 341](https://archive.ics.uci.edu/dataset/341/smartphone+based+recognition+of+human+activities+and+postural+transitions).
- [mBrain21 data card](https://www.kaggle.com/datasets/jonvdrdo/mbrain21/data), read through the browser; [authors' data-quality paper](https://www.nature.com/articles/s41598-024-67767-3) and [authors' repository](https://github.com/predict-idlab/data-quality-challenges-wearables). Repository license and dataset license are separate; the data card lists CC BY-NC-SA 4.0.
- [UniMiB SHAR authors' paper](https://arxiv.org/abs/1611.07688). Dataset download/license not verified in this pass.

Premature implementation drafts were also created before the user clarified planning-only scope. They are preserved but unapproved; no runnable application or passing overall suite is verified. No datasets have been downloaded, models trained, provider integrations verified, public records created, resources deployed or submissions made.
