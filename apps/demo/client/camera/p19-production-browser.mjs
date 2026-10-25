// Real production client + Chrome + local models, isolated memory-only API, public sample REPLAY.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.P19_OUTPUT || root + 'output/p19';
await mkdir(output, { recursive: true });
process.env.PROVIDERS_ENV = '/dev/null';
process.env.GEMINI_API_KEY = ''; process.env.ELEVENLABS_API_KEY = '';
process.env.API_PORT = '18841'; process.env.WEB_PORT = '15241';
const { createAppServer } = await import('../../server/http.ts');
const app = createAppServer({ dataDir: null, readProviders: false });
await new Promise((resolve, reject) => app.server.once('error', reject).listen(18841, '127.0.0.1', resolve));
const web = await preview({ root, preview: { port: 15241, strictPort: true } });
let browser, testPage;
process.on('SIGTERM', () => { void testPage?.close(); });
const errors = [], failedRequests = [], samples = [], cancelledRequests = [];
let phase = 'startup';
const base = 'http://127.0.0.1:15241';
try {
  await build({ configFile: false, logLevel: 'silent', build: { outDir: output + '/fixture', emptyOutDir: false,
    lib: { entry: root + 'client/lib/face.ts', formats: ['es'], fileName: () => 'face.js' } } });
  const fixture = await readFile(output + '/fixture/face.js');
  const photo = await readFile(root + 'node_modules/@vladmandic/face-api/demo/sample1.jpg');
  browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
  const browserCdp = await browser.newBrowserCDPSession();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.route('**/*', route => [base, 'http://127.0.0.1:18841'].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
  // MediaPipe emits close-time telemetry. A local empty response avoids sending anything
  // externally and keeps that deliberate network block from looking like a model failure.
  await context.route('https://odml.pa.googleapis.com/v1/log', route => route.fulfill({ status: 204, body: '' }));
  await context.route('**/p19-face.js', route => route.fulfill({ contentType: 'text/javascript', body: fixture }));
  await context.route('**/p19-sample.jpg', route => route.fulfill({ contentType: 'image/jpeg', body: photo }));
  await context.addInitScript(() => {
    window.__p19 = { bones: 0, frames: 0 };
    const line = CanvasRenderingContext2D.prototype.lineTo;
    CanvasRenderingContext2D.prototype.lineTo = function(...args) {
      if (this.canvas.classList.contains('camera-canvas')) window.__p19.bones++;
      return line.apply(this, args);
    };
    const text = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(t, ...args) {
      if (this.canvas.classList.contains('camera-canvas') && t.startsWith('REPLAY · ')) window.__p19.frames++;
      return text.call(this, t, ...args);
    };
  });
  const page = await context.newPage(); testPage = page;
  page.on('pageerror', e => errors.push(e.message));
  page.on('crash', () => errors.push('PAGE CRASH'));
  page.on('console', m => { if (m.type() === 'error' && m.text() !== 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.') errors.push({ text: m.text(), url: m.location().url, phase }); });
  page.on('requestfailed', request => cancelledRequests.push({ url: request.url(), error: request.failure()?.errorText, phase }));
  page.on('response', r => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const { descriptor, bytes } = await page.evaluate(async () => {
    const { detectFaces, disposeFaceModels } = await import('/p19-face.js');
    const image = new Image(); image.src = '/p19-sample.jpg'; await image.decode();
    // A 1280x720 source with head, shoulders and arms; hips are below the frame.
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d');
    const paint = () => { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 1280, 720);
      ctx.drawImage(image, 1130, 0, 790, 1280, 284, 0, 712, 1152); };
    paint();
    const found = await detectFaces(canvas, 640);
    if (!found.length) throw new Error('Public sample enrollment failed');
    const descriptor = found[0].descriptor;
    await disposeFaceModels();
    const stream = canvas.captureStream(30), chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });
    recorder.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start(); const timer = setInterval(paint, 33);
    await new Promise(resolve => setTimeout(resolve, 2000)); recorder.stop(); clearInterval(timer); await done;
    stream.getTracks().forEach(track => track.stop());
    return { descriptor, bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())) };
  });
  const clip = Buffer.from(bytes);
  await context.route(url => url.pathname === '/fixtures/p19-upper.mp4', route => route.fulfill({ contentType: 'video/mp4', body: clip }));
  const response = await page.request.post(base + '/api/visits', { data: { name: 'REPLAY P19 Upper Body', descriptor,
    answers: { reason: 'Public sample production acceptance', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' } } });
  assert.equal(response.status(), 201); const visit = await response.json();
  await page.goto(`${base}/room?debug=1&privacy=0&cam=P19REPLAY&video=/fixtures/p19-upper.mp4`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log('Startup', await page.locator('.camera-debug').innerText({ timeout: 5000 }));
  await page.waitForFunction(() => document.querySelector('.camera-debug')?.textContent.includes('Face models ready'), null, { timeout: 60000 });
  await page.waitForFunction(() => document.querySelector('.camera-status')?.textContent.includes('Pose model: ready · CPU'), null, { timeout: 60000 });
  await page.waitForFunction(id => document.querySelector('.camera-debug')?.textContent.includes(`visit: ${id}`), visit.id, { timeout: 30000 });
  await page.waitForFunction(id => document.querySelector('.camera-debug')?.textContent.includes(`visit: ${id}`), visit.id, { timeout: 10000 });
  await page.waitForTimeout(5000);
  assert.ok(app.store.state.vitals[visit.id]?.posture, 'Recognized upper-body posture must reach real API');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  phase = 'soak';
  const start = Date.now();
  async function sample() {
    // Compare post-GC retained heap, not normal sawtooth allocation noise.
    await cdp.send('HeapProfiler.collectGarbage');
    const metrics = (await cdp.send('Performance.getMetrics')).metrics;
    const processes = (await browserCdp.send('SystemInfo.getProcessInfo')).processInfo;
    const gpu = processes.find(p => p.type === 'GPU');
    const gpuRssKiB = gpu ? Number(execFileSync('ps', ['-o', 'rss=', '-p', String(gpu.id)], { encoding: 'utf8' }).trim()) : null;
    const debug = await page.locator('.camera-debug').innerText();
    const hud = await page.locator('.camera-status').innerText();
    const record = { seconds: Math.round((Date.now() - start) / 1000), heapBytes: metrics.find(m => m.name === 'JSHeapUsedSize').value,
      gpuRssKiB, hud, debug, probe: await page.evaluate(() => window.__p19), posture: app.store.state.vitals[visit.id]?.posture };
    samples.push(record); console.log(JSON.stringify(record));
    await writeFile(output + '/progress.json', JSON.stringify({ samples, errors, failedRequests }, null, 2));
  }
  await sample();
  const duration = Number(process.env.P19_SECONDS || 600);
  let next = Date.now() + 30000;
  while (Date.now() - start < duration * 1000) {
    await page.waitForTimeout(Math.max(1, Math.min(30000, next - Date.now())));
    await sample(); next += 30000;
  }
  await page.screenshot({ path: output + '/production.png', fullPage: true });
  assert.ok(samples.at(-1).probe.bones > 100, 'Real skeleton must keep drawing');
  assert.ok(samples.every(s => Number(s.hud.match(/Overlay ([\d.]+)/)?.[1]) >= 10), 'Overlay stays above 10 fps');
  assert.ok(samples.every(s => s.posture != null), 'Server keeps receiving observed posture');
  const retainedGrowth = samples.at(-1).heapBytes - samples[Math.min(2, samples.length - 1)].heapBytes;
  assert.ok(retainedGrowth < 8 * 1048576, `Retained heap grew ${retainedGrowth} bytes after warmup`);
  const gpuPools = samples.map(s => Number(s.debug.match(/TF GPU pool: ([\d.]+)/)?.[1]));
  assert.ok(gpuPools.every(n => n <= 128), `TF GPU pool exceeded bounded budget: ${gpuPools}`);
  await writeFile(output + '/soak.json', JSON.stringify({ duration, chrome: browser.version(), samples, retainedGrowth, errors, failedRequests, cancelledRequests }, null, 2));
  phase = 'cleanup';
  // Hiding must close the model and stop all processing, then returning must reload.
  const before = await page.evaluate(() => window.__p19.frames);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForFunction(() => document.querySelector('.camera-status')?.textContent.includes('Pose model: paused'));
  const stopped = await page.evaluate(() => window.__p19.frames);
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => window.__p19.frames), stopped);
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await page.waitForFunction(() => document.querySelector('.camera-status')?.textContent.includes('Pose model: ready · CPU'), null, { timeout: 60000 });
  await page.waitForFunction(n => window.__p19.frames > n, before);
  await page.waitForFunction(() => document.querySelector('.camera-debug')?.textContent.includes('Face models ready'), null, { timeout: 60000 });
  await page.waitForFunction(id => document.querySelector('.camera-debug')?.textContent.includes(`visit: ${id}`), visit.id, { timeout: 30000 });
  assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []);
  await writeFile(output + '/production.json', JSON.stringify({ passed: true, chrome: browser.version(), duration,
    fixture: 'Public sample, 1280x720 upper-body REPLAY; real models and isolated memory API', samples, retainedGrowth,
    lifecycle: 'pagehide stopped frames and models; pageshow reopened and recognized the visit again', errors, failedRequests, cancelledRequests }, null, 2));
  console.log('P19 production acceptance passed');
} catch (error) {
  if (testPage && !testPage.isClosed()) {
    await testPage.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {});
    console.log(await testPage.locator('.camera-debug').innerText({ timeout: 2000 }).catch(() => 'No debug panel'));
  }
  await writeFile(output + '/failure.json', JSON.stringify({ error: String(error), samples, errors, failedRequests, cancelledRequests }, null, 2));
  throw error;
} finally {
  await browser?.close();
  web.httpServer.closeAllConnections(); await new Promise(resolve => web.httpServer.close(resolve));
  app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve));
}
