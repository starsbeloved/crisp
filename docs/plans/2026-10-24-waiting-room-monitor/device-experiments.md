# Early Device Experiments and Stop Gates

Status: planned, not performed. Start only after implementation-plan approval and the required connection/consent authority. One existing laptop plus one existing phone is the baseline; no second computer or purchase required. A laptop alone can test enrollment, room camera, dashboard and deterministic logic, but cannot satisfy the approved rear-phone-camera + flashlight PPG acquisition requirement.

## What science does and does not establish

Contact phone PPG and facial rPPG are plausible pulse methods, not guarantees of a useful browser signal on this hardware. Published phone validation uses specific devices/algorithms and controlled conditions; it does not establish our torch compatibility or accuracy. POS is a candidate classical method with motion/illumination limitations. Torso breathing is also plausible under controlled framing; a scalar sine-wave test cannot establish that the camera sees respiration. The proposed subpixel patch method requires its own acquisition experiment, not a claim of replication of a different paper's method.

Primary sources: [prospective smartphone HR/RR study](https://www.nature.com/articles/s43856-022-00102-x), [POS paper](https://doi.org/10.1109/TBME.2016.2609282), [reference POS code](https://github.com/ubicomplab/rPPG-Toolbox/blob/main/unsupervised_methods/methods/POS_WANG.py), [webcam breathing study](https://pubmed.ncbi.nlm.nih.gov/31248200/), [MediaPipe web execution](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [camera secure-context specification](https://www.w3.org/TR/mediacapture-streams/), [torch capability specification](https://www.w3.org/TR/image-capture/). Pin the actual code/model used at build time; moving reference URLs are not reproducible runtime assets.

## Execution order after approval

Codex first creates P1-A1's minimal shell/contracts and just enough of the owned capture/model slices for the following probes. Reuse that code in its packet; do not build a second throwaway application. P1-A2 gates relevant clocks, licenses and HTTPS. UI polish may proceed independently, but broad integration should not assume these probes passed.

Use an initial 45-minute troubleshooting timebox per failed hardware probe as a planning checkpoint, not a promise of completion. At the checkpoint, record what failed and decide whether another bounded experiment is justified. Do not spend the whole hackathon polishing a path whose required sensor cannot work. No fixed completion estimate is credible until the actual available build hours and probe results are known. Reserve the final quarter of the available build session for integration/rehearsal rather than new features; revise this allocation with actual evidence.

## D1 — phone optical capture and transport (P1-B + P1-A2 + P2-A2)

- [ ] Record designated phone model, browser/version and rear-lens selection. Confirm trusted HTTPS from that phone, user permission, actual continuous torch illumination and off behavior. A reported capability alone is insufficient. Exercise denied permission, unsupported torch, background/lock and stop; never bypass TLS warnings or silently deploy/tunnel.
- [ ] Check LAN/proxy role boundary: phone can join only its paired purpose; phone cannot POST `/station` to acquire room-wide access. Same-origin proxy calls must not make every phone request look like a local operator. Integrator can bootstrap station on the laptop loopback origin and disable station creation on the LAN HTTPS origin. Confirm the station's local port/origin separately from phone's.
- [ ] Observe real derived waveform with finger on/off, settling, movement and saturation. Keep continuous eligible 30s window, stop within 60s maximum attempt, and stop on discomfort. Record achieved cadence, gap/saturation metrics and rejection reason, not only the selected BPM.
- [ ] Pair visit A → capture → save → station fresh read/reload. Retry after temporary disconnect/expired clock sync uses original capture times. Switch to visit B during A's unfinished capture; old A cannot be redirected or accepted after cancellation. A failed save remains visibly unsaved.

Go: verified compatible phone, real signal, bad-input rejection and correct-visit transport. Failure: keep contact acquisition incomplete; request an explicitly approved alternative if needed. Manual or synthetic BPM cannot satisfy it.

## D2 — single-camera geometry and combined load (P3-A/B/C/D + early P5)

- [ ] Reuse the webcam sequentially: face enrollment close-up, then room position with seated face, shoulders/chest, hips and knees visible. Keep laptop stationary during an attempt. Record resolution, camera distance and face/torso pixel sizes. Confirm enough facial detail for recognition/rPPG while enough body geometry remains for seated posture; these competing framing needs are an experiment, not an assumption.
- [ ] Run camera, identity, pose and physiological sampling together with the actual foreground dashboard. Measure decoded FPS, accepted ROI sample Hz, max gaps, inference durations, metadata ages, long tasks, video-stale delay and request-display latency. Close/suspend unnecessary IDE/browser/model workloads for the demo; record both the tested load and browser version. No second laptop is needed to run the server.
- [ ] Target actual physiological sample cadence >=15Hz, no >200ms gap in an eligible window, identity metadata <=500ms and respiratory pose metadata <=250ms. Keep the live display responsive and label any lagging channel unavailable. Slow-inference tests must show that sampling is not serialized behind 5Hz identity.
- [ ] Enroll volunteer A, test an unknown person, near crossing/occlusion/reappearance, then revalidate A. Measure false attachments and uncertainty, not just successful recognition. Confirm local source restart/hidden tab clears continuity; camera reposition resets seat geometry/reference. Do not save embeddings or raw video by default.
- [ ] Test ordinary upright reference, brief adjustment, sustained face-visible slump, standing, movement and poor landmark visibility. Slump need not alter pulse or breathing. Real posture observations must be visible before a request exists. After Mark checked, verify generation reset and a genuinely new 10s reference before rearming.

Go: one framing supports the required paths with measured compute margin and truthful rejection. Failure: try a documented framing/resolution/cadence adjustment within the same design, then re-test all affected channels. If browser processing remains infeasible, propose the spec's alternative local processing architecture for review; no silent architecture swap or removed required layer.

## D3 — extraction experiments and holdout comparisons

Separate calibration/debug attempts from evaluation. Freeze thresholds, method version, framing and lighting before three new holdout attempts per channel; include all holdout rejections. Retuning after a failure starts a new labelled evaluation set and retains the old results.

- Phone: three attempted 30s windows, target >=2/3 usable and <=5 BPM absolute error against simultaneous independent reference; timed manual pulse count is a coarse fallback reference, not ECG validation.
- Facial pulse: three attempted stationary 30s windows, target >=2/3 usable and <=10 BPM error. Also measure simultaneous phone/rPPG agreement, labelled separately; disagreement does not identify which method is wrong. With no independent reference, report acquisition/agreement only and leave accuracy unverified.
- Breathing: first inspect real subpixel torso trace under ordinary breathing versus bulk movement, low texture and brightness changes. Then three attempted 45s windows, target >=2/3 usable and <=3 breaths/min versus synchronized manual/video counts. Do not induce hyperventilation or breath-holding. Clothing/camera jitter can dominate this signal; no-texture rejection must be tested on images, not just flat scalar data.

Record interval alignment, reference uncertainty, actual signal/quality, errors and rejected/usable counts in benchmark ledger only after measurement. One volunteer cannot establish clinical validity or demographic/general-use reliability.

## D4 — complete journey with providers and speaker

Run the thin real vertical journey before final styling: create visit → enroll → questions/confirm → phone save → reposition/reset → recognize → reference → brief adjustment/no event → sustained slump/one event → visible request → grounded Gemini → ElevenLabs → acknowledge/check → fresh reference. Mock transport proves software handling only. Authorized synthetic provider calls prove provider connectivity without uploading patient/video data.

Test benign 10s bounding-box/timestamp updates during generation (must not starve the job), real location/identity change while generating and during playback, mute, acknowledgement during playback, duplicate polls, reload and provider timeout. Record Gemini valid-output count versus fallback count and TTS success/latency; fallback success alone does not prove Gemini acceptance. The app never blocks visible requests on a provider. With one laptop, the operator may stand beside the seated volunteer; a second person is useful for observer counts/identity testing, not a second computer.

Required failure remains an incomplete acceptance item. Optional seat/scenario polish may wait until this core path is proven; required physiology is not silently cut to meet a deadline.
