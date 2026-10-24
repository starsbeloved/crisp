# Staff UI Plan — One-Laptop Demo

## Current UI revision — controlling direction

Codex/GPT builds every screen; no Lovable or Antigravity. Read the [patient and nurse journeys](../../superpowers/specs/2026-10-24-self-check-in-revision-design.md) and [scope amendment](scope-amendment.md). The detailed self-service flow is awaiting review; no implementation restart yet. Temperature is removed entirely, including the “Not measured” card and simulated-temperature fixture in the active gallery. Historical temperature/tool instructions below are superseded, not authorized work.

The Apple-inspired direction uses an original apple-fruit mark, system typography, generous but functional spacing, opaque readable surfaces and restrained feedback motion. Proposed tokens supersede the older blue palette below: canvas `#F5F5F7`, surface `#FFFFFF`, text `#1D1D1F`, muted `#5B5B62`, brand leaf green `#246B45`; 18px panels/12px controls. Green is branding, not medically safe. Measure contrast in rendered output; no Apple logo, branded font download, UI-kit migration or GSAP dependency.

Patient screens have one task/primary action, explicit Back/Help, retained answers and accessible inline errors/error summary. Nurse screens preserve live video + request reason/actions + selected patient evidence together, with distinct current and historical measurements. Proposed single-QR questionnaire/PPG continuation replaces the older split-purpose UX only after its contracts are reviewed. The existing camera owner, provenance/freshness/accessibility rules below remain valid.

**Execution authorization (2026-10-24):** User approved beginning the revised plan in a separate GPT-6.1 Sol/high session, bounded here to P1-A1 and a LOCAL synthetic-only Lovable handoff. Earlier awaiting-review language below is historical and superseded. No subagents, other sessions, external uploads or automatic continuation to later slices.
Status: revised plan approved for bounded execution; P1-A1 synthetic baseline/gallery is verified. Final dashboard presentation/accessibility gates remain incomplete. Implements approved spec §§3, 7, 8 and AC-01/07/09–15; does not change the spec. All paths below are relative to planned `apps/waiting-room/`. See E1-P1A1-UI1 for baseline desktop/mobile proof; it is not final presentation or live-camera acceptance.

## Design decision and skill application

Audience: staff locating a person and deciding to check them, plus a separate demo operator. Success is finding the right person, reason and next action without mistaking uncertainty for reassurance. Direction: calm, light, high-contrast clinical workspace; restrained variation, minimal motion, moderately dense evidence. No marketing hero, AIDA funnel, scroll-jacking, decorative photos, fabricated waveform, risk score or green “safe” state.

UI/UX Pro Max leads this dashboard: accessible states, direct labels, keyboard operation and time-series gaps. Its initial generated landing-page recommendation was rejected; focused product/UX/chart searches informed this brief instead. design-taste-frontend explicitly routes dashboards to UI/UX Pro Max; apply its hierarchy, spacing and non-template discipline only. gpt-taste's useful typography/alignment principles are retained, but its mandatory randomized marketing layout, GSAP scroll effects and visual filler conflict with the approved workflow and are not applied. Keep approved copy such as “Simulated — not measured” even where generic style rules disagree. No new animation/UI-kit dependency is justified.

## One laptop, three visible modes

Codex App owns a persistent station runtime and navigation: **Check in**, **Monitor**, and a clearly separated **Demo setup** panel. Mode switches must not create another webcam stream or dispose enrollment. Entering Check in pauses room observation submission with visible “Monitoring paused for enrollment”; returning to Monitor starts new windows and a fresh reference. Camera repositioning requires operator confirmation that regions/reference were reset. Cannot claim uninterrupted monitoring while repurposing the only camera.

Check-in is a short ordered form: visit label → face scan status → original questions and editable proposed summary → paired-phone capture status. Each step exposes failure and retry, not a fake completed checkmark. No camera permission on the text questionnaire page. The phone screen shows intended visit, secure connection/camera/torch status, derived waveform, usable-duration progress, immediate Stop, and Saved / Unsaved with explicit same-capture retry. The station shows capture completion without manual BPM transcription. Separate questionnaire QR/link and PPG pairing must retain their distinct purposes.

## Desktop layout (1280 × 800 acceptance viewport)

Use 16px outer gutters and 16px gaps; no permanent wide navigation sidebar. Header approximately 56px: product name, connection status, mode, Enable voice/Mute/Test audio. Any scenario banner is immediately below it, never hidden in details.

Main grid has three columns: `minmax(360px,1.35fr) minmax(260px,0.85fr) minmax(320px,1fr)`. At this viewport, live camera, newest/open request reason and actions, and selected visit identity/location must be visible together. Camera uses contain (not cropped cover); overlays use the same coordinate transform. Below camera: patient/track list and explicit camera/identity/model statuses. Middle: check-request queue, newest open first as ordered by Codex, including duration/time and labelled actions. Right: selected patient, current location, assigned seat, posture/activity/reference, contact pulse, camera pulse, breathing, questionnaire, trends and evidence. Longer evidence scrolls in its named region; page never horizontally scrolls.

Request appearance: text “Check requested,” a clear border/accent, and persistent factual reason. Identity uncertainty uses a different labelled badge; sensor quality uses neutral quality text. Color is supplemental. Do not flash, pulse, reorder focus, auto-scroll or repeatedly announce every live metric. Keep checked history accessible without pushing the open request offscreen. Staff action names are **Acknowledge** and **Mark checked**; successful state change is not called “Recovered.” Pending/error flags come from Codex, disable duplicate submission while pending, and retain row/selection on error.

## Responsive and accessibility behavior

