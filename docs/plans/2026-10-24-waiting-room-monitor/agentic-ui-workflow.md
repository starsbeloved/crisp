# Tool-neutral UI Redesign Implementation Plan

> **For agentic workers:** After design review, use executing-plans for sequential implementation. No new agents or sessions are launched by this document. Work one task at a time and stop at its review gate.

**Date:** 2026-10-24. **Status:** UI design proposal; Git/repository setup separately authorized. No UI implementation performed by this planning turn.

**Goal:** Let Gemini, Codex, or another selected coding tool implement the approved UI without replacing working identity, sensing, persistence or provider behavior.

**Architecture:** Keep existing React/Vite controllers and backend. Extract small presentation boundaries only where needed, then restyle one screen family at a time. A local agent works in an isolated `fix/ui` checkout; an external builder receives an explicitly approved synthetic-only presentation packet.

**Tech stack:** Existing React, TypeScript, Vite, CSS, Vitest/Testing Library; Node HTTP/SQLite remains unchanged. No framework, database, auth or UI-library migration.

**Spec:** [UI experience blueprint](ui-experience-blueprint.md), plus the [approved product specification](../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md). The blueprint supplies proposed exact copy and screen IDs. Review it before implementing.

## Global constraints

- No temperature, diagnosis, fake measurements, hidden synthetic fallback or “healthy” status.
- Preserve consent, visit binding, editor ownership, capture lifecycle, freshness and voice deduplication.
- No secrets, patient database, face captures, recordings or session state in Git or external handoffs.
- Do not read ignored sensitive files merely because an agent has filesystem access.
- UI work cannot redefine scientific thresholds or shared backend semantics.
- A local Git repository is not a GitHub repository; a GitHub push is not a deployment.
- Preserve historical ECHO code/documents. Excluding generated evidence from Git does not delete it.
- No simultaneous writers to the same files. Branches in one checkout do not isolate two running agents; separate worktrees do.
- Keep user-facing updates concise. Do not launch subagents or new chats without explicit authorization.

## P0: inspected reality

The current app is under `apps/waiting-room/`. Root scripts refer partly to historical ECHO. Use the app package's checks for this redesign, not a passing root command as a substitute.

`DashboardView.tsx` already consumes `DashboardViewProps` from `shared/view-model.ts`; retain that contract. `StaffPage.tsx` supplies `videoSlot`, `voiceSlot`, patient actions and persisted callbacks. `PhonePage.tsx` already exports a presentation `PhoneView` but shares its file with `createPhoneSession`. Patient pages, questionnaire, Vision and VoiceControls mix effects/logic/rendering. Consequently, “the UI agent owns client/pages” would be unsafe: folder names do not separate UI from behavior.

Local Git was absent at inspection and was initialized on `main` at the user's request. GitHub authentication was unavailable when checked. Remote creation/push require the user to sign in; do not manufacture credentials or bypass that boundary. Branch/worktree/checkpoint results must be reported from actual commands, not inferred from this plan.

## Review of the pasted Lovable workflow

The useful idea is **visual iteration → source diff → integration checks → tested checkpoint**. The risky idea is treating full-app import and two-way sync as harmless UI editing. These are different operations.

| Pasted step/claim | Assessment | Practical correction |
| --- | --- | --- |
| Commit before changing things | Good checkpoint principle, but there was no Git repo | Initialize locally; inspect ignore/upload manifest; stage named source paths instead of blind `git add .` |
| ZIP the whole app into Lovable | Not an in-place edit | Official import docs describe rebuild on TanStack Start and backend/auth migration; rollout/account availability varies. Not needed for this UI task |
| Project Knowledge constrains edits | Useful guidance, not enforced permissions | Isolate data/files; review changed files. Prompt text does not stop an agent rewriting a controller |
| Select/text/draw/comment in preview | Useful for focused visual feedback | Keep edits tied to a screen ID, state, viewport and reason; submit one consolidated review per screen |
| Local code and hosted preview share “the backend” | Not automatically | A remote preview cannot call this laptop's localhost. Use labeled synthetic fixtures in preview; test real integration locally |
| Git sync keeps both sides current | True for the configured active branch, not all branches | Confirm branch and commit IDs at handoff; pause edits before review/merge |
| A dedicated UI branch is safer | Yes, but not a permission boundary | Isolated checkout plus file ownership; reviewed merge, not automatic import of every generated file |
| MCP removes handoff friction | Possible optional transport, not required | No Lovable MCP tools were available in this session. Do not install/connect it just for this task |
| React output drops into our app | Not guaranteed | Return portable TSX/CSS without router/server/backend dependencies; review package changes |

