# Independent Plan Review and Resolution Record

Date: 2026-10-24. Reviewed against the approved spec and actual workspace, not against the plan author's intent. This record preserves the defects found in the pre-revision plan; linked sections now contain their proposed corrections. **All corrections below change implementation planning only. The approved spec is unchanged.** No product code, device experiment or provider implementation is completed by this revision. No subagents used for this revision.

Severity: P1 = breaks a required journey/safety or association invariant; P2 = materially weakens delivery, proof or handoff. “Resolved” means the planning contradiction has a concrete correction and owning test, not that running software has been fixed.

## Confirmed defects and corrections

### R1 — P1: posture/activity cannot reach the dashboard

**Location:** [contracts.md](contracts.md), Types / RoomSnapshot and Presentation contract / PatientView; [packet 12](tasks/12-integration-and-validation.md), P5-A2.

**Evidence/failure:** Original snapshot listed measurements but no poses; Measurement only represented pulse/breathing, and PatientView had no posture/activity/reference fields. A patient could move for minutes without a request while staff saw no activity context, failing AC-07.

**Smallest correction:** add latest pose/reference state to RoomSnapshot and PoseView to PatientView; map freshness/reasons and render without requiring an alert. Add postureWithoutRequestRoom and checkedRearmingRoom tests. Also expose original answers and request interval/evidence/action state rather than hoping UI authors infer them. Implementation only; resolved in contracts, packets 01/03/07/12 and UI plan.

### R2 — P1: marking checked cannot reset the browser's reference

**Location:** [packet 03](tasks/03-backend.md) P2-B3; [packet 07](tasks/07-pose.md) P3-B2; contracts public functions and check route.

**Evidence/failure:** Server owned checked/rearm while browser owned reference features; no reset message/function/generation existed. A checked slumped person could immediately rearm from the old reference or delayed old-ready poses.

**Smallest correction:** server ReferenceControl generation in check response/snapshot, resetPoseReference on generation/epoch change, reject old generation; round-trip test must collect a genuinely new 10s reference. Implementation only; resolved in contracts and packets 03/07/12.

### R3 — P1: the serialized frame pipeline contradicts required sampling

**Location:** contracts Exact public functions (original ordered raw → identity → same-frame pose → physiology); [packet 06](tasks/06-camera-identity.md) P3-A1; [packet 08](tasks/08-rppg.md) P3-C1.

**Evidence/failure:** Identity target 5Hz and pose 10Hz cannot gate every physiological sample while rPPG requires >=15Hz. Mutable CanvasImageSource could also be sampled after it advances. MediaPipe's web guide confirms its inference calls block synchronously; a Promise wrapper alone does not make them non-blocking. [Primary guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js).

**Smallest correction:** one integrator-owned capture scheduler, independent sampling, worker inference, bounded stamped metadata, explicit bitmap lifetime and fail-closed quality. Slow-inference and disposed/reused-frame tests, then actual combined-load D2. Implementation only; resolved in contracts and packets 01/06/07/12. Achievable FPS remains uncertain.

### R4 — P1: binding times/order cannot prove window association

**Location:** contracts Clock / epoch invariants and POST /bindings; packet 03 P2-B1.

**Evidence/failure:** Bindings had times but the route carried no source/run/seq/sync envelope. Measurements used aligned clocks. A delayed matched binding after an uncertainty packet could attach a window to the wrong epoch or use a different clock domain.

**Smallest correction:** clocked BindingBatch with full-snapshot loss semantics, nested-time alignment, retired-run/old-seq rejection, heartbeat expiry and uncertainty-aware interval containment. Test skew, delayed old match, loss without packet and boundary-crossing windows. Implementation only; resolved in contracts and packets 01/03/06.

### R5 — P1: independent channels share an undefined sequence allocator

**Location:** contracts Clock / epoch invariants; packets 03/07/08/09.

