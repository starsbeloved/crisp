# Patient-session implementation contract — 2026-10-24

User authorized building the reviewed patient/nurse revision in this chat. Codex is the sole writer; paused sessions are not resumed. Existing measurement/binding/pose payloads remain version 1. Room snapshots move to version 2 with temperature/scenarios removed; strict clients reject the older snapshot rather than silently mixing versions.

## First integrated slice

- Mount the existing PhonePage through `client/phone/PhoneRoute.tsx`, which owns one source clock/run and disposes it on unmount. StrictMode is tested. No camera access until explicit consent/start.
- Add `patient` pairing purpose alongside legacy `ppg`/`questionnaire` for migration compatibility. New check-in UI issues only patient grants; legacy purposes remain narrowly scoped. No automatic station privileges.
- A patient session expires after 15 minutes from join, holds the questionnaire editor lease for its own visit, and can use existing clock/capture endpoints with role `patient`. Capture source/run/visit/sync remain frozen server-side.
- `POST /api/wr/patient/session {}` returns `{visit:Visit,expiresAtMs:number,canEditQuestionnaire:boolean}` only to the current patient cookie; POST avoids originless-read ambiguities. No room list, face representation, track or other visit is returned.
- `POST /api/wr/patient/finish {requestId}` returns `{visitId,label,completedAtMs}` after answers are committed and no capture is active. The session then permits only identical completion retry, not questionnaire/read/capture/clock access. Finish preserves a receipt on lost-response retry without disclosing answers. Completed visits cannot be paired again through this initial-check-in flow.
- `POST /api/wr/visits/:id/takeover {requestId}` is station-only: move the questionnaire lease to station. Previous phone writes fail even if their bodies began arriving before takeover; PPG may continue. Re-pairing restores the new phone's lease and invalidates previous patient sessions/captures for that visit.
- All session-sensitive routes recheck authority after reading the body. The existing origin/host/cookie and immutable capture checks remain.
- `Visit` adds nullable `preferredName`, `consentAtMs`, `completedAtMs`. `createVisit({requestId,label?,preferredName?,consent?})` stamps consent server-side. Preferred name is trimmed, 1–80 characters; it is never the ID or the public label. Existing persisted rows normalize absent new fields to null, without deleting or rewriting historical artifacts. Completion stamps service time idempotently.

## Owned files and verification

Main Codex owns `shared/{contracts,schemas,fixtures,view-model}.ts`, `server/{http,store,clock}.ts`, `client/runtime/api.ts`, phone route/session integration and matching tests. UI modules consume these exports; no alternate persistence or fake successful captures.

Write failing HTTP tests first: one patient cookie can save its own answers and start synchronized PPG; cannot read room/write another visit; expiry and completion revoke authority; completion retry is idempotent; takeover rejects old writes; re-pair cancels unfinished old acquisition. Store tests prove preferred-name/consent/completion survive reopen. Existing PPG/clock tests must stay green.

## Honest integration boundary

Face recognition/model licensing is still blocked; do not implement a fake successful face scan. Staff live sensing/event/provider integration remains unfinished until its own packets pass. The local station is a supervised demo, not a hardened unattended kiosk. Public HTTPS hosting/tunnel and real phone capture still require authorized setup and actual-device proof. A public phone must never be able to bootstrap station authority. The first UI exposes unsupported capabilities explicitly rather than claiming the full patient/nurse acceptance passed.
