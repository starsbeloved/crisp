# Codex Display Components Implementation Plan

**Current packet:** Codex-only; historical filename retained. Only P2-D1 StatusBadge and P2-D2 ProvenanceLabel remain active after contract/token review. **P2-D3 TemperatureCard is retired, not completed.** No Antigravity use or handoff. Use revised [UI plan](../ui-plan.md) and [scope amendment](../scope-amendment.md). Preserve labels/quality/provenance, test contrast and wrapping with existing dependencies. Temperature/tool-specific instructions below are historical reference and must not be implemented.

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Build three simple display components, one file per assignment.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** React + TypeScript + the exact shared CSS classes in ui-plan.md (no assumed Tailwind installation).

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Antigravity, display only. **Dependencies:** P1-A props frozen; independent of Lovable files.

**Scope boundary:** ONLY client/ui/atoms/StatusBadge.tsx, ProvenanceLabel.tsx, TemperatureCard.tsx. Each mini-task may be given separately. No shared config, packages, behavior, forms, API, model, or dashboard edits.

**Pre-flight:** Integrator supplies the exact props, approved CSS class vocabulary, and component gallery. All preview values synthetic. Antigravity does not decide what a clinical label means, what color data merits, or whether temperature is simulated.

**Style contract:** Read [ui-plan.md](../ui-plan.md) token/ownership section. StatusBadge uses `wr-badge wr-tone-{tone}`; ProvenanceLabel uses `wr-provenance wr-tone-{tone}`; TemperatureCard uses `wr-temperature wr-tone-{tone}` plus `wr-temperature__value` and `wr-temperature__source`. Codex owns their CSS/gallery. No icons, effects, animation, dependencies, independent styling file or subagents. Returned TSX must import the frozen prop type, not redefine it.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P2-D1 — StatusBadge

**Interface:** named export `StatusBadge({label,tone}:StatusBadgeProps)`; label verbatim; tone only neutral/info/warning/danger. Use the four provided style variants; no icons necessary.

- [ ] Create only StatusBadge.tsx. Render one span with the passed label and tone class; no hooks or conditional label rewriting.
- [ ] Preview all four tones with labels “Collecting,” “Usable estimate,” “Identity uncertain,” and “Check requested.” Codex typechecks and visually checks contrast/focus-independent readability.

**Flow check:** props -> text/style only; API/DB/events=N/A. Acceptance: exact text, no derived status or medical rule. Evidence E2-P2D1-UI1/DIFF1; integrator owns status refresh.

## P2-D2 — ProvenanceLabel

**Interface:** named export `ProvenanceLabel({label,tone}:ProvenanceLabelProps)`.

- [ ] Create only ProvenanceLabel.tsx. Display label exactly as passed; no inference from numbers or source names.
- [ ] Preview “Live phone PPG,” “Camera estimate,” and “Simulated — not measured.” Long labels wrap without truncating “Simulated.” Codex typechecks and visually checks.

**Flow check:** props -> provenance text only; no DB/API/state. Acceptance: simulated text never hidden or changed to live. Evidence E2-P2D2-UI1/DIFF1.

## P2-D3 — TemperatureCard

**Interface:** named export `TemperatureCard({valueC,label,sourceLabel,tone}:TemperatureCardProps)`.

- [ ] Create only TemperatureCard.tsx. Render passed label, `valueC === null ? 'Not measured' : valueC.toFixed(1)+' °C'`, and sourceLabel in visible text. Use passed tone, never a temperature threshold. Do not substitute 37 when null.
- [ ] Preview null/“Not measured,” 37/“Simulated — not measured,” and 38/“Simulated — not measured.” Codex verifies typecheck, overflow, and exact visible source text.

**Flow check:** props -> formatted number/source only; no DB/API/state. Acceptance: no fever classification, defaults, timers, or integrations. Evidence E2-P2D3-UI1/DIFF1.

## Copy/paste instruction for each assignment

“Implement only the named component file and exact props above. Do not edit other files. No hooks, API calls, packages, calculations beyond the specified number formatting, clinical rules, or renamed props. Return the file and a screenshot with the supplied synthetic examples.”
