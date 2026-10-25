# Local REPLAY fixtures

On a Mac, open QuickTime Player → File → New Movie Recording. Choose the camera and record two consenting people seated facing the camera for about 60 seconds. Save/export as `room.mp4` into `apps/demo/public/fixtures/` (convert to H.264 MP4 if QuickTime saves MOV). Record one consenting person facing the camera for about 10 seconds as `checkin.mp4`.

Open `/camera?cam=A&video=/fixtures/room.mp4` and `/check-in?video=/fixtures/checkin.mp4`. Videos loop and are labeled REPLAY on the camera and dashboard. Real face detection and JPEG streaming use this source. These personal videos are gitignored: never commit them. No fixture is bundled.

For webcam testing use separate, tiled browser windows. Check-in opens the webcam only on its face step and releases it on leaving that step. The camera page retries when its track ends. Real sharing and permission prompts need a human check.

Run `npm install`, then `npm run dev` (API 8787, web 5173). For another worktree use `API_PORT=8791 WEB_PORT=5191 npm run dev`; `HOST=0.0.0.0` binds both servers to the local network. Provider settings are server-only; P0 uses template providers.
