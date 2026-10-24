# Model manifest — P1-A2

2026-10-24. Assets are prepared for local serving, not inference proof. No camera, face enrollment, embeddings, pose calls or provider requests ran. `inference.worker.ts` remains explicitly unavailable. The combined-browser worker/cadence gate belongs to D2/P3.

## Exact package decisions

| Package | Pin / code license | State |
| --- | --- | --- |
| `@mediapipe/tasks-vision` | 1.1.1 / Apache-2.0 | Installed with lifecycle scripts disabled; WASM files copied locally and hashed; not imported by product code |
| `@google/genai` | 2.31.0 / Apache-2.0 / Node >=20 | Installed with lifecycle scripts disabled; no provider adapter/call or credential inspection |
| `@vladmandic/human` | 3.3.6 / MIT / Node >=14 | Exact npm metadata/integrity resolved; not installed; inherited descriptor weight provenance/terms remain gated |

Installed Node is 26.5.0. npm reports zero vulnerabilities; GenAI's transitive `node-domexception@1.0.0` emits a deprecation warning. Package engine metadata is a compatibility precheck, not proof of browser inference compatibility. Exact npm distribution integrity values are retained in `.local/test-runs/P1-A2/research/package-metadata.json` and the installed pins in `package-lock.json`.

- Human: `sha512-Nr5mPfq1gQ+uKeXY5uM3Fj8UxvF5CEh2s6txM5wRThqaW0mF9huooOuZSrT8hhGho0hGaXLFdAwfD/2+teCv6A==`
- MediaPipe: `sha512-jwntgT5tzDrKOkqg6xNDNpRcTUnGvmylZE5DFnzPXossiWOIDdZX+C81LI75hlXhsG58YZW+lGzcmjH1qrQE/Q==`
- GenAI: `sha512-u1fw0qEiuWwNcjZixJFRfQF0awQnHb/rBBQUeiYGF+nmTXQCvcgpR2UMhKU9KNdnZdYhahY5jwS6nJ2V2tGtDA==`

## Prepared local pose files

Machine-readable complete paths, byte counts, SHA256 hashes and sources: `public/models/manifest.json`. All assets load from this app; no runtime CDN fallback is provided.

| Asset | Local URL / pinned source | Bytes / SHA256 |
| --- | --- | --- |
| Pose landmarker lite | `/models/pose/pose_landmarker_lite.task`; Google pose_landmarker_lite/float16/**1**, not latest | 5,777,746 / `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |
| WASM loaders + runtimes | `/models/mediapipe-1.1.1/wasm/` — six unchanged files from pinned npm package | Each recorded in JSON manifest |
| License | `/models/pose/LICENSE.txt` | 12,331 / `8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8` |

[Google's pose model page](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) supplies the [version-1 model](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task). Its linked [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf), page 2, explicitly states Apache-2.0. This verifies weight terms separately from the SDK and documentation licenses. The card is retained locally, SHA256 `e982460cedece5ad9a46aa8f13523328e9ab95d7d5b2b8c99b33f13f6a79ca86`. Preserve the upstream license/notice and identify any future modifications; current files are unmodified.

The card limits the intended evaluation to single-person, full-body pose and excludes identity/surveillance use and life-critical decisions. Our consenting one-person posture prototype must still pass actual seated framing/quality tests. This pose asset supplies no recognition and establishes no hospital suitability or room capacity. Do not interpret its benchmark numbers as this project's results.

## Descriptor asset decision — blocked, recognition still required

[Human's model list](https://github.com/vladmandic/human/wiki/Models) names default `faceres.json` + `faceres.bin` (HSE FaceRes), alternate `mobileface.json` + `mobileface.bin`, and says model licenses inherit from their sources. Its MIT code license alone is insufficient. The [HSE source](https://github.com/av-savchenko/HSE_FaceRec_tf) has an Apache-2.0 repository license and VGGFace2 training provenance, but this audit has not established an exact conversion-to-release correspondence and applicable terms for Human 3.3.6 FaceRes weights. No descriptor asset was downloaded, hashed, served or enabled. BecauseofAI's MIT repository alone is likewise not treated as automatic proof for a converted weight file. Do not use InsightFace weights on an assumption that its code license covers them.

**Proposed equivalent with verified author weight terms:** Davis King's `dlib_face_recognition_resnet_model_v1` recognition weights. The [author explicitly releases his model files into the public domain](https://github.com/davisking/dlib-models/blob/master/README.md). [face-api.js documents its 128-value recognition network as the equivalent dlib network using King's weights](https://github.com/justadudewhohacks/face-api.js#face-recognition-model), with [MIT conversion/library code](https://github.com/justadudewhohacks/face-api.js/blob/master/LICENSE). This supports a recognition alternative, not a tested runtime switch. Before adoption, pin the exact converter/package/repository commit, hash its two recognition shards + manifest, check detector/landmark weights separately, and prove worker/browser compatibility and participant calibration. No replacement package or asset was installed in P1-A2. Never substitute seat-only identity.

## Outstanding gates

Descriptor choice/converted-file lineage and browser compatibility remain open; P3 live identity is not ready. Pose worker/cadence, actual phone TLS/camera/torch, consented acquisition, reference comparison, Gemini/ElevenLabs connectivity and playback remain unverified. No raw video, face images or embeddings were acquired/uploaded.
