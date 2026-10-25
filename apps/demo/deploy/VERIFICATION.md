# P18c implementation and verification record

Date: 2026-10-25. Worktree: `crisp-p18c`, branch: `crisp-demo-p18c`.
Base: `25054c4`. Scope: deployment kit, Vultr guide and README deploy section.

## Work completed

1. Read AGENTS.md, the demo spec, P18c only in P18-plan.md, and P17-fixes.md.
   Verified an isolated linked worktree and a clean starting tree. Installed demo
   dependencies: zero reported vulnerabilities; npm reported pending install-script
   approvals for genai/fsevents/protobufjs. No additional scripts were approved.
2. Added a Docker build with separate API and Caddy targets, streaming proxy,
   client deep links, server-only provider file, persistent state/certificate
   volumes, and a read-only deployment checker. Seventeen checker tests failed
   before the corresponding implementation/fix and then passed. First working
   step committed and pushed as `1f84a3d`.
3. Added the human-run VPS guide, two-laptop test script, local fallback, and
   operating/recovery instructions. Reviewed the full packet without a subagent
   tool (self-review; no independent reviewer was available).

## Local evidence

- Baseline `npm test`: 53 files, 343 tests passed.
- With deployment checks, `npm test`: 54 files, 360 tests passed.
- `npm run typecheck`: passed.
- Production build started with
  `API_PORT=8833 WEB_PORT=5233 PROVIDERS_ENV=/dev/null npm run demo`.
- `node deploy/check.mjs http://localhost:5233`: API, built routes/bundle and
  actual SSE room-state event passed. Inactive camera A explicitly reported
  `SKIP MJPEG: NOT CHECKED` rather than a video pass.
- Chrome rendered `/`, `/check-in`, `/dashboard`, `/lobby`, `/station?choose=1`,
  `/exam?room=1`, `/camera?cam=A&debug=1` and `/room?cam=A&debug=1`.
  No captured console errors; Room view reached **Pose model: ready · GPU** and
  **Face models ready**. MediaPipe emitted its library warning
  `OpenGL error checking is disabled`. Camera/mic permission was not granted;
  live capture, recognition, spoken output and moving dashboard video were not
  verified. Zero fps while waiting for camera access is not a performance result.
- All 14 assets listed in `public/models/manifest.json` were fetched from the
  production origin; byte counts and SHA-256 hashes matched. WASM MIME was
  `application/wasm`. An initial exploratory assertion assumed a `.task` MIME/
  ZIP prefix that this Vite build does not supply; the manifest-based check
  verified the actual bytes instead. No model source was changed.
- A temporary local runtime copy containing only `server`, `shared`,
  `client/staff/rooms.ts`, package metadata and a dependency symlink started and
  returned 200 for health and `/api/exam/gallery?room=1`; it was then stopped.
  An initial request to `/api/records?name=Anna` returned the existing 404 because
  that route needs a real visitId; this was a check error, not an API defect.

## Rulings and remaining checks

- Keep API route code, shared types and client files untouched. The existing
  dashboard selects direct `hostname:8787` streams by default. The guide uses
  **Stream options → Use proxy stream**, and requests a same-origin default from
  the integrator. Cost if not fixed: repeat the selection after each dashboard
  reload; an initial direct-stream request can fail while a camera is active.
- Use a positive Caddy flush interval: its documented SSE/unknown-length behavior
  already flushes streaming responses immediately; unlike negative low-latency
  mode, it preserves upstream cancellation on disconnect.
- Docker and Caddy are not installed in this environment. Image builds, Compose
  validation, Linux volume/secret permissions, actual Caddy routing, certificate
  issuance and two-laptop public operation remain **unverified**. The runbook
  gives the exact owner-run commands/checks. Local Node was v26.5.0; the Node 24
  container has not been executed here.
- No accounts, servers, deployment, provider requests or new dependencies were
  created. No keys were opened or printed. No source outside P18c ownership was
  edited; no protected tags/branches were touched. Keep the worktree and packet
  branch for the integrator; user instructions already selected push without merge.
- Final suite rerun: 54 files / 360 tests passed; typecheck passed; local smoke
  check again passed API/client/SSE and explicitly skipped inactive MJPEG.
- All local servers started for this packet were stopped before handoff.
  Requests to ports 8833, 5233 and temporary runtime port 8834 returned
  `ECONNREFUSED`. The agent-created Room verification tab was closed.

## Requests for integrator

Make `client/dashboard/VideoPanel.tsx` use the same-origin proxy by default for
public HTTPS, while retaining direct local streaming as an explicit option.
Run the public two-laptop checklist in `../docs/deploy-vultr.md` after the owner
provisions Vultr. This packet does not claim that a Vultr deployment is running.
