# Crisp on Vultr — human-run deployment kit (P18c)

**Status: kit prepared; no VPS has been created or deployed by this packet.**
The owner performs every account, billing, server and deployment action below.
Check event credit availability and the current price in Vultr before buying.

One Ubuntu VPS runs two containers: Caddy serves the optimized client and proxies
`/api/*` unchanged to the existing Node API. The API has no published host port.
SSE and MJPEG remain streaming responses; client deep links fall back to
`index.html`, while missing models/modules return 404. Camera inference still
runs on the camera laptop, so a GPU VPS is unnecessary. A 2 GiB RAM VPS is a
suggested starting point for the build, not a measured capacity claim.

This remains a hackathon demo without application authentication: anyone who can
reach the URL can read room data and invoke its actions. Use fictional records
and consenting demo volunteers. Keep the URL within the demo group and stop the
services after filming. HTTPS protects transport; it does not add access control.

## 1. Owner: create the VPS and choose its hostname

1. Create your Vultr account, check any offered MLH credits, and create an Ubuntu
   **24.04 LTS** Cloud Compute instance. Record its public IPv4 address.
2. In the Vultr firewall attached to that instance, allow inbound TCP **22** from
   your own administrative IP and TCP **80, 443** for the website and certificate
   challenges. UDP **443** is optional for HTTP/3. Do not expose 8787 or 5173.
   Apply equivalent rules if you use a host firewall; preserve SSH access.
3. Use either a domain you control with an A record pointing to the VPS, or
   `<VPS_PUBLIC_IPV4>.sslip.io`. For example, `203.0.113.10.sslip.io` is a
   **documentation placeholder**, not a working Crisp host. Do not enter a scheme,
   port or path in `CRISP_HOST`. Remove a stale AAAA record if IPv6 is not set up.
4. Connect with your normal SSH login. The commands below use `root@VPS_IP` as a
   placeholder; use the account your instance actually provides.

