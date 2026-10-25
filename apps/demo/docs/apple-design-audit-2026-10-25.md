# Crisp frontend audit — Apple Design

Date: October 25, 2026 · Branch: `crisp-demo-apple-design` · Audited commit: `8ea50ce`.

## Summary

**Needs work.** Crisp already has a coherent visual identity: restrained green controls, a calm neutral canvas, system typography, and a distinctive apple companion. The largest problems are misleading monitoring status, insufficient contrast on amber treatments, and a dashboard that places the patient queue below secondary content.

This is an audit only. The branch adds this report and local browser evidence; product code is unchanged.

## Method and scope

- Applied the installed `apple-design` skill: response, spatial consistency, accessibility, typography, and the eight design foundations. Section references below refer to that skill.
- Reviewed the current React markup, CSS, focus handling, and status presentation under `apps/demo/client/`.
- Opened eight routes in installed Chrome at widths of **1440, 390, and 320 CSS pixels**, each with a 900px viewport height: `/`, `/station?choose=1`, `/check-in`, `/dashboard?fixture=1`, `/lobby`, `/camera`, `/room`, and `/exam?room=1`.
- Ran separate interaction checks at 390 × 844 and 1440 × 900: form fallback, face-scan skip, questionnaire, synthetic acknowledge/mark checked, modal focus, Escape, and reduced motion.
- Used an isolated local API on port 8841 and frontend on 5241. The main audit used an in-memory store with providers disabled. Dashboard data came from the existing, visibly labeled synthetic preview. No real patient was checked in or called.
- `npm run typecheck` passed. No test suite or build was needed for this documentation-only change.

Evidence: [measurements](apple-design-audit-2026-10-25/measurements.json), [desktop dashboard](apple-design-audit-2026-10-25/dashboard-desktop.png), [check-in overlap](apple-design-audit-2026-10-25/checkin-mobile-overlap.png), [room clipping](apple-design-audit-2026-10-25/room-mobile-clipping.png), [320px dashboard](apple-design-audit-2026-10-25/dashboard-narrow.png).

## Findings

### 1. High / P1 — Healthy status appears when monitoring is unavailable

**Where:** `client/dashboard/SystemStrip.tsx:6–9`; `client/camera/CameraPage.tsx:69,91`.

**Observed:** With no camera registered, the dashboard says **“All systems normal”** beside a green dot. Blocking `/api/events` produces **“SSE · Reconnecting…”** inside System while the prominent summary still says “All systems normal.” The camera and room screens also show **LIVE** with camera permission denied and 0.0 fps.

**Why:** §16 Responsibility and the four kinds of feedback. The prominent status should describe whether observation is actually available. In this product, reassuring chrome can be mistaken for active room coverage.

**Recommendation:** Derive the summary from connection, active cameras, frame freshness, and visibility. Show “Reconnecting,” “No active camera,” or “Camera paused” as appropriate; reserve a healthy monitoring label for fresh observations. Distinguish “Live source selected” from “Receiving live frames” in camera badges.

### 2. High / P1 — Amber alert text has insufficient contrast

**Where:** `client/theme.css:69`; `client/dashboard/dashboard.css:59,73,105,174`.

**Measured:** White text on `--c-amber: #C77700` has **3.46:1** contrast. The amber alert description is 14px regular and the tag is 11px bold. The measured colors were verified with a browser-only amber class probe on the existing synthetic alert; this was a presentation probe, not an actual amber event.

**Why:** §14 Accessibility and §16 Craft. Small alert text should remain easy to read; use 4.5:1 as the small-text contrast target. This issue concerns text, independently of the non-color status labels already present.

**Recommendation:** Keep amber as the border/accent and use `--c-amber-text: #8F5400` on a light surface, or darken the filled amber surface. White on `#8F5400` is **6.11:1**. Preserve the written “may need a check” label.

### 3. Medium / P2 — Patient actions sit below the primary viewport

**Where:** `client/dashboard/DashboardPage.tsx:99–114`; `client/dashboard/dashboard.css:64,261–263`.

