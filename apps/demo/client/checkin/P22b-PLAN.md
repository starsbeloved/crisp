# P22b implementation plan

Scope: only `client/checkin/**` and `client/camera/signals/**`. Preserve the audited layout, public tracker API, shared types, routes and provider configuration.

1. Test a kiosk pulse session with current evidence, 15 s target, 25 s maximum, real 1 Hz samples, no number after cover, and replay labeling. Expose optional spectral ratio for debug.
2. Add a camera hook and pulse panel using current design tokens: same video/stream, cheek + forehead samples each new frame, refreshed landmarks, countdown, measured waveform, coaching, Skip and local reference comparison.
3. Insert pulse after enrollment for form and voice. Prevent voice tools from bypassing it, preserve answers and attach readings after visit creation. Observation failure must not duplicate a visit.
4. Run focused/full tests, typecheck and production demo on API 8862 / web 5262. Verify real Chrome with synthetic inputs and mocked providers, inspect screenshots, report live-camera acceptance honestly. Commit/push working steps; stop owned servers.

Human acceptance requires four actual camera/reference trials in filming light. Synthetic tests do not establish camera accuracy.
