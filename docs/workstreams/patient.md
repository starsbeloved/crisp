# Patient experience workstream — 2026-10-24

Status: patient modules implemented and checkpointed for main-chat integration. No extra agents, sessions, messages, dependencies, actual camera operation or external calls.

## Integration requests / exports

- Main owns App route wiring: named `CheckInPage` from `client/check-in/CheckInPage.tsx`, named `PatientPage` from `client/patient/PatientPage.tsx`.
- Consuming the exact kiosk API signatures in parallel-build.md. No alternate persistence. Questionnaire provider generation is not exposed by the current API; UI preserves originals and explicitly continues with originals.
- QR uses existing qrcode dependency. Explicit `phoneOrigin` prop or `VITE_PATIENT_ORIGIN` must be a phone-accessible trusted HTTPS origin; localhost/loopback/HTTP rejected. UI cannot establish network reachability/certificate trust; actual-device gate remains.
- Face enrollment remains unavailable until the vision integration is explicitly wired. No camera use or fake successful scan in this lane.
- PhoneRoute accepts optional already-paired visit metadata and capture state callback; legacy /phone remains functional. PatientPage confirms the visit before handing it to this capture route, without a second join.
- Patient safe readback currently contains Visit only, no contact measurement/enrollment status. Reload can confirm saved answers but cannot claim prior pulse saved. Receipt confirms completion only. Main may add a safe own-visit acquisition readback later; never broaden to room access.

## Plan

1. Preserve observed RED check-in tests; add direct patient/kiosk and already-paired capture regressions.
2. Implement shared patient shell/questionnaire, kiosk consent/help/incomplete identity/phone and no-phone flow.
3. Implement phone confirmation/questions/pulse/finish/expiry and original-payload retries.
4. Run owned UI regressions, report results and remaining device/integration gates here.

## Baseline evidence

`npm test -- tests/ui/check-in.test.tsx tests/ui/phone.test.tsx tests/ui/app-phone.test.tsx`: 19 pass, 2 fail. Both failures are missing `/check-in` and `/patient` routes. Existing staff readback test passed during this run; its body is left unchanged. No full app/device claim.

## Live integration checkpoint (12:15 EDT)

`CheckInPage` and `PatientPage` named exports now exist and are ready for App wiring. Both use the existing typed shared API. PhoneRoute accepts optional `confirmedPatient:{visitId,label}` and `onStateChange`, avoiding another join while preserving explicit camera consent. Local CSS is under `client/patient/patient.css`, rooted at `.wr-patient`.

10 direct mounted patient/kiosk tests pass, covering original-answer retry/Back, focused linked errors, same-request completion retry, expiry, idempotent create retry, no-phone path, resumed explicit takeover, and inactivity reset retry. Phone/app-phone 19 tests passed before new pages. Existing App tests still failed only for missing /check-in and /patient route wiring in the last run. Staff test body remains unchanged (baseline passed). Final owned regression pass and additional edge cases in progress.

Kiosk handoff displays no answers and suspends its local inactivity reset while intentional phone work is in progress; station/patient authority still expires server-side. Safe kiosk readback does not expose active capture state, so the UI cannot distinguish intentional phone capture from an abandoned paired handoff. Main should decide whether to add a safe capture-active flag before claiming the exact unattended inactivity acceptance.

## Final module checkpoint — 12:23 EDT

### Changed files / exports

Paths below are relative to `apps/waiting-room/`, except this note:

- New `client/check-in/CheckInPage.tsx`: named `CheckInPage({phoneOrigin?} = {})`.
- New `client/check-in/phone-link.ts`: `patientPhoneLink(origin,code)` validates an explicit HTTPS origin and puts only the pairing grant in the phone URL fragment.
- New `client/patient/PatientPage.tsx`: named `PatientPage()`; same patient session for original questions and PPG, explicit label confirmation, receipt/expiry/revocation handling.
- New `client/patient/PatientShell.tsx`: local shell, original apple-fruit SVG, help dialog and focusable error notice.
- New `client/patient/QuestionnaireForm.tsx`: accessible original-answer fields, draft preservation through Back, failed-save retry, linked/inline errors.
- New `client/patient/patient.css`: locally scoped Apple-inspired patient surfaces, mobile controls, visible focus, reduced-motion rule.
- Modified `client/phone/PhonePage.tsx`: accepts `confirmedPatient?:{visitId:string;label:string}`, `onStateChange?:(state:PhoneState)=>void`; preserves capture/DSP internals, explicit rear-camera/flashlight consent, original immutable-capture verification/retry, adds discard-without-recapture. `PatientCaptureProps` exported. Legacy controller accepts `patient` purpose alongside `ppg`.
- Modified `client/phone/PhoneRoute.tsx`: forwards optional patient props, preserves per-mount clock lifecycle.
- New `tests/ui/patient-flow.test.tsx`: 16 mounted/software cases.
- Modified `tests/ui/phone.test.tsx`: two added mounted cases for already-paired consent and discard-without-recapture (19 total tests).
- This `docs/workstreams/patient.md`.