**Evidence/failure:** Original dedup was per source/run, while independent pose/pulse/breathing producers had no common allocation protocol. All can produce seq=1, causing valid readings to be silently treated as duplicates; slow DSP can arrive behind newer pose time.

**Smallest correction:** one producer/allocator per explicit streamId, ordering by measurement end or instantaneous observation time, conflict detection and serialized per-stream transport. Test interleaved channels and overlapping windows. Implementation only; resolved in contracts and packet 03, with scheduler ownership in 01/12.

### R6 — P1: quality tests demand information absent from estimator inputs

**Location:** contracts TimedRGB/ScalarSample; [packet 02](tasks/02-phone-ppg.md) P1-B2; packet 08 P3-C1; [packet 09](tasks/09-breathing.md) P3-D1.

**Evidence/failure:** RGB estimator tests asked for identity/head-motion rejection; scalar breathing tests asked for texture/identity rejection. Those inputs contained neither. “Peak/noise >=3” and aggregate saturation lacked reproducible definitions. Integer patch shifts could yield a flat trace for real subpixel breathing despite perfect sine-wave tests.

**Smallest correction:** separate capture/image/runtime/DSP tests and interfaces; define normalized channel saturation, power ratio and time-normalized motion units. Specify subpixel patch extraction, image-quality gates and ROI-jitter controls as an experimental candidate. Real no-finger/illumination/chest controls remain compulsory. Implementation only; resolved in contracts and packets 02/08/09; actual signal usefulness remains D1/D3 uncertainty.

### R7 — P2: acceptance dependencies are circular and defer the real journey

**Location:** packet 12 Dependencies / P5-A; packets 08 P3-C2, 09 P3-D2 and 10 P4-B2; master Initial schedule.

**Evidence/failure:** P5 waited for relevant packet acceptance, but packets required P5 staff rendering to pass. Teams could finish mocks individually and never have a concrete point when integration is allowed to start.

**Smallest correction:** module-ready → integrated → device/provider-validated statuses, early thin real containers, and device probes before broad polish. P5 consumes module-ready outputs; final acceptance still requires all required live paths. Implementation only; resolved throughout schedule/handoffs and relevant packets.

### R8 — P1: provider invalidation can starve speech, and active sound cannot be cancelled

**Location:** packet 03 P2-B3; [packet 10](tasks/10-gemini.md) P4-B1; [packet 11](tasks/11-voice.md) P4-C2.

**Evidence/failure:** “Binding change” invalidated snapshotVersion, including routine bounds/timestamps, so a multi-second job could always become obsolete. playAudio had no signal/stop contract, despite requiring cancellation after a patient moves or staff acknowledges.

**Smallest correction:** semantic eligibility/context versioning, frozen evidence intervals, cancellable playback adapter, local immediate and <=1s remote invalidation, and started-event dedup across retries/reload in the single station. Test benign tracking during generation plus actual mid-playback cancellation. Implementation only; resolved in contracts and packets 03/10/11/12. At-most-once automatic playback explicitly does not guarantee delivery after a crash.

### R9 — P2: file ownership and presentation prerequisites are not independent

**Location:** packets 02/08/09 Scope boundary (same device-proof.md); packets 02/12 (same phone UI test); packet 06 scheduler versus contracts frame-bus owner; packet 05 Pre-flight (unspecified CSS/gallery).

**Evidence/failure:** Multiple writers could overwrite the same evidence/test file, while Antigravity could invent a nonexistent CSS utility framework and camera workers could each implement scheduling.

**Smallest correction:** one integrator for scheduler/config/shared/gallery/combined evidence, one phone-test owner, explicit backend HTTP ownership transfer, exact CSS classes and synthetic gallery before handoff. Pure UI files are independent after the contract freeze; full sensing integration is not. Implementation only; resolved in file map, handoffs and packets. Current workflow is sequential with no subagents.

### R10 — P2: phone retry and questionnaire journeys have unassigned details

