# P15b implementation plan

Spec: `.plans/codex/P15-fixes.md`, P15b only. Work stays in the assigned files; shared types and existing HTTP routes stay frozen.

1. Check-in: regression tests first for spoken date normalization and spoken-friendly Next guidance; accept named-month dates and unambiguous day/month dates, reject ambiguous numeric dates; add manual Continue, visible steps and conversation scroll following.
2. Queue and reset: regression tests through a real in-memory HTTP server for removal, matching, record retention, reset latency/side stores, and kiosk help. Append routes, retain records using the existing disposition pattern, reset all side stores explicitly. Bound client reset requests and show confirmation.
3. Stations and staff: regression tests for per-tab storage, query roles, navigation, permission failure and recognition restart. Keep only Exam room 1 in the picker, preserve existing direct room URLs, add a one-click Stations control, push-to-talk fallback and mic feedback. Keep the live overlaid room stream prominent.
4. Run full tests and typecheck, verify fictional journeys in Chrome on API_PORT=8812 WEB_PORT=5212, report human-only voice/camera checks and exact ElevenLabs configuration changes. Commit and push every working step; never merge.