**Measured:** With the existing synthetic request loaded, the queue starts at **y=1397px** at 1440 × 900 and **y=2281px** at 390 × 900. The camera, debrief, suggestions, and shift-summary control precede it. Acknowledge remains available in the top banner, but patient details, Mark checked, and Call in require scrolling. The banner disappears after acknowledgment while the relevant patient actions remain below the fold.

**Why:** §16 Purpose, Simplicity, and grouping: make “the most important thing … the most obvious.” Staff response is a primary task; secondary explanations and assistant controls should not displace it.

**Recommendation:** Place camera and queue together near the top on desktop, with the queue or requested patient directly after the alert on narrow screens. Keep the debrief collapsible near its patient. Put Ask Crisp and shift summary after the operational controls. Preserve the useful camera view and explanation rather than adding another panel.

### 4. Medium / P2 — Check-in progress overlaps the help control on phones

**Where:** `client/checkin/checkin.css:187–195,266–267`; `client/checkin/ui/KioskProgress.tsx:6–8`.

**Measured:** At 390px width in the name step, the navigation container shrinks to **60.6px** while containing two buttons. The help button intersects the progress region by **55.4 × 25px**. The overlap is also visible in the questionnaire screenshot. The progress caption is forced onto one line, and the flex navigation is allowed to shrink below its contents.

**Why:** §16 Flexibility and grouping. Progress is informational; it should not cover an action needed by a person who is struggling to check in.

**Recommendation:** Give navigation and progress separate rows at the phone breakpoint, allow the caption to wrap, and prevent navigation from shrinking below its buttons. Verify name, face, questions, and follow-up with long labels.

### 5. Medium / P2 — Narrow toolbars put controls outside the screen

**Where:** `client/room/room.css:6,54–57`; `client/dashboard/dashboard.css:28,213–216`.

**Measured:** At 390px width, the room toolbar occupies **x=16…407px**; part of Fullscreen is outside the viewport. At 320px, the same toolbar remains 391px wide. In the 320px dashboard, Reset demo extends to **x≈377px**, and the document becomes **376px** wide. The room view's fixed scroll container means document width alone does not reveal its clipping.

**Why:** §16 Flexibility and wayfinding. A narrow layout should keep available actions visible and predictable.

**Recommendation:** Allow the toolbar action groups themselves to wrap, use a single- or two-column control layout below their required width, and keep button labels intact. Test container scroll width as well as document scroll width.

### 6. Medium / P2 — Closing patient details loses keyboard position

**Where:** `client/dashboard/PatientDrawer.tsx:14,34`; `client/dashboard/DashboardPage.tsx:115`.

**Reproduction:** Focus “Open details for Ama,” press Enter, then Escape. The drawer opens and focuses its close button correctly; after closing, `document.activeElement` is **BODY**, not the originating patient button.

**Why:** §16 Agency and Familiarity. Closing a temporary detail view should return the user to the place they came from.

**Recommendation:** Capture the invoking element before opening and restore focus after the drawer is removed, provided that element still exists. If the visit leaves the queue, choose a nearby stable queue heading or next patient control.

### 7. Medium / P2 — Similar popovers have inconsistent keyboard dismissal

**Where:** `client/dashboard/CallInPopover.tsx:3–5`; `client/camera/CameraPage.tsx:29–36,43–50`.

**Reproduction:** Open Call in and press Escape: the room picker remains open. Open Camera settings on ordinary `/camera` and press Escape: settings remain open. The same settings escape behavior exists in `/room` and camera demo view, so behavior varies by entry point.

**Why:** §7 Spatial consistency and §16 Familiarity/Agency. Temporary surfaces should provide a predictable way back without requiring pointer use.

**Recommendation:** Support Escape consistently, return focus to the trigger, and expose the controlled surface through an appropriate ID/relationship. Keep Call in as a non-modal room selector unless the task requires a modal.

### 8. Medium / P2 — Fixed pixel typography ignores larger root text

