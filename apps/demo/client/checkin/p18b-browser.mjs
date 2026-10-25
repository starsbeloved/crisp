// Production smoke check: run API_PORT=8832 WEB_PORT=5232 npm run demo first.
// Provider transport and speech output are simulated; no account, microphone or patient is used.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:5232';
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [], consoleErrors = [], results = {};
async function readState() {
  const controller = new AbortController();
  try {
    const response = await fetch(base + '/api/events', { signal: controller.signal });
    const reader = response.body.getReader(); let text = '';
    while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
    return JSON.parse(text.split('\n').find(line => line.startsWith('data: ')).slice(6));
  } finally { controller.abort(); }
}
context.on('page', page => { page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); }); });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
// Capture speech attempts without claiming that a machine speaker was heard.
await context.addInitScript(() => {
  window.__speech = []; window.__media = [];
  speechSynthesis.speak = u => { window.__speech.push({ text: u.text, at: performance.now() }); setTimeout(() => u.onend?.(new Event('end')), 20); };
  speechSynthesis.cancel = () => {};
  window.Audio = class {
    constructor(url) { window.__media.push(String(url)); }
    pause() {}
    play() { setTimeout(() => this.onended?.(new Event('ended')), 100); return Promise.resolve(); }
  };
});
try {
  const form = await context.newPage();
  // Force the old timeout/meta reply: the client must replace it with a specific fallback.
  await form.route('**/api/checkin/follow-up', route => route.fulfill({ json: { question: 'Is there anything else the nurse would like to know?', source: 'gemini' } }));
  await form.goto(base + '/check-in');
  await form.getByRole('button', { name: 'I’d rather tap', exact: true }).click();
  await form.getByLabel('Your name', { exact: true }).fill('Anna P18b Synthetic');
  await form.getByRole('button', { name: 'Continue', exact: true }).click();
  await form.getByRole('button', { name: 'Skip — staff will help', exact: true }).click();
  await form.getByRole('button', { name: 'chest pain', exact: true }).click();
  const reason = form.locator('#checkin-reason');
  await reason.fill('My chest feels tight'); await reason.fill('');
  assert.equal(await reason.inputValue(), '');
  await reason.fill('My chest feels tight');
  await form.getByRole('button', { name: 'Continue', exact: true }).click();
  await form.getByLabel('Does the chest discomfort spread to your arm, jaw, or back?', { exact: true }).fill('No, just in the middle');
  await form.screenshot({ path: '/private/tmp/crisp-p18b-checkin.png', fullPage: true });
  await form.getByRole('button', { name: 'Finish check-in', exact: true }).click();
  await form.getByText('You’re checked in, Anna P18b Synthetic.', { exact: true }).waitFor();
  const state = await readState();
  const visit = state.visits.toReversed().find(v => v.name === 'Anna P18b Synthetic');
  assert.equal(visit.answers.reason, 'My chest feels tight'); assert.equal(visit.answers.onset, null); assert.equal(visit.answers.trend, null);
  assert.equal(visit.answers.followUp.answer, 'No, just in the middle');
  results.form = { freeTextAndChips: true, optionalTiming: true, metaRejected: true, storedOwnWords: true, queue: visit.queueNo };

  const room = await context.newPage();
  await room.goto(base + '/room');
  await room.getByRole('button', { name: 'Start monitoring (sound on)', exact: true }).click();
  const lobby = await context.newPage(); await lobby.goto(base + '/lobby');
  await lobby.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await context.request.post(`${base}/api/visits/${visit.id}/call-in`, { data: { room: 'room one' } });
  for (const page of [room, lobby]) {
    await page.getByText(`“Anna, number ${visit.queueNo}, please come to Room 1.”`, { exact: true }).waitFor();
    await page.waitForFunction(q => window.__speech.some(u => u.text === `Anna, number ${q}, please come to Room 1.`), visit.queueNo);
    assert.equal(await page.evaluate(q => window.__speech.filter(u => u.text === `Anna, number ${q}, please come to Room 1.`).length, visit.queueNo), 1);
  }
  await room.screenshot({ path: '/private/tmp/crisp-p18b-room.png', fullPage: true });
  results.realSSE = { roomUnlock: true, lobbyUnlock: true, normalizedRoom: true, firstNameOnly: true };

  // Feed explicitly synthetic SSE calls to cover pending/late/ready timing without a provider.
  const fixture = await readState();
  const synthetic = await context.newPage();
  await synthetic.route('**/api/events', route => {
    const send = async call => route.fulfill({ contentType: 'text/event-stream', body: `event: state\ndata: ${JSON.stringify({ ...fixture, nowCalling: call })}\n\n` });
    return send({ id: 'p18b-stalled', name: 'Anna Synthetic', queueNo: 1, room: '1', at: Date.now(), visitId: visit.id, audio: 'pending' });
  });
  await synthetic.goto(base + '/room');
  await synthetic.getByRole('button', { name: 'Start monitoring (sound on)', exact: true }).click();
  await synthetic.waitForFunction(() => window.__speech.some(u => u.text === 'Anna, number 1, please come to Room 1.'));
  const elapsed = await synthetic.evaluate(() => {
    const unlock = window.__speech.find(u => u.text === 'Monitoring sound is on.');
    const call = window.__speech.find(u => u.text === 'Anna, number 1, please come to Room 1.');
    return call.at - unlock.at;
  });
  assert.ok(elapsed >= 1900 && elapsed < 2400, `fallback delay ${elapsed}`);
  results.stalledProvider = { fallbackMs: Math.round(elapsed), output: 'speech API simulated' };
  // EventSource reconnects receive a late ready result. It must not repeat fallback speech.
  await synthetic.unroute('**/api/events');
  const readyCall = { id: 'p18b-stalled', name: 'Anna Synthetic', queueNo: 1, room: 'Room 1', at: Date.now(), visitId: visit.id, audio: 'ready' };
  await synthetic.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: `event: state\ndata: ${JSON.stringify({ ...fixture, nowCalling: readyCall })}\n\n` }));
  await synthetic.waitForTimeout(3500);
  assert.equal(await synthetic.evaluate(() => window.__speech.filter(u => u.text === 'Anna, number 1, please come to Room 1.').length), 1);
  assert.equal(await synthetic.evaluate(() => window.__media.some(url => url.includes('p18b-stalled'))), false);
  results.stalledProvider.lateAudioIgnored = true;
  const readyPage = await context.newPage();
  await readyPage.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: `event: state\ndata: ${JSON.stringify({ ...fixture, nowCalling: { ...readyCall, id: 'p18b-ready' } })}\n\n` }));
  await readyPage.goto(base + '/room');
  await readyPage.getByRole('button', { name: 'Start monitoring (sound on)', exact: true }).click();
  await readyPage.waitForFunction(() => window.__media.includes('/api/calls/p18b-ready/audio'));
  await readyPage.waitForTimeout(2100);
  assert.equal(await readyPage.evaluate(() => window.__speech.filter(u => u.text.startsWith('Anna, number')).length), 0);
  results.readyProvider = { mediaRequested: true, duplicateFallback: false, playback: 'simulated' };
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ results, pageErrors: errors, consoleErrors }, null, 2));
} finally { await context.close(); await browser.close(); }
