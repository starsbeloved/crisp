# ElevenLabs Staff Notifications Implementation Plan

> **Execution:** After plan approval, use superpowers:executing-plans task-by-task. Current user instruction: no subagents. User-operated tool handoffs remain optional. Checkboxes track demonstrated work only.

**Goal:** Speak the validated event message once, with no stale identity/location announcements.

**Architecture:** Implement only the owned subsystem. Use the frozen shared contracts and synthetic fixtures; integrate through named outputs, never by editing neighboring lanes.

**Tech Stack:** Server ElevenLabs REST, browser Audio, TypeScript.

**Spec:** [Approved design](../../../superpowers/specs/2026-10-24-waiting-room-monitor-design.md).

**Read first:** [master plan](../2026-10-24-waiting-room-monitor-plan.md), [contracts](../contracts.md), and [handoffs](../agent-handoffs.md). User approved the spec, not yet this implementation plan. All global constraints and Review Focus tests apply. Paths below are relative to `apps/waiting-room/`; run commands there. Public types/functions mean exactly the contracts, not renamed local variants.

**Owner:** Codex voice worker. **Dependencies:** P1-A1; P4-B validated text; P2-B event lifecycle.

**Scope boundary:** server/providers/elevenlabs.ts, client/staff/audio-queue.ts, tests/voice.test.ts. Coordinate speech/audio routes with backend owner; no UI layout/shared edits.

**Pre-flight:** API key/voice ID/model ID from server environment; verify account availability/voice authorization without exposing values. Synthetic text first; no cloning a real person. In-memory bounded audio only; no persistent public audio URLs.

**Proof/checkpoint:** At each mini-slice, record changed files and actual commands/results; send the integrator evidence for the matching status row. Use a local scoped commit if Git is available under the active workflow, otherwise a recoverable changed-file snapshot. Never initialize/push a repository or delete artifacts to finish a slice. No source packages, model assets, or code are installed by these planning files.

## P4-C1 — server TTS and eligible job

**Interfaces:** `synthesizeNotification({eventId,snapshotVersion,text},signal):Promise<Uint8Array>`; speech route takes event/version only, never arbitrary client-provided text. GET audio rechecks eligibility.

- [ ] Test provider failure/timeout, oversized text (>300 characters), stale version, wrong station, repeated speech request, and acknowledged/checked event. Assert one TTS call per eligible event/version job, no old job stream after invalidation. Run `npm run test -- tests/voice.test.ts` red.
- [ ] Implement server POST text-to-speech/:voice_id with server-only xi-api-key, 8s abort, bounded job map and transient bytes. Speech text comes from validated Gemini result or factual template. Mark failed/unavailable truthfully; never swallow into success. Discard old bytes after eligibility changes; retain only active bounded jobs (max 20) and expire after 60s in memory.
- [ ] Test exact audio status and failed provider behavior. E4-P4C1-TEST1/DIFF1. External side effect = TTS API call only for separately allowed synthetic/consenting material, not arbitrary medical text.

## P4-C2 — browser enable/mute/queue and last-second validation

**Interfaces:** `createAudioQueue({fetchSnapshot,playAudio,now,hasStarted,markStarted})` with exact signatures/return methods in contracts.md, including updateSnapshot and invalidateLocal. StaffPage supplies cancellable browser Audio adapter and sessionStorage started-event set. Abort must stop already-playing sound, not merely reject a fetch or discard a future job.

- [ ] Test no autoplay before enable; muted jobs don't later burst; duplicate polls/retries play once; location/identity version changes, acknowledged/checked events, disconnected source, or expired job suppress queued speech. Retry never replays an already spoken event. Run red.
- [ ] Before playback fetch current room state and require same open event/version and valid location/identity context; server audio GET performs same check. If unavailable use a current uncertainty template job, not stale text. Drop obsolete queue items and cancel active playback on state invalidation. Track pending/playing/played/failed separately from visible request state.
- [ ] Test acknowledge/check/mute/identity/location invalidation **during** playback: AbortSignal stops adapter, clears source and releases URL. Local changes stop immediately; remote changes stop on next <=1s snapshot poll. Failed snapshot fetch prevents start. Normal bounds/heartbeat refresh does not cancel valid speech. Reload restores started IDs; interrupted/failed-started events never auto-replay. Hidden tab/source loss invalidates locally. Test audio is a local synthetic tone, not another patient event.
- [ ] Verify enable/mute controls and actual laptop speaker using one synthetic event through real ElevenLabs if available. Repeat polling, acknowledge during pending TTS, and move before playback. Record real provider latency/audio proof, browser permission behavior, and failures. E4-P4C2-TEST1/UI1. No per-alert human approval click required after audio enable.

**Flow check:** event job -> current-state validation -> authenticated transient audio -> laptop speaker/status. No DB deletion/cleanup. Acceptance AC-11; no real provider claim from mocked audio.

**Acceptance levels:** module-ready = cancellation/dedup/provider-adapter tests; integrated = StaffPage lifecycle/session storage; provider-validated = real authorized ElevenLabs response heard on this laptop. At-most-once automatic playback may lose audio on crash after marking started; expose failure rather than claim guaranteed delivery. Multiple speaker stations are out of scope.

## Required assertion examples

Construct these local test inputs/results using the precisely described cases above; names here are test-local, not new shared exports. Keep the assertions and boundary values when implementing the tests.

```ts
expect(playAudio).toHaveBeenCalledTimes(1); // repeated eligible polls, same event
expect(playAfterAcknowledgement).toHaveBeenCalledTimes(0);
expect(playAfterLocationVersionChange).toHaveBeenCalledTimes(0);
```
