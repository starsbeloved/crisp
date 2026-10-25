// Real optimized client + real local models + memory-only API. No private images or providers.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = root + 'output/p18a';
await mkdir(output, { recursive: true });
process.env.PROVIDERS_ENV = '/dev/null';
process.env.GEMINI_API_KEY = ''; process.env.ELEVENLABS_API_KEY = '';
process.env.API_PORT = '18831'; process.env.WEB_PORT = '15231';
const { createAppServer } = await import('../../server/http.ts');
const app = createAppServer({ dataDir: null, readProviders: false });
await new Promise((resolve, reject) => app.server.once('error', reject).listen(18831, '127.0.0.1', resolve));
const web = await preview({ root, preview: { port: 15231, strictPort: true } });
let browser;
const errors = [], failedRequests = [], expectedPoseFailures = [], results = [];
try {
  // Only the test enrollment/size probe imports this bundle. Monitoring uses dist unchanged.
  await build({ configFile: false, logLevel: 'silent', build: { outDir: output + '/fixture', emptyOutDir: false,
    lib: { entry: root + 'client/lib/face.ts', formats: ['es'], fileName: () => 'face.js' } } });
  const fixture = await readFile(output + '/fixture/face.js');
  const sample = await readFile(root + 'node_modules/@vladmandic/face-api/demo/sample1.jpg');
  browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const base = 'http://127.0.0.1:15231';
  await context.route('**/*', route => [base, 'http://127.0.0.1:18831'].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  // Explicit fault injection verifies the requested face fallback without a skeleton.
  await context.route(url => url.pathname === '/models/pose/pose_landmarker_lite.task', route =>
    new URL(route.request().frame().url()).searchParams.get('fullpose') === '1' ? route.continue() :
      route.fulfill({ status: 503, contentType: 'text/plain', body: 'P18 test: pose deliberately unavailable' }));
  await context.route('**/p18-face.js', route => route.fulfill({ contentType: 'text/javascript', body: fixture }));
  await context.route('**/p18-sample.jpg', route => route.fulfill({ contentType: 'image/jpeg', body: sample }));
  await context.addInitScript(() => {
    window.__p18 = { spoken: [], lines: [], bones: 0, fallAt: null };
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = utterance => { window.__p18.spoken.push({ text: utterance.text, at: performance.now() }); speak(utterance); };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(t, ...args) {
      if (this.canvas.classList.contains('camera-canvas')) {
        window.__p18.lines.push(t); window.__p18.lines = window.__p18.lines.slice(-500);
        if (t.includes('trigger: face-') && !window.__p18.fallAt) window.__p18.fallAt = performance.now();
      }
      return fillText.call(this, t, ...args);
    };
    const lineTo = CanvasRenderingContext2D.prototype.lineTo;
    CanvasRenderingContext2D.prototype.lineTo = function(...args) {
      if (this.canvas.classList.contains('camera-canvas')) window.__p18.bones++;
      return lineTo.apply(this, args);
    };
  });
  function watch(page) {
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && m.text() !== 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.') {
      if (m.text().includes('503 (Service Unavailable)')) expectedPoseFailures.push(m.text());
      else { errors.push({ text: m.text(), url: m.location().url }); console.log('Browser error', m.text(), m.location().url); }
    } });
    page.on('response', r => { if (r.status() >= 400) {
      if (r.status() === 503 && new URL(r.url()).pathname === '/models/pose/pose_landmarker_lite.task') expectedPoseFailures.push(`${r.status()} ${r.url()}`);
      else failedRequests.push(`${r.status()} ${r.url()}`);
    } });
  }
  const probe = await context.newPage(); watch(probe);
  await probe.goto(base, { waitUntil: 'domcontentloaded' });
  const measurements = process.env.P18_REUSE_FIXTURES ? JSON.parse(await readFile(output + '/sample-measurements.json', 'utf8')) : await probe.evaluate(async () => {
    const { detectFaces, faceDistance } = await import('/p18-face.js');
    const image = new Image(); image.src = '/p18-sample.jpg'; await image.decode();
    const portrait = document.createElement('canvas'); portrait.width = 640; portrait.height = 480;
    portrait.getContext('2d').drawImage(image, 1130, 0, 790, 1280, 172, 0, 296, 480);
    const enrolled = (await detectFaces(portrait, 512))[0];
    if (!enrolled) throw new Error('Bundled sample face must be detected');
    window.__portrait = portrait; window.__faceBox = enrolled.box;
    const sizes = [];
    for (const scale of [1, .8, .6, .45, .35, .25]) {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      canvas.getContext('2d').drawImage(portrait, 320 * (1 - scale), 240 * (1 - scale), 640 * scale, 480 * scale);
      for (const input of [320, 512, 640]) {
        const start = performance.now(), found = await detectFaces(canvas, input);
        sizes.push({ scale, input, expectedFaceWidth: enrolled.box.w * scale, detectionMs: performance.now() - start,
          detected: found.length, width: found[0]?.box.w ?? null, height: found[0]?.box.h ?? null,
          descriptorDistance: found[0] ? faceDistance(enrolled.descriptor, found[0].descriptor) : null });
      }
    }
    return { descriptor: enrolled.descriptor, enrolledBox: enrolled.box, sizes };
  });
  await writeFile(output + '/sample-measurements.json', JSON.stringify(measurements));
  await writeFile(output + '/measurements.json', JSON.stringify(measurements.sizes, null, 2));
  console.log('Size probe complete');
  // Record identical real pixels at different motion speeds. Every monitoring screen labels REPLAY.
  const clips = {};
  for (const mode of ['upper-body', 'slow', 'drop', 'disappear']) {
    const cachedClip = process.env.P18_REUSE_FIXTURES ? await readFile(output + `/${mode}.mp4`).catch(() => null) : null;
    clips[mode] = cachedClip ?? Buffer.from(await probe.evaluate(async mode => {
      let portrait = window.__portrait;
      if (!portrait) {
        const image = new Image(); image.src = '/p18-sample.jpg'; await image.decode();
        portrait = document.createElement('canvas'); portrait.width = 640; portrait.height = 480;
        portrait.getContext('2d').drawImage(image, 1130, 0, 790, 1280, 172, 0, 296, 480);
      }
      const box = window.__faceBox;
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d');
      const start = performance.now(), duration = ['slow', 'upper-body'].includes(mode) ? 7000 : 4500;
      function paint() {
        const t = performance.now() - start;
        ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 640, 480);
        const shift = ['slow', 'upper-body'].includes(mode) ? 140 * Math.min(1, Math.max(0, (t - 2000) / 4000)) :
          mode === 'drop' ? 140 * Math.min(1, Math.max(0, (t - 2000) / 350)) : 80 * Math.min(1, Math.max(0, (t - 2000) / 400));
        if (mode === 'upper-body') ctx.drawImage(portrait, 0, shift * .7);
        else if (mode !== 'disappear' || t < 2600) ctx.drawImage(portrait, box.x - box.w * .1, box.y - box.h * .1,
          box.w * 1.2, box.h * 1.2, 200, 80 + shift, 120, 120);
      }
      paint(); const stream = canvas.captureStream(30), recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' }), chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      const done = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.start(); const timer = setInterval(paint, 33);
      await new Promise(resolve => setTimeout(resolve, duration)); recorder.stop(); clearInterval(timer); await done;
      stream.getTracks().forEach(track => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    }, mode));
    await writeFile(output + `/${mode}.mp4`, clips[mode]);
    console.log('Recorded', mode);
    await context.route(url => url.pathname === `/fixtures/p18-${mode}.mp4`, route => route.fulfill({ contentType: 'video/mp4', body: clips[mode] }));
  }
  await probe.close();
  const dashboard = await context.newPage(); watch(dashboard);
  await dashboard.goto(base + '/dashboard', { waitUntil: 'domcontentloaded' });
  await dashboard.getByRole('button', { name: 'Start monitoring (sound on)', exact: true }).click();
  for (const mode of ['upper-body', 'slow', 'drop', 'disappear']) {
    const name = 'REPLAY P18 ' + mode;
    const control = ['slow', 'upper-body'].includes(mode);
    const response = await dashboard.request.post(base + '/api/visits', { data: { name, descriptor: measurements.descriptor,
      answers: { reason: 'Bundled sample replay acceptance', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' } } });
    assert.equal(response.status(), 201); const visit = await response.json();
    const page = await context.newPage(); watch(page);
    let firstMotionAt = null;
    await page.exposeFunction('motionStarted', () => { firstMotionAt ??= Date.now(); });
    await page.addInitScript(() => {
      document.addEventListener('timeupdate', e => { if (e.target instanceof HTMLVideoElement && e.target.currentTime >= 2 && window.__p18.armed) window.motionStarted(); }, true);
    });
    await page.goto(`${base}/room?debug=1&privacy=0&cam=P18${mode}&video=/fixtures/p18-${mode}.mp4&fullpose=${mode === 'upper-body' ? '1' : '0'}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Room view', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
    await page.evaluate(() => { const video = document.querySelector('video'); video.pause(); video.currentTime = 0; });
    const soundButton = page.getByRole('button', { name: 'Start monitoring (sound on)', exact: true });
    if (await soundButton.count()) await soundButton.click();
    else await page.getByRole('button', { name: 'Monitoring · sound on', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.camera-debug')?.textContent.includes('Face models ready'));
    await page.evaluate(async () => { window.__p18.armed = true; await document.querySelector('video').play(); });
    await page.waitForFunction(() => document.querySelector('.camera-debug')?.textContent.includes('visit: ') &&
      !document.querySelector('.camera-debug')?.textContent.includes('visit: unknown'), null, { timeout: 30000 });
    if (control) {
      await page.waitForFunction(() => document.querySelector('video')?.currentTime >= 6.5);
      await writeFile(output + '/slow-diagnostic.json', JSON.stringify({ hud: await page.locator('.camera-status').innerText(), debug: await page.locator('.camera-debug').innerText(), probe: await page.evaluate(() => window.__p18), alerts: app.store.state.alerts }, null, 2));
      await page.screenshot({ path: output + '/slow-diagnostic.png', fullPage: true });
      assert.equal(app.store.state.alerts.filter(a => a.visitId === visit.id).length, 0, 'Slow descent must not request a check');
    } else {
      await page.waitForFunction(() => window.__p18.spoken.some(s => s.text.includes('Fall-like movement detected.')));
      await dashboard.waitForFunction(name => window.__p18.spoken.some(s => s.text.includes(name) && s.text.includes('Fall-like movement detected.')), name);
      assert.equal(app.store.state.alerts.find(a => a.visitId === visit.id)?.level, 'red');
      await page.waitForFunction(() => document.querySelector('.camera-debug')?.textContent.includes('trigger: face-'));
      assert.equal((await page.evaluate(() => window.__p18.spoken)).filter(s => s.text.includes('Fall-like movement detected.')).length, 1);
      assert.equal((await dashboard.evaluate(() => window.__p18.spoken)).filter(s => s.text.includes(name) && s.text.includes('Fall-like movement detected.')).length, 1);
    }
    const probeResult = await page.evaluate(() => ({ ...window.__p18, currentTime: document.querySelector('video').currentTime }));
    const hud = await page.locator('.camera-status').innerText();
    const debug = await page.locator('.camera-debug').innerText();
    if (!control) assert.ok(probeResult.lines.some(t => t.includes(`trigger: face-${mode === 'drop' ? 'drop' : 'disappeared'}`)), 'Expected face trigger');
    if (mode === 'upper-body') {
      assert.ok(probeResult.bones > 10, 'Upper-body replay must draw the real skeleton');
      assert.ok(hud.includes('Pose model: ready'), 'Real pose model must load');
    } else {
      assert.equal(probeResult.bones, 0, 'Face-only replay must work without a skeleton');
      assert.ok(hud.includes('Pose model: error'), 'Fault injection must be visible in HUD');
    }
    const speechWallAt = await page.evaluate(() => { const s = window.__p18.spoken.find(s => s.text.includes('Fall-like movement detected.')); return s ? performance.timeOrigin + s.at : null; });
    const latencyMs = control ? null : speechWallAt - firstMotionAt;
    if (latencyMs !== null) assert.ok(latencyMs < 2000, `Motion to speech invocation ${latencyMs} ms`);
    await page.screenshot({ path: output + `/${mode}.png`, fullPage: true });
    results.push({ mode, latencyMs, hud, debug, triggerLines: probeResult.lines.filter(t => t.includes('trigger: face-')), bones: probeResult.bones,
      speech: probeResult.spoken, vitals: app.store.state.vitals[visit.id] });
    console.log('Behavior passed', mode, latencyMs, hud);
    await page.close();
    // Retire only this synthetic test visit; keep prior test results in the memory-only store.
    app.store.state.visits.find(v => v.id === visit.id).status = 'called'; app.store.changed();
  }
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  const report = { passed: true, fixture: 'Bundled face-api sample; REPLAY only; no physical camera', measurements: {
    enrolledBox: measurements.enrolledBox, sizes: measurements.sizes }, results, errors, failedRequests, expectedPoseFailures };
  await writeFile(output + '/production.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await writeFile(output + '/failure.json', JSON.stringify({ error: String(error), errors, failedRequests, results }, null, 2));
  throw error;
} finally {
  await browser?.close();
  web.httpServer.closeAllConnections();
  await new Promise(resolve => web.httpServer.close(resolve));
  app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve));
}
