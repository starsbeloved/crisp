# Crisp demo application

**Crisp is a proactive AI assistant for hospitals and clinics.** The [project README](../../README.md) describes the hospital-wide vision and the current demonstration across intake, room awareness, staff coordination, and exam-room context.

This directory contains the active React/TypeScript client and Node HTTP server. Requires Node.js 24 or newer. From this directory:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/station` to choose a role. `npm run demo` builds and serves the optimized version. Run `npm run typecheck`, `npm test`, and `npm run build` here rather than in the historical repository-root application.

Vision assets are in [`public/models`](public/models/). See [model locations and providers](docs/models.md) and [conversational agent setup](docs/crisp-agent.md).

## Deploy

The [Vultr deployment guide](docs/deploy-vultr.md) contains the human-run Ubuntu,
Docker Compose and HTTPS steps. The kit in [deploy/](deploy/) builds the client,
runs the existing Node API, and serves both on one HTTPS origin through Caddy.
Provider keys are mounted only into the API container; room state and certificates
use persistent volumes. There is no Vite development or preview server in the kit.

No account, VPS or deployment is created by these files. After the owner deploys,
run the read-only smoke check from `apps/demo/` with Node 24 or newer:

```sh
node deploy/check.mjs https://YOUR_HOST
```

An inactive camera is reported as **NOT CHECKED**. Complete the guide's exact
two-laptop browser test before filming or claiming Vultr hosting works.

For local production verification:

```sh
npm install
API_PORT=8833 WEB_PORT=5233 PROVIDERS_ENV=/dev/null npm run demo
# In a second terminal, from apps/demo:
node deploy/check.mjs http://localhost:5233
npm test
npm run typecheck
```

`PROVIDERS_ENV=/dev/null` tests honest provider fallbacks without loading keys.
Stop the local demo with Ctrl+C when finished.