**Location:** contracts clock expiry versus capture completion; packet 02 P1-B2; packet 12 P5-A1 versus approved spec §3.1.

**Evidence/failure:** A saved-in-memory phone result retried after 60s clock expiry had no valid timing rule. The routes supported a scoped questionnaire role but no packet owned the phone-accessible text-only page/QR journey, so tests could cover station forms only.

**Smallest correction:** retain original sync mapping for bounded capture retry, explicit expiry/unsaved behavior; assign QuestionnairePage/QR-link join to Codex with no camera request and purpose-scoping tests. Implementation only; resolved in contracts and packets 01/02/12.

## Uncertainties, not confirmed product defects

- **High feasibility risk:** actual phone/browser torch/HTTPS/signal, simultaneous webcam face/chest/leg framing, skin/lighting/movement robustness, and one-laptop compute are unmeasured. Published [phone validation](https://www.nature.com/articles/s43856-022-00102-x), [POS reference](https://github.com/ubicomplab/rPPG-Toolbox/blob/main/unsupervised_methods/methods/POS_WANG.py) and [webcam respiratory research](https://pubmed.ncbi.nlm.nih.gov/31248200/) support candidate methods, not this browser system or its specific patch matcher. D1–D3 determine viability; no plan edit “fixes” missing experimental evidence.
- **High proof risk:** face descriptor license/threshold generalization and provider account access remain open. Keep source/weight licenses distinct, calibrate separately from holdout tests, and test actual accepted Gemini output plus real speaker output. No unverified package/model pin is presented as installed.
- **Schedule uncertainty:** no reliable total-hour/team-capacity estimate exists. Required layers are ambitious for a hackathon. Timebox probes, prioritize one vertical journey and reserve integration time; optional scenarios and polishing wait. Dropping a required layer would require spec approval, not an implementation shortcut.
- **Proxy boundary uncertainty:** a loopback-bound backend behind a LAN proxy is not automatically local-only. D1 must prove the phone cannot bootstrap station access. Planned deny-by-origin/proxy behavior is not a verified security property yet.

## Preferences, not defects

Light neutral surfaces, blue accents, system sans, modest radii, SVG trends and little motion are proposed design choices. A different accessible style could meet the spec. Restricting Lovable to two presentation files and Antigravity to atoms is the user's ownership preference, not evidence those tools lack broader capabilities. Their [documented autonomy](https://docs.lovable.dev/features/agent-mode) and [workspace permissions](https://antigravity.google/docs/agent-settings) justify isolation and export review rather than trust in a restrictive prompt alone.

## Top five changes before building

1. Freeze the corrected identity/time/stream/reference/frame contracts and fixtures; remove conflicting old signatures from all packets.
2. Make D1 phone and D2 combined-framing/compute experiments the first technical gates, before broad UI/provider polish.
3. Deliver the thin real patient journey early; separate module-ready from integrated and hardware/provider proof.
4. Use the supplied staff UI state/layout/ownership contract, including posture without an alert, current versus assigned location and truthful missing data.
5. Test provider semantic versioning and active playback cancellation, plus all patient transitions with real API reads/reloads rather than UI-only mock records.

## What can safely start, and what needs a device

**Now:** review this revised plan and supplied fixtures/interfaces on paper; no implementation approval is inferred. **After approval without waiting for hardware results:** isolated shell/schemas, deterministic detector/clock/association tests, synthetic presentation/gallery and mocked provider validation can proceed. Do not launch external projects or upload private source without separate authority.

**Early actual-device experiments:** trusted phone camera/torch/PPG/save; one laptop's shared camera/framing/sampling/identity/pose; real rPPG/chest extraction and held-out reference comparisons; then the complete speaker/provider journey. One laptop is sufficient as the planned host; laptop-only cannot satisfy the selected phone PPG method. Failure is reported as incomplete acceptance, not hidden by synthetic or manual substitutes.
