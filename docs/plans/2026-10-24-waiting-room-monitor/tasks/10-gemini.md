# Gemini Questionnaire and Alert Explanations Implementation Plan

**Revision gate:** Read [scope-amendment.md](../scope-amendment.md). No temperature scenario or generated temperature fact in active inputs/outputs; temperature-specific instructions below are retired. Preserve original patient reports (including reported fever), generic synthetic/replay provenance, missing-data checks and unsupported-claim rejection. User/nurse journey approval and frozen replacement contracts precede implementation. Codex owns this packet.

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Interpret check-in text and explain recorded reasons for staff checks without inventing diagnoses.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** Server-only @google/genai, Zod/JSON Schema, TypeScript.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex AI worker. **Dependencies:** P1-A1; P2-A for confirmed summary storage; P2-B for real event snapshots.

**Scope boundary:** server/providers/{questionnaire.ts,gemini.ts,grounding.ts}, tests/{questionnaire,grounding}.test.ts. HTTP additions coordinated with backend owner; no client SDK or secret exports.

**Pre-flight:** Provider contract tests use synthetic data and injected mock transport. Real API proof requires available authorized account/credits, read through environment only and never printed. One bounded call at a time per job; set 8s timeout, no unbounded retries. No raw video/embeddings.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P4-A1 — editable questionnaire summary

**Interfaces:** `summarizeQuestionnaire(answers,signal):Promise<QuestionnaireSummary>`; summary.confirmed=false. Model configured by server env, from a currently available structured-output-capable Gemini model verified at execution. No fallback to hardcoded apparent success.

- [ ] Test “dizzy since this morning, worse now” retains reported complaint/onset/course without diagnosis; empty/unsaid facts -> “not mentioned”; instruction-like text stays patient data; >500-character reason rejects; invalid JSON/schema and 8s timeout produce explicit unavailable. Run `npm run test -- tests/questionnaire.test.ts` red.
- [ ] Implement server-only structured output, original-answer preservation, schema/length validation and abort handling. No clinical severity/stress score or inferred facts. Only explicit confirm action in CheckInPage sets confirmed=true and saves edited summary through P2-A; AI cannot self-confirm.
- [ ] Run tests/typecheck. With synthetic API fixture and available credentials, test one real provider round trip without logging prompts containing real patients or keys. If unavailable, keep provider acceptance incomplete and original form usable. E4-P4A1-TEST1; provider proof separately recorded when real.

**Flow check:** form answers -> server summary -> proposed editable display -> explicit confirm -> SQLite -> reopen. No direct client provider call.

## P4-B1 — event grounding and notification text

**Interfaces:** `explainAlert`, `validateAlertExplanation`, `renderGroundedText` as contracts. Snapshot includes event/version and evidence facts; 8s timeout yields deterministic factual fallback.

- [ ] Test wrong event/version, unknown evidence ID, invented BPM, stale seat label, diagnosis/causal claim, unmarked synthetic 38°C, missing physiology stated normal, duplicated claims and text inconsistent with the returned statement order reject. Valid statement ordering is allowed when rendered text exactly matches; do not simultaneously permit Gemini ordering and reject every reordered selection. Run `npm run test -- tests/grounding.test.ts` red.
- [ ] Define allowed GroundedStatement phraseKey for each EvidenceFact kind. Generate permissible factual text variants server-side from actual fields, retaining “reported,” “unavailable,” and “simulated.” Gemini selects/order these evidence statements and returns explanation + notificationText. Validate exact equality against renderGroundedText for the returned statements; schema validation alone is insufficient. This intentionally bounds wording so unsupported causes/numbers cannot reach staff. No opaque free-text medical justification.
- [ ] Keep notification text concise: verified location/uncertainty + observed posture reason + request to check; omit detailed complaint/names. If temperature is included in an explanation or optional notification, exact label says simulated. Free-form questionnaire text is never copied into the spoken alert.
- [ ] Show request before scheduling call, cache per event/version, reject obsolete results after movement/identity change/ack/check. On failure expose fallback/unavailable status and actual detector template. Verify tests with fake clock and delayed transport. E4-P4B1-TEST1/DIFF1.
- [ ] Test benign tracking updates for 10s do not invalidate the job; semantic version rules are in contracts.md. Include the allowed phrase catalogue and canonical renderer examples in the provider prompt, keep deterministic punctuation/ordering, and record schema-valid versus semantically accepted versus fallback results. Exact-string validation may otherwise send every real response to fallback. Do not call fallback-only behavior a working Gemini explanation path.

**Flow check:** persisted request -> bounded facts -> provider -> validation -> event-version explanation state -> staff; no provider decision creates a request. No new patient DB mutation other than recording result/status linked to event.

## P4-B2 — real provider path and failure proof

- [ ] Use synthetic openRequestRoom evidence for one real Gemini call, if accounts are available. Confirm supplied facts/IDs and exact accepted text; record model/version, latency and pass/failure without secret values.
- [ ] Delay a fake provider result while the patient moves or request is checked; UI must retain request evidence but not accept stale text/audio. Disable provider and confirm readable factual fallback and questionnaire originals.
- [ ] Run questionnaire/grounding tests, typecheck/build, and actual server route -> staff UI verification after P5 wiring. E4-P4B2-TEST1/UI1; no provider claim from mocks alone.

**Acceptance levels:** module-ready = mocked contract/grounding/timeout tests; integrated = P5 real route and UI; provider-validated = actual authorized synthetic calls, including at least one accepted explanation/notification rather than fallback alone. UI proof is a downstream gate, not a prerequisite for P5 to consume the adapter. A structured schema constrains shape, not truth; verify output against supplied facts and keep instruction-like patient text as data.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(() => validateAlertExplanation(inventedPulseOutput, snapshot)).toThrow();
expect(() => validateAlertExplanation(unmarkedSyntheticTemperatureOutput, snapshot)).toThrow();
expect(confirmedByAi).toBe(false);
```