Verified primary sources, October 24: [Lovable import](https://docs.lovable.dev/features/projects/import-project), [Git sync](https://docs.lovable.dev/integrations/github), [project knowledge](https://docs.lovable.dev/features/knowledge), [preview toolbar](https://docs.lovable.dev/features/preview-toolbar), [MCP](https://docs.lovable.dev/integrations/lovable-mcp-server). The docs' broad platform capabilities do not prove this app will work there. No provider was connected during planning.

For costs: preview selection/annotation requests consume build credits; comments alone do not, while sending them for implementation does. Inline text edits have a documented free allowance with limits. Check the actual account before relying on it. Avoid spending credits repeatedly rebuilding the complete application. [Preview usage](https://docs.lovable.dev/features/preview-toolbar).

## Recommended workflow for Gemini or any local coding agent

1. **Checkpoint and isolate.** Put reviewed source on `main`; create `dev` and `fix/ui` from the baseline. Open the `fix/ui` worktree in the selected coding tool. Do not switch the original running application's checkout underneath another agent.
2. **Read a bounded brief.** Give the agent `AGENTS.md`, the blueprint, this plan, current files for the selected slice and relevant tests. State that old Codex-only/paused paragraphs are historical where the user's latest explicit assignment supersedes them; safety/data requirements still apply.
3. **Review before editing.** Ask the agent to restate the screen's purpose, existing behavior it will preserve, exact files and tests. Approve the design, not just “make it prettier.”
4. **Establish baseline.** Run app typecheck/tests/build. Record failures before edits. Do not update tests merely to conceal broken behavior.
5. **Implement one family.** Start with patient shell + Welcome/About you. Preserve current callbacks and transitions. Do not begin dashboard/media refactors at the same time.
6. **Inspect real states.** View desktop and phone layouts, denied consent, unavailable service and pending/save errors. Correct visual hierarchy with screen/state-specific feedback.
7. **Review diff and test.** Review every changed file. Prove retained answers, no automatic camera access and correct callbacks, not just screenshot similarity.
8. **Checkpoint, then next family.** Integrate each accepted slice into `dev` after review. Promote `dev` to `main` only after full regression/device gates appropriate to the change. No force push or destructive reset.

Gemini CLI supports project context through `GEMINI.md`; that is one tool-specific entry point, not a required app dependency. Its ignore and sandbox controls need explicit review. A local agent may send code context to its model provider; “local checkout” does not mean offline inference. Let the user choose/sign in and confirm the data scope. Do not enable unrestricted execution. [Gemini context](https://geminicli.com/docs/cli/gemini-md/), [sandbox](https://geminicli.com/docs/cli/sandbox/).

If using Gemini in a browser chat instead of a local coding tool, it does not gain filesystem access just because Git exists. Use an explicitly approved selected-file packet or a separately authorized repository connection. A private GitHub repository is not automatically visible to Gemini.

## Optional hosted-builder workflow

Use the same blueprint and fixture contract, but only transfer approved presentation files. No app database/backend/sensors, credentials, model weights or private captures. Generated previews must visibly say “Synthetic preview — no live measurements.” Export selected source into a staging folder, inspect it and integrate locally. Do not overwrite the app's package.json, App.tsx or server directory with an exported builder project.

A handoff packet contains: short README with screen IDs and limits; exact copy excerpt; current pure component/type definitions; synthetic fixtures; CSS tokens; callback-spy preview; return-file allowlist. This packet is **not created or uploaded by this plan**. For local Gemini, a separate export is unnecessary if the user grants access to the isolated source checkout.

## Ownership and interfaces

Paths below are relative to `apps/waiting-room/`.

| Area | Presentation work | Preserve / integration owner |
| --- | --- | --- |
| Patient chrome | `client/patient/PatientShell.tsx`, `patient.css` | Focus/timeout/session behavior must retain tests |
| Check-in | New `client/ui/patient/WelcomeView.tsx`, `AboutYouView.tsx`, scoped CSS if extracted | `client/check-in/CheckInPage.tsx` remains controller; same ID/retry/consent semantics |
| Questions | Render/copy in `QuestionnaireForm.tsx`; review-state extraction only if needed | Original answers, summary validation/provider request and editor lease |
| Pulse | Extract `PhoneView` into `client/ui/phone/PhoneView.tsx` if external handoff needs it | `createPhoneSession`, capture.ts, ppg.ts, visit/capture clocks and IDs |
| Dashboard | `client/ui/dashboard/DashboardView.tsx`, `dashboard.css` | `StaffPage.tsx`, `shared/view-model.ts`, action/selection state, media and voice controllers |
| Vision | Layout/copy in `VisionPage.tsx`, `vision.css` | Capture lifecycle, coordinate transforms, session worker, model/identity/runtime |
| Provider/audio | Presentation around existing slots | No new queue, retries, per-alert human approval or synthetic success |

Proposed first extracted signatures (not existing APIs):

```ts
type WelcomeViewProps = {
  busy: boolean;
  error: string | null;
  onStart: () => void;
};
type AboutYouViewProps = {
  name: string;
  consent: boolean;
  busy: boolean;
  retrying: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onConsentChange: (value: boolean) => void;
  onContinue: (consent: boolean) => void;
};
```

Shared PatientShell owns Help and demo footer; don't duplicate them in the views. Preserve optional name maxLength 80. UI may manage disclosure/focus state but not visit identity or network persistence. Name/consent editing during an uncertain save follows existing controller locks.

Keep actual `DashboardViewProps` and its existing `voiceSlot?: ReactNode`, `patientActions?: ReactNode` extension. It supplies IDs, action eligibility, source/time/quality labels, selected IDs and video slot. A UI builder must not infer medical state from displayed strings. Copy changes in view-model need separate integration ownership, not duplicated mappings in dashboard JSX.

## Review focus

1. A word/label change must not strip explicit consent or make the optional name required.
2. Leaving or retrying after an uncertain save must not duplicate visits or lose a pulse result.
3. Selecting a new request must not highlight the previous patient's video track.
4. Collapsed diagnostics must not conceal unavailable/stale/unsaved states or Stop.
5. A synthetic preview must never be mounted as a live-service fallback.

## Task sequence and verification gates

### U0 — Baseline and design approval

- [ ] Review blueprint P01–P15/N01–N10 with user; record any requested deviations before code.
- [ ] Inspect current branch/worktree and active owners; collect exact changed-file baseline. Gate: isolated checkout and source checkpoint exist.
- [ ] From `apps/waiting-room`, run `npm run typecheck`, `npm test`, `npm run build`. Record actual outcomes; failures block claiming a clean baseline, not local source preservation.
- [ ] Save before screenshots with synthetic data at 390px and 1280px. Never upload live patient screenshots. Acceptance: source and visual baseline exist; no camera/provider access needed.

### U1 — Patient shell, Welcome and About you

Files: PatientShell.tsx/patient.css; new WelcomeView.tsx/AboutYouView.tsx if extracting; CheckInPage.tsx only for adapter wiring. Tests: `tests/ui/check-in.test.tsx`, `tests/ui/patient-flow.test.tsx`; add `tests/ui/patient-copy.test.tsx`.

- [ ] Add tests for single H1/primary action, optional name, unchecked initial consent, decline path, Help focus return and retained draft after failure. Confirm new-copy assertions fail on old UI.
- [ ] Apply P01/P02/shared-copy design without moving API effects. Map known errors; no raw diagnostic text in welcome.
- [ ] Run `npm test -- tests/ui/check-in.test.tsx tests/ui/patient-flow.test.tsx tests/ui/patient-copy.test.tsx`, then typecheck/build. Inspect keyboard and zoom.
- [ ] Review diff and screenshot; checkpoint only intended paths. Acceptance: shorter welcome and accessible consent with unchanged visit behavior. Stop for first visual approval before broad redesign.

### U2 — Face, handoff, questionnaire, recovery and receipt

Files: CheckInPage.tsx, QuestionnaireForm.tsx, PatientPage.tsx, relevant scoped styles; IdentitySetup placement moved only by integrator. Tests: check-in, patient-flow, patient-readback, kiosk-receipt, vision-checkin, provider-ui and questionnaire.

- [ ] Add failing behavior tests for explicit takeover confirmation, source-answer edits invalidating summary, summary cancellation, wrong/expired code, receipt's unknown face status and failed reset withholding new check-in.
- [ ] Implement P03–P08/P11–P15 incrementally; keep original questions/options/limits and session authority. Operator setup stays reachable before removing it from patient flow.
- [ ] Run relevant existing suites plus new assertions; test two browser sessions and connection-failure cases with synthetic data. Acceptance: no retyping saved answers, no false saved/enrolled status, no cross-visit exposure.
- [ ] Review rendered exception states and changed-file diff; checkpoint. Do not claim a mocked face scan proves actual enrollment.

### U3 — Phone pulse presentation

Files: PhoneView presentation/extraction and scoped CSS; PhonePage controller import adjustment only. Tests: `tests/ui/phone.test.tsx`, `tests/ui/app-phone.test.tsx`, `tests/ui/patient-readback.test.tsx`; preserve `tests/phone-ppg.test.ts`.

- [ ] Add failing tests that Stop remains reachable, unusable signal has no BPM, unsaved result cannot be silently skipped, and retry calls the original capture.
- [ ] Implement P09/P10; consume waveform/progress/phase from controller. No DSP or browser capability “fixes” in this slice.
- [ ] Run phone/UI tests and typecheck/build; verify small/landscape layout and permission errors. Actual iPhone lens/torch/stop test requires consent and reachable HTTPS.
- [ ] Checkpoint once software behavior passes; separately record device gates as passed/failed/not run.

### U4 — Staff dashboard and Vision presentation

Files: DashboardView/dashboard.css; scoped Vision layout; presentational voice/media styles. Shared view-model/status mapping changes require integrator review. Tests: dashboard, staff-actions, staff-integration, vision-page, media-staff-camera, provider-voice.

- [ ] Add assertions that request selection highlights only a verified matching track, missing values never become zero, assigned/current locations remain distinct, and failed actions preserve cards.
- [ ] Implement N01–N10/V01; keep real media/voice slots and current camera owner. Setup and technical IDs go behind operator controls; critical failures remain visible.
- [ ] Test stale/frozen video, ambiguous identity, moved patient, provider failure, unchanged pulse, acknowledged/checked state and narrow viewport. Snapshot tests alone are insufficient.
- [ ] Review callback IDs, keyboard order, visual contrast, reduced motion and diff; checkpoint. No global CSS reset or new framework dependency.

### U5 — End-to-end verification and integration

- [ ] Run full app typecheck/tests/build; repeat UX01–UX10 from blueprint and record what used synthetic versus real data.
- [ ] On actual laptop/phone, verify consent, camera ownership, same-visit pulse save, selected request/track, stopped video and stale audio behavior. Do not claim visual polish establishes clinical validation.
- [ ] Review `fix/ui` changes against baseline; integrate into `dev` only after acceptance. Promote to `main` after integrated checks, with no forced history rewrite.
- [ ] Return exact commit IDs, touched files, checks, screenshots and remaining device/provider limitations. No “everything works” claim with required gates untested.

## Copy/paste prompt for a selected coding agent

```text
Work on Waiting Room Monitor in the fix/ui worktree I provide.
First read AGENTS.md, docs/plans/2026-10-24-waiting-room-monitor/ui-experience-blueprint.md,
and docs/plans/2026-10-24-waiting-room-monitor/agentic-ui-workflow.md.
I am considering you as the UI implementer; older Codex-only tool assignments
do not override this explicit assignment. Other safety/product rules still apply.

Start with read-only U0: inspect current source, report baseline checks,
and propose the exact U1 file changes. Do not edit until I approve the design.
Do not build the whole redesign at once.

Preserve consent, optional name, saved answers, pairing/editor ownership,
camera lifecycle, pulse processing, real video, identity uncertainty and staff actions.
No backend/framework/database migration or new medical claims.
No temperature, fake waveform, sample reading in live mode, or green healthy badge.
No secrets, patient database, ignored local files, face captures or provider credentials.
Do not deploy, push, install tools, launch agents or call paid providers unless asked.

After approval implement only U1, run its tests plus typecheck/build,
show desktop/mobile and error states, and return changed paths and exact results.
Pause for visual review before U2. Keep edits on fix/ui; never force-push/reset.
```

## What this turn does and does not prove

The blueprint and this handoff are planning artifacts, not implemented UI. Git setup is separate from design approval. No Gemini session, Lovable project, import, model call, deployment or device test is initiated by writing these files. Repository/worktree creation and test results are reported separately from tool output.