Caddy needs correct DNS, reachable ports 80/443 and persistent certificate storage
for [automatic public HTTPS](https://caddyserver.com/docs/automatic-https).
[sslip.io](https://sslip.io/) resolves an embedded IP without purchasing a domain;
public DNS/certificate service availability and rate limits can still affect it.
If a certificate cannot be issued, fix DNS/firewall or use your own domain.
Do not bypass certificate warnings or enable insecure-origin browser flags.

## 2. Owner: install Docker on the fresh Ubuntu VPS

Skip this if Docker Engine and the Compose plugin already work. These commands
are for the **VPS**, not your Mac. They add Docker's official apt repository and
install its packages; they do not execute a downloaded installer script.
If the machine has a conflicting Docker installation, follow the
[official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/)
instead of removing existing software blindly.

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<'EOF'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Docker-published ports can [bypass ufw rules](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations).
Use the attached Vultr firewall for the intended network boundary; this kit only
publishes 80/443.

## 3. Owner: transfer the committed app

On your **Mac**, from the repository root, check that HEAD includes the desired
integrated filming changes. The archive contains committed `apps` files,
including model binaries, and excludes untracked keys, node_modules and room data.
The `ssh` destination below is the VPS you own; replace `VPS_IP` before running.
Use a new `/opt/crisp` directory for the first transfer. For updates, use a new
release directory as described below rather than overlaying an old release.

```sh
git branch --show-current
git log -1 --oneline
git archive --format=tar HEAD apps | ssh root@VPS_IP 'mkdir -p /opt/crisp && tar -xf - -C /opt/crisp'
```

No GitHub credentials or provider file needs to be copied from the Mac. Do not use
`scp -r` on the whole repository. Keep a note of the commit you transferred.

## 4. Owner: place provider settings only on the VPS

On the VPS, make a private directory **outside** the checkout/build context:

```sh
sudo install -d -m 0700 /etc/crisp
sudoedit /etc/crisp/providers.env
```

Enter only the values you intend to use. Plain `NAME=value` lines, without shell
expansion or trailing comments, work with the existing reader:

```dotenv
GEMINI_API_KEY=
GEMINI_MODEL=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL_ID=
ELEVENLABS_AGENT_ID=
ELEVENLABS_NURSE_AGENT_ID=
```

Blank values intentionally leave features unavailable: summaries use templates,
voice can fall back to browser speech, and agent controls can be unavailable.
If the nurse agent ID is blank, the existing server uses the check-in agent ID.
Never put keys in a `VITE_*` variable, command argument, Docker build argument,
the Compose `.env`, a client file, a screenshot or Git.

The API image runs as Node's UID/GID 1000. Give **only this file** that ownership
and owner-read/write permission so the read-only secret mount is readable by Node:

```sh
sudo chown 1000:1000 /etc/crisp/providers.env
sudo chmod 0600 /etc/crisp/providers.env
```

Keep the parent directory root-owned with mode 0700. Compose grants the
[file secret](https://docs.docker.com/compose/how-tos/use-secrets/) only to `api`,
at `/run/secrets/providers`; `PROVIDERS_ENV` already points there in the image.
The Caddy image contains the client build, not this file or the API source.

## 5. Owner: configure, validate and start

On the VPS:

```sh
cd /opt/crisp/apps/deploy
cp -n .env.example .env
nano .env
```

Set `CRISP_HOST` to the hostname from step 1 and keep
`CRISP_PROVIDERS_FILE=/etc/crisp/providers.env`. These are the only two Compose
settings. The hostname must resolve to this VPS before requesting a certificate.
Then run:

```sh
sudo docker compose --env-file .env -f compose.yaml config --quiet
sudo docker compose --env-file .env -f compose.yaml build
sudo docker compose --env-file .env -f compose.yaml run --rm --no-deps web caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker compose --env-file .env -f compose.yaml up -d --wait --wait-timeout 120
sudo docker compose --env-file .env -f compose.yaml ps
sudo docker compose --env-file .env -f compose.yaml logs --tail=50 web
```

`api` should become healthy and `web` should be running. Caddy may still need time
to obtain its certificate; inspect the web logs for issuance or challenge errors.
Do not repeatedly rebuild to fix a DNS or certificate problem.

`room_data` stores the existing `.data` state; `caddy_data` retains certificates;
`caddy_config` retains Caddy's configuration data. These named volumes survive
container replacement. Keep **one** API instance: SSE, current video and replay
buffers are in memory. Visits/descriptors persist, but live frames/replays do not
survive restart. Provider edits require `docker compose ... restart api`; Caddy
hostname changes require `docker compose ... up -d` to recreate its environment.

## 6. Exact human test script (complete before filming)

Replace `YOUR_HOST` consistently with the same hostname on both laptops.

1. On your Mac, from `apps/`, using Node 24 or newer:
   ```sh
   curl -I http://YOUR_HOST/check-in
   node deploy/check.mjs https://YOUR_HOST
   ```
   HTTP should redirect to HTTPS. The checker must pass client, API and SSE.
   `SKIP MJPEG: NOT CHECKED` is expected until camera A is producing frames; it is
   not a video pass. The checker uses GET only and prints no room data or keys.
2. In Chrome on **laptop A**, open `https://YOUR_HOST/check-in`. Confirm there is
   no certificate warning. Open DevTools Console and Network, then reload. Leave
   them open throughout this script. The page must render without console errors.
   Select **I'd rather tap**, check in the fictional **Anna Lopez**, DOB
   **1997-07-21**, and use a consenting volunteer's camera scan when prompted.
   Finish the on-screen questions. Note the displayed queue number; never assume
   it is #1 if the server already has demo visits.
3. On **laptop B**, open `https://YOUR_HOST/dashboard`. **Before starting the room
   camera**, expand **Stream options** and click **Use proxy stream**. The button
   should now read **Use direct stream**. Repeat this selection after every
   dashboard reload: the current client defaults to a direct API port (8787),
   which is intentionally not public in this kit. The same Anna and queue number
   must appear without reloading. Network must show `/api/events` with
   `text/event-stream`, staying open while new state arrives.
4. After completing check-in, on **laptop A** open
   `https://YOUR_HOST/room?cam=A&debug=1`. Allow camera permission and click
   **Start monitoring (sound on)**. Keep that window visible. Verify moving live
   video, pose model **ready**, skeleton and recognition when the volunteer is in
   view. Network requests under `/models/` must return actual model/WASM assets,
   not HTML. If no estimate is reliable, the UI must show measuring/low signal.
5. On **laptop B**, click **Start monitoring (sound on)** and confirm the dashboard
   shows the moving room feed, not a stale still. Rerun
   `node deploy/check.mjs https://YOUR_HOST` on the Mac; MJPEG headers should now
   pass. Header checks alone do not prove that video is moving.
6. Check browser mic permission separately: on the check-in welcome screen click
   **Talk to Crisp**, allow the microphone, and exchange a short greeting. If no
   provider/agent is configured, report voice **unavailable** and use the tap form;
   do not call this a voice pass. Keep a camera view on its own visible laptop or
   window while demonstrating another role. HTTPS enables the secure context;
   it cannot grant permissions, activate sound, or guarantee provider availability.
7. From the dashboard, call Anna into **Room 1**. Open
   `https://YOUR_HOST/exam?room=1` on the other laptop and confirm Anna's chart
   opens. Open `/lobby` and confirm the call-out. Enable lobby sound with its
   on-screen control if needed. Reload `/check-in`, `/dashboard`, `/room`,
   `/lobby`, `/station?choose=1` and `/exam?room=1` directly: all must render.
   Repeat the dashboard proxy selection after reloading it.
8. If using a replay instead of a live camera, verify **REPLAY** is visible on
   the room view and dashboard. Film only real estimates, measuring or low signal;
   describe requests as **may need a check**, never a diagnosis or triage result.
9. Inspect Console/Network on both laptops. Any 404 model, WASM MIME, stream or
   permission error means that specific check is incomplete. If a dashboard
   reload attempted `https://YOUR_HOST:8787`, select the proxy stream and recheck
   video; record that known client default issue separately. Do not expose 8787
   to work around it. Use the local production fallback below if filming cannot
   wait.
10. Optional persistence check, outside the recorded take: restart `api`, reload
    the dashboard, and confirm Anna remains. Expect camera feed/replay buffers to
    reset; restart the camera page if needed. Do not reset or remove demo data to
    perform this check.

Browser camera/mic access requires a [secure context](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
and user permission. Localhost is useful for a single-computer fallback; a remote
HTTP IP address is not an equivalent setup.

## Troubleshooting and updates

| Symptom | Check |
| --- | --- |
| HTTPS unavailable | DNS A/AAAA, Vultr firewall TCP 80/443, Caddy logs; use a valid owned domain if shared DNS/CA issuance is blocked. |
| 502 / API unhealthy | `docker compose ... logs --tail=50 api`; confirm the secret file is readable by UID 1000 and the room volume is writable. |
| Frozen queue/video | Keep camera window visible; confirm SSE and MJPEG in Network. No proxy response buffering or stream timeout is configured. The kit follows Caddy's [streaming behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#streaming). |
| Dashboard requests `https://YOUR_HOST:8787` | In **Stream options**, click **Use proxy stream** after each dashboard load. It must request `/api/stream.mjpg` on the HTTPS origin. The integrator should change the default in `client/dashboard/VideoPanel.tsx`; P18c does not own that file. |
| Model/WASM fails | Check `/models/` requests, model files in the transferred commit, and rebuild the web image. Missing assets must not return SPA HTML. |
| Voice unavailable | Check server-only IDs/keys privately and restart `api`; use the tap form/browser speech fallback when the provider is unavailable. |
| Build runs out of memory | Choose more VPS RAM or build the images on an authorized machine for that VPS architecture. No capacity test was run here. |

The `...` in this table means `--env-file .env -f compose.yaml` from the deploy
directory. Do not publish raw diagnostic logs containing private demo data.

For an update, note the running commit/image IDs first. Transfer the new committed
archive into a **new** directory such as `/opt/crisp-next`, place the same
non-secret `.env` there, and rerun step 5 from that release's deploy directory.
The Compose project name remains `crisp`, so its named volumes are reused.
Keep the old release and old images for recovery; to roll back, run step 5 from
that release. Do not prune images or delete volumes as part of this packet.

Stop services without deleting containers or volumes:

```sh
cd /opt/crisp/apps/deploy
sudo docker compose --env-file .env -f compose.yaml stop
```

Stopping Docker services does **not** stop Vultr billing. Any later VPS deletion
or account change is a separate owner action. Do not use `down -v`, volume prune,
or permanent cleanup commands. Keep room data and certificates recoverable.

## Local production fallback

On the Mac, from `apps/`:

```sh
npm install
API_PORT=8833 WEB_PORT=5233 PROVIDERS_ENV=/dev/null npm run demo
```

Open `http://localhost:5233` on that Mac. Omit the `/dev/null` override only when
you intentionally want the existing local provider configuration. Run
`node deploy/check.mjs http://localhost:5233` in another terminal. Finish with
Ctrl+C and confirm ports 8833/5233 are closed. This local fallback is not evidence
of Vultr hosting; only claim that track after the public two-laptop checks pass.