`tests/ui/check-in.test.tsx` and `tests/ui/app-phone.test.tsx` were NOT edited. In particular, the staff test body is unchanged. No edits to App/API/shared/backend/config/dependencies/lock/global styles/capture.ts/ppg.ts.

### Verification

- `npm test -- tests/ui/patient-flow.test.tsx tests/ui/phone.test.tsx tests/ui/app-phone.test.tsx`: **36 passed, 0 failed**, exit 0.
- Final combined owned command: `npm test -- tests/ui/patient-flow.test.tsx tests/ui/phone.test.tsx tests/ui/app-phone.test.tsx tests/ui/check-in.test.tsx`: **37 passed, 2 failed**, exit 1. The two unchanged App integration tests still fail because main-owned App does not yet mount `/check-in` and `/patient`: `saves kiosk identity and answers without pretending face enrollment or pulse succeeded`; `keeps answers and shows an actionable error when a save fails`. Existing staff readback test passes in this run.
- Observed RED → GREEN for already-paired phone consent; draft Back retention; resumed kiosk takeover; repeated validation focus; completion retry/back behavior; help focus; single main landmark; same-tab closed-screen reopen; server-side revocation; discard-unsaved UI. QR expiry, declined enrollment, save/create/reset retry and delayed-response cases pass as additional scoped checks.
- Tests use synthetic HTTP/browser/capture boundaries. No actual camera/torch or patient data acquisition, provider call, network gateway, external upload, build or full suite run. Main owns whole-suite/typecheck/build and rendered integration checks.

### Integration / limitations to preserve

1. Wire the named exports to main-owned App. The direct module tests are green independently of App.
2. Set `VITE_PATIENT_ORIGIN` or explicitly pass `phoneOrigin`. Without it, QR creation is disabled and laptop questions remain available. Syntax validation does not prove reachable backend, trusted certificates or actual phone support; no localhost rewriting, cert bypass, tunnel or deployment is implemented.
3. Questionnaire Gemini generation is unavailable in the current API; the UI says so and preserves originals. No fabricated summary is supplied.
4. Face enrollment is explicitly unavailable; no enrollment success or camera preview is fabricated. Main/vision must integrate genuine consent-gated enrollment before that acceptance can pass.
5. Safe patient readback lacks contact-measurement/enrollment status. The phone can report the capture it actually saved in its current mounted flow; a reload or kiosk says not confirmed/unavailable rather than inferring prior success. The kiosk observes phone completion via visit-scoped polling, without room access.
6. Kiosk 120-second inactivity warning plus 30-second reset is tested on local editing steps; save and phone-handoff work suspend that local timer. Reset failures clear displayed personal data and block the next visitor until revocation retry succeeds. Saved records are retained. Server authority expiry remains enforced.
7. Patient authority is rechecked every 10 seconds and on visibility return; expiry clears the form and unmounts capture. A flag storing only `wr.patient.closed=1` in this tab's sessionStorage keeps completed/closed screens noneditable on same-tab reload. No answers, visit IDs or pairing codes are persisted locally. Server cookies/authority remain the enforcement boundary; the flag is only presentation state.
8. No claim of full app/device validation or unattended kiosk security. Actual browser keyboard/200% zoom/phone layout screenshots, trusted phone HTTPS, actual rear lens/torch/usable signal/save, real enrollment, staff-camera integration and scientific acceptance remain pending main/device validation.

This lane is paused at its module checkpoint. No further agents or sessions launched.