- At widths below 1100px, use two columns with selected detail below; below 760px stack camera, open-request queue, selected patient and supporting history. On 390px, use 12px gutters, wrap labels, and full-width action groups. No offscreen action or horizontal chart overflow. Mobile is an inspection layout, not a second camera station.
- At 200% zoom, reflow rather than clip; do not rely on fixed panel heights for essential actions. Contrast targets: 4.5:1 normal text, 3:1 large text and meaningful non-text controls. Verify actual computed colors; tokens alone are not proof.
- Semantic header/main/sections with headings; keyboard-operable native buttons. Patient/track overlay selection has a matching keyboard list; the video itself need not receive focus. Use aria-pressed for current selections/toggles. Focus outline 2px with 2px offset; do not move focus on polling.
- Target controls >=44×44 CSS px as a project usability choice. Do not misstate it as the WCAG AA minimum. Use visible labels, not icon-only actions. A single polite atomic status region receives `statusAnnouncement` only for meaningful connection/action/new-request changes, not each 2s reading. ElevenLabs speech and screen-reader updates must not duplicate the whole explanation.
- Transition only background/border/opacity, 100–150ms. No layout-motion updates, numbers counting up, animated waveform placeholder or live-card pulsing. `prefers-reduced-motion: reduce` disables transitions. Camera/scientific frame rate takes priority over decoration.

## Tokens and ownership

Codex owns global tokens and atom classes in `client/styles.css`, and creates a labelled synthetic gallery during P1-A1. Lovable owns `.wr-dashboard`-scoped layout/style rules only; no global reset or body styles. Antigravity receives the class vocabulary and writes only its assigned TSX file; it does not invent utilities.

| Token / class | Proposed value / rule |
| --- | --- |
| `--wr-bg`, `--wr-surface`, `--wr-subtle` | `#F4F6F8`, `#FFFFFF`, `#E9EEF3` |
| `--wr-text`, `--wr-muted`, `--wr-border` | `#17212B`, `#52606D`, `#CAD3DD`; border alone is not a control's only boundary |
| `--wr-accent`, `--wr-accent-soft` | `#1D4ED8`, `#EFF6FF` |
| `--wr-warning`, `--wr-warning-soft` | `#92400E`, `#FFFBEB` |
| `--wr-danger`, `--wr-danger-soft` | `#9F1239`, `#FFF1F2`; passed tone only, not calculated severity |
| Type | system sans; body 16px/1.5, supporting 14px/1.45, headings 18–22px, primary readings 28px; tabular numerals |
| Space/radius | 4/8/12/16/24/32px spacing; panels 10px, controls 6px, badge 4px |
| Elevation | 1px borders; only overlays/popovers use a subtle shadow; no glass/blur |
| Atom vocabulary | `.wr-badge`, `.wr-provenance`, `.wr-temperature`, `.wr-temperature__value`, `.wr-temperature__source`; `.wr-tone-neutral/info/warning/danger` modifiers |

TemperatureCard may format the supplied number to one decimal as already specified. All medical/status/provenance labels and tones come from Codex. Every badge includes text. Dashboard can import atom components after delivery, but must be module-ready with the integrator's gallery fallback so it does not wait on Antigravity. Integrator owns that temporary harness/fallback; never ship duplicate atom implementations.

## Evidence design, not decorative charts

- Separate contact pulse (historical measurement interval), current camera pulse and breathing; never connect different methods into one continuous line. Null breaks a line. No interpolation through rejected windows, invented baseline, medically meaningful normal bands or confidence percentage without calibration.
- `ReadingView` supplies axis bounds/labels, units, summary and recent-value rows. Lovable performs pixel positioning only. Prefer a small SVG line with labelled axes plus accessible recent-value table; fewer than four valid values can show the values/table without a misleading trend. Graph never hides the latest quality/reason/time.
- Always show current posture/activity/reference status before any request exists. Missing/expired pose shows Unknown/Stale with reason; checked → collecting new reference is visible. The request retains immutable triggering evidence even if the current posture later changes.
- Current observed location is primary; assigned seat appears separately as metadata. When identity becomes uncertain, do not remove the request or select a different patient; show uncertainty and no confident current track highlight.
- Show detector reason immediately, then separate Gemini pending/validated/fallback/unavailable and voice enabled/queued/playing/failed states. Do not label a template “Gemini explanation.” Preserve original questionnaire answers alongside the confirmed summary. Optional scenario banner and per-value label remain visible at all widths.

## UI handoff and proof checklist

P1-A1 must deliver typed props, dashboardFixtures, tokens, atom gallery and callback spies. P2-C/D produce presentation only. P5 integrates real behavior. No external project/upload is authorized by this document; the user operates any selected tool.

- [ ] Render every named fixture at 1280×800 and 390px, plus 200% zoom: empty, collecting, usable, posture without request, uncertain identity, moved patient, open request, checked/rearming, provider failure, stopped camera, simulated temperature, two visits.
- [ ] Check keyboard selection maps request → correct visit → current track, with uncertain track correctly absent. Click actions and prove the matching callback ID exactly once; verify pending and failed-action display. Visual screenshots alone do not prove this.
- [ ] Confirm live/stale text comes from the actual watchdog after integration. No fake live dot on synthetic harness. Confirm null trend gaps, source/time labels, unchanged pulse during acted slump, and always-visible simulated label.
- [ ] Measure contrast, focus order, overflow and touch targets in rendered browser; preserve screenshots with fixture names and viewport. Run typecheck/build; scan external exports for extra dependencies/hooks/API/state/medical rules before integration.
- [ ] Run a short timed operator walkthrough on the actual laptop: locate selected patient, identify why the check was requested, acknowledge, mark checked, and identify an unavailable channel. Record errors/time without inventing a usability pass or calling it a clinical study.

Primary accessibility references: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). These targets still need rendered validation.
