# Crisp — Apple Design fixes

October 25, 2026 · Branch: `crisp-demo-apple-design`

This implementation addresses all nine findings in the [frontend audit](apple-design-audit-2026-10-25.md). The design keeps Crisp's apple companion and green identity, with clearer priorities, quieter alerts, scalable typography, and predictable interaction.

## What changed

| Audit finding | Result |
| --- | --- |
| Misleading healthy status | The dashboard distinguishes reconnecting, no active camera, paused and stale feeds, live input, replay input, and synthetic preview. The camera page reserves LIVE for a ready source with recent visible frames and nonzero frame rate. |
| Amber contrast | Amber alert text now measures **5.83:1** on its tinted surface; white text on filled amber tags measures **6.11:1**. Red alerts also use a quieter tinted surface with darker text. |
| Queue below secondary content | Camera and patient queue share the main desktop layout. The queue comes first on phones. The incident debrief is expandable, and assistant tools follow the operational area. In the synthetic preview, the queue moved from **y=1397 to y=445** on desktop and from **y=2281 to y=703** on a 390px phone. The first desktop Mark checked action fits within the 1000px viewport. |
| Check-in progress overlap | Help/navigation and progress occupy separate rows on phones. Both still fit with 200% text. The complaint text area also has room for its placeholder and typed response. |
| Clipped toolbars | Room actions wrap into a two-column layout on phones. Dashboard controls wrap, while sound testing and demo reset are available inside System. Populated exam selectors and lobby estimates also fit with larger text. |
| Lost focus after closing details | Closing the patient drawer returns focus to its invoking button. If that button has left the document, focus goes to the waiting-room heading. |
| Inconsistent Escape behavior | Call in closes with Escape and returns focus to its trigger. It moves focus into the room choices when opened and dismisses on outside pointer input. Camera settings support Escape in the ordinary camera view as well as the room/demo views. Escape closes a nested room picker before the patient drawer. |
| Fixed text sizes | Typography across the shared shell, kiosk, dashboard, camera, room, station picker, exam, and lobby uses rem units. Shared spacing/radius tokens scale with the root text size. Headings retain deliberate tracking and leading. |
| Small touch targets | Patient details, replay controls, camera links, camera correction, station switching, and the exam camera toggle have at least 44px hit heights. |

The shared navigation has a subtle translucent surface, a visible selected page, and a compact scrolling layout on phones. The current page stays visible when the screen is resized. Press feedback is immediate and restrained. Reduced motion remains supported, and reduced transparency/increased contrast have explicit solid-surface fallbacks.

The Stations control sits in the document footer so it cannot cover a check-in choice or instruction. Room view already has its own Stations link. Station shortcuts and the existing hold behavior remain available.

## Verification

- **418 tests pass in 63 files**, including new regressions for honest monitoring state, room-picker dismissal, and unavailable camera labeling. The first new-test run reproduced the audit failures before the implementation.
- `npm run typecheck` and `npm run build` pass. The build still reports the existing large JavaScript chunk warning caused by the application bundle; this pass adds no dependencies.
- **64 browser layout checks:** eight routes × four widths (1440, 768, 390, 320px) × normal/200% root text. Checked document and visible content overflow, touch-control heights, text growth, and queue placement. Scrolling navigation intentionally contains offscreen links; it fits its viewport and keeps the active page visible.
- **12 additional browser checks:** populated fictional clinician charts and lobby call-outs at 1440, 390, and 320px, with normal and enlarged text. These use browser-only synthetic responses.
- Browser assertions verify patient focus restoration, nested Escape behavior, standalone camera settings dismissal, no-camera/disconnected status, no overlap in kiosk navigation, symptom selection without an obscuring control, amber contrast, reduced motion, and increased contrast.
- Provider access was disabled, the local API used an in-memory store, and patient actions used the existing synthetic preview. No real patient record was created or called.

The first sandboxed baseline suite could not bind localhost and failed network-dependent cases. Running the suite with local server binding permitted resolved those failures. A historical root-level test command was also run once from the wrong directory; the reported test results above are from `apps/demo/`.

## Screens and measurements

- [Dashboard overview](apple-design-fixes-2026-10-25/dashboard-desktop.png)
- [Dashboard on a phone](apple-design-fixes-2026-10-25/dashboard-mobile.png)
- [Check-in questionnaire on a phone](apple-design-fixes-2026-10-25/checkin-mobile.png)
- [Populated fictional clinician chart](apple-design-fixes-2026-10-25/exam-mobile.png)
- [Populated lobby call-out](apple-design-fixes-2026-10-25/lobby-mobile.png)
- [Browser measurements and assertions](apple-design-fixes-2026-10-25/verification.json)

## Remaining human checks

Real camera sensing, microphone/speaker output, external Gemini/ElevenLabs sessions, Safari, and screen-reader behavior need a human/device pass. No claim of live sensing or provider verification is made by these layout checks.

## Requests for integrator

Review and integrate `crisp-demo-apple-design` into `crisp-demo` after the human checks. The API routes, shared data contracts, sensing algorithms, and dependencies were not changed. Planning commits and unrelated work created concurrently in the shared worktree were preserved.