**Where:** `client/theme.css:24,30–31`; `client/dashboard/dashboard.css:11,18,71,113`; `client/checkin/checkin.css:21,28,31`.

**Measured:** Setting the root font size from 16px to **32px** leaves the dashboard title at **32px**. Controls, supporting labels, and many layout measurements also use fixed pixels. This measures root text preference behavior; it is not evidence that browser page zoom is broken.

**Why:** §15 Typography: “Scale layout with the text — spacing in rem/em, not fixed px.” §16 Flexibility also calls for different abilities and contexts.

**Recommendation:** Express body/control type and related spacing in rem/em, retain intentional heading tracking and leading, and verify larger text with all operational controls. Do not merely increase every heading.

### 9. Low / P3 — Some touch actions have undersized hit regions

**Where:** `client/station/station.css:23`; `client/dashboard/dashboard.css:99,133`; `client/exam/exam.css:17`; `client/camera/CameraPage.tsx:69`.

**Measured:** Stations is **36px** tall, the patient-detail button **38px**, View replay **30px**, the exam camera toggle **36px**, and the camera “Room view” link **18px** tall. These are smaller than the otherwise consistent 44px controls; the kiosk's main actions are comfortably larger.

**Why:** §10 Gesture details recommends hit padding, and §16 Flexibility calls for touch and differing abilities. This is a touch usability recommendation, not a claim that every sub-44px control fails an accessibility standard.

**Recommendation:** Expand the actual interactive region to approximately 44px on touch layouts, retaining smaller visual icons/text if desired. Keep the adjacent actions and page content clear of the enlarged regions.

## What works

- **Identity and restraint:** the original apple companion, green action color, neutral surfaces, and consistent rounded controls give the product a recognizable character.
- **Typography:** the system font stack, tighter heading tracking, and more relaxed body leading already follow the skill's basic hierarchy principles.
- **Immediate feedback:** buttons have active feedback; the kiosk reinforces presses with an inset treatment. No interaction was blocked to wait for a decorative transition.
- **Reduced motion:** browser emulation produced `animation: none` and `transition-duration: 0s` on the measured heartbeat. Shared, kiosk, dashboard, and mascot CSS include reduced-motion rules.
- **Check-in fallback:** the tap flow reaches name entry, supports skipping the face scan, and reaches the questionnaire without provider access. Step changes focus the heading. Primary kiosk buttons and input labels are generous and explicit.
- **Native modal foundation:** patient details use `<dialog>`, receive focus on open, close on Escape, and fit the 390px viewport without internal horizontal overflow. Focus restoration is the specific remaining issue.
- **Honest estimates:** the dashboard preview visibly labels SYNTHETIC, rows label REPLAY, and measurements remain labeled camera estimates. Text labels supplement red/amber status colors.
- **Most responsive shells fit:** launcher, station picker, check-in welcome, lobby, camera, and exam idle screens had no document overflow at the three tested widths.

## Motion and materials assessment

The reviewed surfaces do not expose a custom draggable sheet, swipe carousel, or momentum interaction. The skill's spring/velocity rules therefore do not justify introducing a new gesture system or animation dependency. The current restrained motion is appropriate for a calm waiting-room tool. Solid surfaces are readable; translucency would be an optional treatment for floating controls, after the functional findings above are addressed.

## Verification limits

- Camera permission was denied in the browser session; live sensing, face recognition, and real camera performance were not verified.
- External voice/AI providers, microphone/speaker behavior, and human reaction to the interface were not tested.
- The exam screen was reviewed in its idle state, and lobby in its empty state; a populated clinician chart and live patient call need a separate pass.
- Keyboard behavior was tested in Chrome; a full screen-reader, Safari, or device touch audit was not performed.
- Reduced transparency and increased contrast have no explicit frontend media-query rules. Current surfaces are predominantly solid, so missing reduced-transparency handling was not elevated into a defect.

## Requests for integrator

Address status honesty and amber contrast first, then dashboard hierarchy and keyboard focus. Fix the mobile layout issues before claiming phone support. Apply any implementation in a subsequent change; this branch is review evidence only.
