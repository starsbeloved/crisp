// Production client + real memory-only API; generated landmarks, no camera or provider calls.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { createSignalTracker } from '../camera/signals/index.ts';
process.env.PROVIDERS_ENV = '/dev/null';
process.env.GEMINI_API_KEY = ''; process.env.ELEVENLABS_API_KEY = '';
process.env.API_PORT = '8822'; process.env.WEB_PORT = '5222';
const { createAppServer } = await import('../../server/http.ts');
const app = createAppServer({ dataDir: null, readProviders: false });
await new Promise(resolve => app.server.listen(8822, '127.0.0.1', resolve));
const web = await preview({ root: fileURLToPath(new URL('../../', import.meta.url)), preview: { port: 5222, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const base = 'http://127.0.0.1:5222', errors = [];
const context = await browser.newContext();
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
await context.addInitScript(() => {
  window.__spoken = [];
  // Exercise actual browser speech API, and record attempted utterances for assertions.
  const speak = speechSynthesis.speak.bind(speechSynthesis);
  speechSynthesis.speak = utterance => { window.__spoken.push(utterance.text); speak(utterance); };
});
const tabs = await Promise.all(['/room?debug=1', '/dashboard'].map(async path => {
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Start monitoring (sound on)', exact: true }).click();
  return page;
}));
function pose(t, shift = 0, head = .2) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: .5, y: head + shift, z: 0, visibility: .9 }));
  landmarks[11] = { ...landmarks[0], x: .4, y: .4 + shift }; landmarks[12] = { ...landmarks[0], x: .6, y: .4 + shift };
  landmarks[23] = { ...landmarks[0], x: .43, y: .7 + shift }; landmarks[24] = { ...landmarks[0], x: .57, y: .7 + shift };
  return { t, landmarks };
}
const signals = createSignalTracker();
for (let t = 0; t <= 4000; t += 100) signals.pushPose(pose(t));
async function visit(name) {
  const response = await tabs[0].request.post(base + '/api/visits', { data: { name, descriptor: null,
    answers: { reason: 'SYNTHETIC P17 acceptance', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' } } });
  assert.equal(response.status(), 201); return response.json();
}
async function report(visitId, posture) {
  const response = await tabs[0].request.post(base + '/api/observations', { data: { observations: [{ cameraId: 'SYNTHETIC-P17', trackId: 'generated-body', at: Date.now(), visitId, matchScore: null,
    box: { x: .2, y: .2, w: .5, h: .6 }, hrBpm: null, hrQuality: 'low', rrBpm: null, rrQuality: 'low', posture, hint: 'SYNTHETIC landmarks', pulseTrace: null, source: 'replay' }] } });
  assert.equal(response.status(), 200);
}
try {
  const head = await visit('SYNTHETIC Head');
  for (let t = 4100; t <= 8100; t += 100) signals.pushPose(pose(t, 0, .6));
  await report(head.id, signals.read(8100).posture);
  for (const tab of tabs) {
    await tab.waitForFunction(() => window.__spoken.some(text => text.includes('Head below shoulders.')));
    assert.equal((await tab.evaluate(() => window.__spoken)).filter(t => t.includes('Head below shoulders.')).length, 1);
  }
  const fall = await visit('SYNTHETIC Fall'); signals.reset();
  signals.pushPose(pose(0)); signals.pushPose(pose(100, .08)); signals.pushPose({ t: 200, landmarks: [] });
  const started = Date.now(); await report(fall.id, signals.read(200).posture);
  for (const tab of tabs) await tab.waitForFunction(() => window.__spoken.some(text => text.includes('Fall-like movement detected.')));
  const latencyMs = Date.now() - started; assert.ok(latencyMs < 2000, `Fall announcement latency ${latencyMs} ms`);
  await report(fall.id, signals.read(200).posture);
  for (const tab of tabs) assert.equal((await tab.evaluate(() => window.__spoken)).filter(t => t.includes('Fall-like movement detected.')).length, 1);
  const seated = await visit('SYNTHETIC Normal Sit'); signals.reset();
  for (let t = 0; t <= 4000; t += 100) signals.pushPose(pose(t, .25 * t / 4000));
  await report(seated.id, signals.read(4000).posture);
  assert.ok(!app.store.state.alerts.some(a => a.visitId === seated.id));
  assert.ok(app.store.state.alerts.every(a => a.level === 'red'));
  for (const tab of tabs) {
    await tab.reload({ waitUntil: 'domcontentloaded' });
    await tab.getByRole('button', { name: 'Monitoring · sound on', exact: true }).waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, latencyMs, checks: ['generated head drop → real API → SSE → Room + Command Center speech', 'fast drop then absent pose → immediate red + speech on both surfaces', 'SSE refresh does not repeat speech', 'slow sit → no request', 'per-tab sound choice survives reload'], physicalCamera: 'not used', audibleSpeakerCheck: 'human required' }, null, 2));
} finally {
  await browser.close(); await new Promise(resolve => web.httpServer.close(resolve));
  app.server.closeAllConnections(); await new Promise(resolve => app.server.close(resolve));
}
