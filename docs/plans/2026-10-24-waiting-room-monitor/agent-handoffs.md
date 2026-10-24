# Agent Launch Guide

## Current ownership — supersedes the historical guide below

The user selected **Codex/GPT for everything**, explicitly excluding Lovable and Antigravity. No external UI projects, imports or handoffs are required. This main chat owns plan revision and integration. The three workstreams are idle following the checkpoint/pause request; environment ended interrupted and must be reconciled. No new sessions/subagents or automatic continuation.

Read [scope-amendment.md](scope-amendment.md) and the [patient and nurse journey proposal](../../superpowers/specs/2026-10-24-self-check-in-revision-design.md). Remove temperature from active scope through coordinated migration, not isolated field deletion. Review and freeze new contracts before implementing self-check-in. Preserve source and historical exports.

The remaining launch tables, external-tool instructions and old authorization text are **historical reference, not executable assignments**. Packet filenames 04/05 are retained for link stability; their owner is now Codex and TemperatureCard is retired.

**Execution authorization (2026-10-24):** User approved beginning the revised plan in a separate GPT-6.1 Sol/high session, bounded here to P1-A1 and a LOCAL synthetic-only Lovable handoff. Earlier awaiting-review language below is historical and superseded. No subagents, other sessions, external uploads or automatic continuation to later slices.
**Start here.** Spec and revised plan approved; P1-A1 is verified. This bounded session stops at its foundation checkpoint plus the local synthetic-only Lovable v2 package. The assignments below are not agents already launched. Main Codex integrates and verifies everything. Antigravity remains deferred.

**Current user instruction: no subagents.** Work sequentially in Codex. “Lane/worker” below describes file ownership, not permission to spawn. The user may manually use Lovable/Antigravity on this same laptop; a second laptop is not required. Close heavy auxiliary tools during device performance evaluation. [UI plan](ui-plan.md), [device experiments](device-experiments.md) and [review resolutions](review-resolution.md) are required shared context for the affected packets.

## What to give each tool

| Tool / lane | Give it | Allowed work |
| --- | --- | --- |
| Codex integrator | Master plan + contracts + packet 01, later 12 | Foundation, shared interfaces/config, integration and final proof |
| Codex phone | Packet 02 + frozen contracts/fixtures | Phone camera/torch PPG only |
| Codex backend | Packet 03 + frozen contracts/fixtures | Visits/pairing, observation state, deterministic requests |
| Lovable | Packet 04 + UI plan + DashboardViewProps/dashboardFixtures + tokens | Two layout/style files; no behavior |
| Antigravity | One mini-task from packet 05 + exact props/classes + gallery | One tiny display component at a time |
| Codex camera/identity | Packet 06 + frozen contracts | Camera owner, face enrollment/matching, track/seat association |
| Codex pose | Packet 07 + frozen BoundFrame fixtures | Pose features/activity, no event engine |
| Codex rPPG | Packet 08 + frozen BoundFrame fixtures | Facial pulse signal/quality |
| Codex breathing | Packet 09 + frozen BoundFrame fixtures | Torso motion/respiratory estimate |
| Codex Gemini | Packet 10 + frozen synthetic snapshots | Questionnaire and grounded event explanation/text |
| Codex voice | Packet 11 + validated-text fixtures | Server TTS + browser queue, no event detection |

Packet links: [01](tasks/01-foundation.md), [02](tasks/02-phone-ppg.md), [03](tasks/03-backend.md), [04](tasks/04-lovable-dashboard.md), [05](tasks/05-antigravity-components.md), [06](tasks/06-camera-identity.md), [07](tasks/07-pose.md), [08](tasks/08-rppg.md), [09](tasks/09-breathing.md), [10](tasks/10-gemini.md), [11](tasks/11-voice.md), [12](tasks/12-integration-and-validation.md).

## Dependency order without circular acceptance

1. **After approval, P1-A1 first:** compiling shell, frozen contracts, UI tokens/gallery/fixtures, stream/worker seams and file ownership. P1-A2 clocks/licenses/HTTPS gate the live paths that need them, not pure UI work.
2. **Early D1/D2 probes:** minimal code from phone/camera/pose/physiology packets proves real phone support, framing and combined laptop load. Use one camera owner. Do not postpone this behind polished UI or provider code.
3. **Backend and thin integration:** P2-A/B plus module-ready identity/pose/phone → early P5-A containers → real patient association/request journey. P3 signal modules and P4 provider modules can be developed with frozen synthetic inputs, but are not device-validated by doing so.
4. **Presentation handoffs if useful:** user may send the fixed synthetic UI contract to Lovable or one atom to Antigravity. Codex reviews returned source/imports, accepts only owned files, and typechecks/tests/builds locally. This is optional; keep identical boundaries if Codex writes the presentation itself.
5. **Full integration/rehearsal:** assemble module-ready outputs first; then record integrated and device/provider-validated statuses. P5 never depends on its own downstream UI evidence being complete. Record AC-01..15 and all incomplete required paths honestly.

