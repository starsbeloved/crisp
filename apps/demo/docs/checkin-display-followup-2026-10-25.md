# Check-in display follow-up

Branch: `crisp-demo-checkin-bubbles` (includes the camera balance follow-up).

## What works

- Crisp's current message appears in a speech bubble above the character. The conversation uses normal page flow, without a nested scrolling chat box.
- Answer summary and conversation history start hidden. **View options** at the bottom of the page provides independent, keyboard-accessible switches to reveal them.
- Corrections still update the shared check-in answers. Hiding the summary preserves saved answers. Returning to welcome hides the previous visitor's conversation and resets the display switches.
- **I need help** now has a 60px minimum height, larger text, a visible icon, and a solid green surface. Its existing help request and confirmation behavior are retained.

## Verified

- 424 tests across 63 files passed; typecheck and production build passed.
- Chrome: ten layout/flow checks across 1440, 1024, 768, 390, and 320px widths, normal and doubled text. Checked default hiding, footer placement, switches, corrections, long captions, face-scan skip, tap fallback, and a completed check-in with a simulated queue response.
- Additional phone browser check confirmed that the enlarged help button sends one POST to the help endpoint, shows the returned success confirmation, and meets its 60px minimum height.
- Visual inspection of desktop and phone speech bubbles. Existing production bundle-size warning remains.

## Limits / integrator request

Browser checks simulated the voice provider and API responses; no real patient, microphone, camera, or staff notification was used. This is a frontend change and does not alter provider behavior or server routes. Merge this branch into `crisp-demo` after review.
