# Local phone HTTPS — P1-A2

Status: configuration and proxy guards tested; actual certificate trust, phone reachability, camera and flashlight remain unverified. No tunnel, deployment, certificate generation or system trust change was performed.

## Required user configuration

Use a hostname that resolves to this laptop from the designated phone, and an existing certificate trusted by that phone for that hostname. The certificate/key must already be placed inside this app's ignored `.local/certs/` directory. Do not paste private key contents into chat. The directory itself and its parents must not symlink outside the project. Plain LAN HTTP and a browser certificate warning do not pass this gate.

From the app directory, set these environment variables in each relevant terminal (example hostname only; replace it with the actual trusted hostname):

```sh
export WR_PHONE_ORIGIN=https://phone.waiting.test:8443
export WR_TLS_CERT_PATH=.local/certs/phone-cert.pem
export WR_TLS_KEY_PATH=.local/certs/phone-key.pem
```

Start `npm run dev` for loopback API/operator UI, then in a second terminal with the same values run `npm run dev:phone`. Operator: `http://127.0.0.1:5173/check-in`. Create a visit, record consent, and choose phone continuation. Its QR opens the configured origin followed by `/patient#code=…`; the single-use grant appears only in the fragment. The same patient session handles questions and pulse. `/phone` remains available for an explicitly issued legacy PPG-only pairing. Never invent a pairing code. The phone confirms the actual visit label before proceeding.

`WR_PHONE_ORIGIN` also supplies the client QR origin. The API and operator UI must start with the same value as phone mode; a conflicting `VITE_PATIENT_ORIGIN` is rejected. Restart the processes after configuration changes. No key/certificate contents belong in screenshots, logs or chat.

Only phone mode listens on the LAN. It requires all three configured values and fails closed when paths/origin are invalid. The API stays on `127.0.0.1:8787`. Vite preserves Host and Origin; only the exact configured HTTPS origin can make paired phone mutations. There is no broad CORS allowance. Phone mode disables HMR. Operator pages (`/`, `/station`, `/staff`, `/check-in`, `/vision`, `/gallery`), private API paths, encoded variants, foreign Host/Origin and forwarding headers are rejected before proxying. The API allowlist contains health, pairing, clock sync, own patient session/finish, own questionnaire/summary and capture operations. Backend purpose/visit/session checks still apply; a phone has no room, media, staff-action or station authority. Secure cookies remain required on the configured phone origin.

## Actual device proof to record with the user

1. Record phone model, OS/browser/version, hostname, certificate trust and Wi-Fi reachability. Open `/patient` with no certificate warning; confirm `isSecureContext` and camera permission availability. Do not install a trust root without explicit user action/authorization.
2. Scan the current patient-continuation QR from the intended demo visit. Confirm the displayed visit before questions/capture.
3. With the consenting volunteer, verify the actual rear lens and continuous flashlight, comfortable immediate stop, local derived waveform, cadence and about 30 seconds of usable data within the 60-second attempt limit.
4. Confirm the real saved Measurement appears under the same visit with original interval, quality and provenance after a fresh SQLite reopen. Test permission denial, unsupported torch, no finger, interruption, lost transport, retry and visit switch.
5. Record an independent pulse reference if available. Without it, report acquisition only; do not claim accuracy or mark AC-04/device acceptance complete.

The automated proxy tests deliberately use loopback HTTP to exercise routing. They do not establish TLS trust, browser cookie behavior on the physical phone, rear-camera/torch support or physiological accuracy.
