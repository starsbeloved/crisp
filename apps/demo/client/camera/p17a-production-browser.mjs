// Run against npm run demo. Only local requests; bundled dependency photo becomes a labeled REPLAY.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const base = process.env.P17_BASE || 'http://127.0.0.1:5221';
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const errors = [], failedRequests = [];
const output = process.env.P17_OUTPUT || 'apps/demo/output/p17a';
await mkdir(output, { recursive: true });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
if (process.env.P17_BASELINE) {
  const assets = process.env.P17_BASELINE + '/assets';
  const bundle = (await readdir(assets)).find(name => /^index-.*\.js$/.test(name));
  await context.route('**/assets/index-*.js', route => route.fulfill({ contentType: 'text/javascript', path: assets + '/' + bundle }));
}
const sample = await readFile(new URL('../../node_modules/@vladmandic/face-api/demo/sample1.jpg', import.meta.url));
await context.route('**/p17-sample.jpg', route => route.fulfill({ contentType: 'image/jpeg', body: sample }));
await context.addInitScript(() => {
  window.__p17 = { frames: 0, bones: 0, lines: [], spoken: [] };
  const text = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, ...args) {
    if (this.canvas.classList.contains('camera-canvas')) {
      if (t.startsWith('REPLAY')) window.__p17.frames++;
      window.__p17.lines.push(t); window.__p17.lines = window.__p17.lines.slice(-100);
    }
    return text.call(this, t, ...args);
  };
  const line = CanvasRenderingContext2D.prototype.lineTo;
  CanvasRenderingContext2D.prototype.lineTo = function (...args) {
    if (this.canvas.classList.contains('camera-canvas')) window.__p17.bones++;
    return line.apply(this, args);
  };
  const speak = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = utterance => { window.__p17.spoken.push(utterance.text); speak(utterance); };
});
const page = await context.newPage();
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && m.text() !== 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.') errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });
try {
  await page.goto(base + (process.env.P17_PARTIAL ? '?partial=1' : ''), { waitUntil: 'domcontentloaded' });
  const video = Buffer.from(await page.evaluate(async () => {
    const image = new Image(); image.src = '/p17-sample.jpg'; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const partial = new URLSearchParams(location.search).has('partial');
    const paint = () => { ctx.fillStyle = '#222'; ctx.fillRect(0, 0, 640, 480); ctx.drawImage(image, 1130, 0, 790, 1280, partial ? 98 : 172, 0, partial ? 444 : 296, partial ? 720 : 480); };
    paint(); const stream = canvas.captureStream(30), recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' }), chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start(); const timer = setInterval(paint, 33);
    await new Promise(resolve => setTimeout(resolve, 2000)); recorder.stop(); clearInterval(timer); await done;
    stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  }));
  await context.route('**/fixtures/p17-sample.mp4', route => route.fulfill({ contentType: 'video/mp4', body: video }));
  await page.goto(`${base}/room?debug=1&privacy=0&video=/fixtures/p17-sample.mp4&cam=P17REPLAY`, { waitUntil: 'domcontentloaded' });
  await page.locator('.camera-status').filter({ hasText: /Pose model:? ready/ }).waitFor({ timeout: 60000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,disabled-by-default-v8.cpu_profiler', transferMode: 'ReturnAsStream' });
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    const sample = { hud: await page.locator('.camera-status').innerText(), debug: await page.locator('.camera-debug').allTextContents(), probe: await page.evaluate(() => window.__p17) };
    samples.push(sample); console.log(JSON.stringify({ sample: i, hud: sample.hud, debug: sample.debug, frames: sample.probe.frames, bones: sample.probe.bones }));
  }
  const complete = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const { stream } = await complete;
  let trace = '';
  for (;;) { const chunk = await cdp.send('IO.read', { handle: stream }); trace += chunk.data; if (chunk.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  await writeFile(output + '/performance.trace.json', trace);
  await page.screenshot({ path: output + '/production.png', fullPage: true });
  await writeFile(output + '/production.json', JSON.stringify({ samples, errors, failedRequests }, null, 2));
  if (!process.env.P17_BASELINE) assert.ok(samples.at(-1).probe.bones > 10, 'Real MediaPipe landmarks must draw skeleton bones');
  if (!process.env.P17_BASELINE) assert.ok(samples.every(s => Number(s.hud.match(/Overlay ([\d.]+)/)?.[1]) >= 10), 'Overlay must stay above 10 fps');
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failedRequests.length, 0, failedRequests.join('\n'));
} finally { await browser.close(); }
