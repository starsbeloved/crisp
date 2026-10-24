# Codex Dashboard Presentation Implementation Plan

**Current packet:** Codex-only; historical filename retained to preserve links. Read [scope amendment](../scope-amendment.md), revised [UI plan](../ui-plan.md) and patient/nurse design before work. No Lovable use or export/import. Do not resume until new ViewModel contracts are frozen. Implement `DashboardView(props:DashboardViewProps)` in `client/ui/dashboard/DashboardView.tsx` and its scoped CSS; consume injected video/callbacks, keep business logic outside presentation. Apple-inspired design and no temperature are controlling. Verify nurse request selection → correct visit/current track, missing/stale readings, saved/failed acknowledgement, checked/rearm, keyboard and responsive states. The older external-tool instructions below are historical reference; any scenario/temperature rendering instruction is retired.

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Produce a polished dashboard layout without behavior or data interpretation.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** React + TypeScript + CSS; existing project dependencies only.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Lovable, presentation only. **Dependencies:** P1-A DashboardViewProps and synthetic fixture frozen; user operates external tool.

**Scope boundary:** ONLY client/ui/dashboard/DashboardView.tsx and dashboard.css. No App.tsx, routes, packages, forms, state store, API client, models, media permissions, provider code, shared types, or global CSS.

**Pre-flight:** Receive DashboardViewProps definition, fixed synthetic examples, visual brief below, and the two-file ownership list. Do not upload the repository, face images, patient records, or credentials. Local preview may use a separate synthetic harness, not production mocks.

**Required UI input:** [ui-plan.md](../ui-plan.md), frozen dashboardFixtures, shared token names, atom/gallery import seam and explicit failure/action props. Integrator supplies these before handoff; Lovable does not invent them. Do not run additional agents or enable autonomous project integrations for this assignment.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P2-C1 — fixed layout and styling

**Interface:** named export `DashboardView(props:DashboardViewProps)`; props and callbacks exactly as contracts. Every label/value is passed in. `videoSlot` is a React node supplied by Codex, not a URL or permission request.

**Visual brief:** restrained light clinical workspace, readable dark text, neutral surfaces, one blue accent; amber/red reserved for tones passed by Codex. Desktop three zones: live video/room view, request queue, selected-patient details/trends. At 1280x800 keep active request and video visible; at 390px stack sections without clipped actions. Legible timestamps/quality/provenance, clear selected state, explicit empty/collecting/unavailable states. Avoid invented numerical scores, normal/safe claims, or decorative fake waveforms.

- [ ] Render emptyRoom and openRequestRoom props using a synthetic-only harness. Produce the layout in the two owned files; no data fetching, effects, timers, camera hooks, computed thresholds, or patient sorting.
- [ ] Mount `videoSlot`, patients, requests, passed reading points, scenario banner, and detail fields. Buttons call the supplied callback with that row's exact ID. Do not mutate parent state or guess who is selected. Use CSS/SVG for simple trends from passed points, leaving null gaps disconnected.
- [ ] Show PoseView before an event, reference collecting/rearming, original answers/summary status, request duration/time/evidence and pending/action-error states. Include explicit camera retry, voice test and system statuses via supplied callbacks/props. Trend axes, summaries and table values come from Codex; do not derive medical ranges, quality or smoothing. Use only `.wr-dashboard`-scoped CSS and the shared tokens.
- [ ] Check all fixture states at 1280x800 and 390px, plus 200% zoom/reduced motion; verify keyboard callbacks with exact IDs, preserved focus, contrast, overflow, and no fake live indicator when stale or synthetic. Follow ui-plan.md acceptance checklist. Return only two files, screenshots, imports and limitations. Codex runs typecheck/build and behavior checks before accepting.

**Flow check:** fixed props -> rendered layout; callback click -> supplied spy, not API/DB. No persistence or new external side effects. Static visuals need no tests mirroring markup; integrator checks interaction binding in P5.
**Acceptance:** exported component imports frozen types, displays exact labels/values, remains responsive, mounts the live-video slot, and has no behavior/API/dependency additions. E2-P2C1-UI1/DIFF1; presentation missing -> partial until integrated.

## Copy/paste instruction for Lovable

“Build ONLY these two React files: `DashboardView.tsx` and `dashboard.css`. Use attached props, dashboardFixtures and ui-plan.md unchanged. Display values exactly; call passed callbacks on click. Mount videoSlot. No backend, Supabase, auth, camera access, AI integration, real data, timers, clinical inference, new dependencies or subagents. Do not edit other files. Scope CSS to .wr-dashboard; use supplied tokens. Preview synthetic fixtures only. Return the two source files, import list and fixture/viewport screenshots. Report a missing input instead of inventing an interface.”

If Lovable cannot export without a paid feature, copy these two individual files using the tool's available code view; otherwise record the export limitation and let Codex implement the same presentation. Never create GitHub/cloud resources just to avoid a manual handoff.