Ownership transfers are explicit: P1 hands server/http.ts and tests/http.test.ts to backend; integrator retains config/shared/API/frame-bus/worker transport; backend alone edits provider route wiring from provider-owned function contracts. Integrator alone writes combined device-proof.md/ledgers. Phone owns tests/ui/phone.test.tsx; P5 runs it but requests edits through that owner. No simultaneous writers, even when editing different sections of one file.

Numbered sub-slices (for example P2-A1/A2) subdivide a work package (P2-A). A code dependency means required **module-ready** outputs; integrated/device acceptance is tracked separately. Pure fixture/UI work needs P1-A1, while live clocks/assets need the relevant P1-A2 checks. Each demonstrated level receives evidence; no checkbox implies the other levels passed.

## Safe tool handoff mechanics

**Lovable:** user operates a separate UI project containing only the published prop definitions, visual brief and synthetic fixture. Do not upload this private workspace to a third party as a shortcut. Copy/export only DashboardView.tsx and dashboard.css into an ignored `.local/handoffs/lovable/<run-id>/` staging folder for Codex review. Never replace App.tsx, package.json, shared/, or the whole source tree with a generated app. Full export availability depends on the account; individual file/code access is the fallback if available. If export is unavailable, record it and have Codex build the same view.

**Antigravity:** prefer a separate scratch folder with only the exact assigned atom file, the tiny copied prop contract, and an existing preview harness. Return one file at a time into `.local/handoffs/antigravity/<run-id>/`. If editing the shared workspace directly, explicitly restrict edits to that one file. It does not install packages, touch parent CSS, choose statuses, build forms, or integrate APIs.

**No automatic three-way sync.** This workspace is not Git. Do not initialize a repository, create a GitHub project, connect integrations, push, deploy, buy plans, or grant accounts without the user's explicit request. Lovable GitHub sync creates a new repository and does not directly attach an existing one; its separate Upload code/ZIP import option is not Git sync and is not authorization to upload this workspace. Manual selected-file transfer is the default.

## How the tools behave, and how to constrain them

These are documented capabilities, not claims that a model always obeys a prompt or is inherently better at a particular task.

- **Lovable:** Build mode is an autonomous implementation mode and may change multiple files, backend/configuration and dependencies. A “two files only” prompt is not a security boundary. Use a separate synthetic-only project/harness, keep backend/integration connections absent, and inspect the export allowlist. Its polished preview proves presentation only. [Official Build mode documentation](https://docs.lovable.dev/features/agent-mode).
- **Gemini in Antigravity:** the development agent can read/edit its project and run tools according to configured permissions. Workspace access is broader than one TSX file; instructions alone do not enforce one-file ownership. Use the isolated atom scratch project and existing sandbox/review controls; do not switch to unrestricted execution to speed up the task. Review actual diff/imports and the component gallery. [Official agent permissions/settings](https://antigravity.google/docs/agent-settings).
- **Gemini inside our app is a different role:** it receives only the bounded questionnaire/event input, returns structured output, and has no camera, event-trigger or file-edit authority. JSON/schema conformance does not guarantee factual correctness; application validation and fallback remain mandatory. [Official structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output).
- **Codex's project role:** shared architecture/contracts, behavior, testing and integration remain here by user decision. That ownership is not evidence that generated code is correct. Frozen interfaces, source review, negative tests and actual device checks apply equally to Codex output. No subagents are used in the current workflow.

If a tool cannot stay within the handoff or return editable source, stop that handoff and use the same packet locally. Do not expand infrastructure, buy access, or let it redefine the medical/data semantics merely to justify using all three tools.

## Copy/paste Codex worker prompt

“Implement only [packet path and sub-slice ID] after the main agent confirms plan approval and dependencies. Read the approved spec, master plan and contracts. Stay inside the exact owned files. Do not modify shared contracts/config or another lane; report a needed change to the integrator. Use synthetic tests first and actual-device/provider proof where required. Never invent a sensor value, patient identity or passing check. Return changed paths, exact validation commands/results, evidence, limitations, and any contract request. No deployment, publishing, credentials output, external project creation or deletion.”

## What every agent returns

- Slice ID and exact changed files; source files rather than screenshots alone.
- Public exports/imports and any requested contract/config change.
- Exact commands, exit results, device/browser/model conditions where relevant.
- Which acceptance passed, failed, or was not run; real vs mock proof explicit.
- Screenshots/evidence paths and remaining blockers. Integrator alone updates canonical plan/ledgers.

## Primary platform references

[Lovable GitHub/export](https://docs.lovable.dev/integrations/github), [Lovable code mode](https://docs.lovable.dev/features/code-mode), [Antigravity projects](https://antigravity.google/docs/projects). Checked during planning; platform/account export limitations must still be verified on the user's actual account. No service connection was performed.
