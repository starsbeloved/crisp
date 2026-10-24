# Waiting Room Monitor

SBUHacks 2026 prototype connecting patient check-in, face enrollment, phone camera pulse capture, room-camera observations, and staff check requests.

The active application is in [`apps/waiting-room`](apps/waiting-room). Root `server`, `packages`, `tests`, `.plans` and `outputs` include preserved ECHO explorations. Use the active application's commands for development.

## Local development

Requires Node.js 24 or later and npm.

```bash
cd apps/waiting-room
npm ci --ignore-scripts
npm run dev
```

Default local client: `http://127.0.0.1:5173`; service: `http://127.0.0.1:8787`. Open `/check-in`, `/vision`, and `/staff` for the three workspaces. `/patient` is the paired phone entry; it needs a reachable trusted HTTPS address for camera capture. See [phone setup](apps/waiting-room/docs/phone-https.md) and the [demo runbook](apps/waiting-room/docs/demo-runbook.md).

```bash
npm run typecheck
npm test
npm run build
```

Some tests open temporary localhost listeners. Automated checks establish software behavior; actual face matching, phone PPG, camera physiology and provider playback require separate device/provider verification. The prototype supports a human check request and does not provide diagnosis or clinical triage.

## Branches and review

- `main`: reviewed source checkpoint. A checkpoint does not imply all device acceptance criteria have passed.
- `dev`: integration work.
- `fix/ui`: UI redesign, developed in an isolated worktree.

Review UI changes into `dev`, run integration checks, then promote accepted work to `main`. Each agent uses its assigned checkout and files; coordinate ownership before simultaneous edits.

## Design and agent handoff

- [Product specification](docs/superpowers/specs/2026-10-24-waiting-room-monitor-design.md)
- [UI stories, copy, components and apple theme](docs/plans/2026-10-24-waiting-room-monitor/ui-experience-blueprint.md)
- [Tool-neutral UI implementation workflow](docs/plans/2026-10-24-waiting-room-monitor/agentic-ui-workflow.md)
- [Project instructions](AGENTS.md)

The UI blueprint is a proposal for review. Repository setup does not begin the redesign automatically. Latest explicit user assignments govern tool ownership; historical plan checkpoints may not describe the latest runtime status.

## Local data and assets

Environment files, local databases, private run data and generated screenshots are excluded from Git. Keep credentials on the server/local environment and use synthetic fixtures for UI previews. Do not commit participant images, face representations or recordings.

Versioned model assets retain their upstream licenses/notices under `apps/waiting-room/public/models/`. Their presence does not establish measurement accuracy or face recognition performance.
