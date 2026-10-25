// Run with the P13c API on :8802 and Vite on :5202. Providers can remain disabled.
// Uses the repository's pinned Playwright package; no provider account or webcam required.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:5202';
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const pending = new Set();
page.on('request', request => pending.add(request.url()));
page.on('requestfinished', request => pending.delete(request.url()));
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
page.on('requestfailed', request => console.error(`${request.url()}: ${request.failure()?.errorText}`));
const screenshots = [];
async function screenshot(name) {
  const path = `/private/tmp/crisp-p13c-${name}.png`;
  await page.screenshot({ path, fullPage: true }); screenshots.push(path);
}
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}
try {
  // Record an explicitly synthetic, faceless video in memory. It is never enrolled as a person.
  await page.goto('about:blank');
  const video = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#17382b'; ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#ffffff'; ctx.font = '24px sans-serif';
    ctx.fillText('SYNTHETIC fixture — no person', 90, 240);
    const stream = canvas.captureStream(5);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const result = new Promise(resolve => { recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))); });
    recorder.start();
    let frame = 0;
    const frames = setInterval(() => { ctx.fillStyle = '#c6e3d1'; ctx.fillRect(90 + frame++ * 8, 280, 6, 6); }, 100);
    await new Promise(resolve => setTimeout(resolve, 1200)); clearInterval(frames); recorder.stop();
    stream.getTracks().forEach(track => track.stop());
    return result;
  }));
  await context.route(url => url.pathname === '/fixtures/p13c-synthetic.mp4', route => route.fulfill({ contentType: 'video/webm', body: video }));
  await page.goto(`${base}/check-in?video=/fixtures/p13c-synthetic.mp4`);
  assert.equal(await page.getByRole('button', { name: 'Start', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Talk to Crisp', exact: true }).waitFor();
  await screenshot('welcome');
  await page.getByRole('button', { name: 'I’d rather tap' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Ama P13c Synthetic');
  await page.getByLabel('Date of birth', { exact: false }).fill('1995-05-14');
  await page.getByLabel('Phone number', { exact: false }).fill('123');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  assert.match(await page.getByRole('alert').innerText(), /phone number/);
  await page.getByLabel('Phone number', { exact: false }).fill('+1 202-555-0100');
  await page.setViewportSize({ width: 375, height: 812 });
  await noOverflow(); await screenshot('details-mobile');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByText('REPLAY · p13c-synthetic.mp4', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2, { timeout: 10000 });
  assert.equal(await page.getByText('✓ Face saved', { exact: true }).count(), 0);
  await screenshot('replay-face');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  assert.equal(await page.getByLabel('Date of birth', { exact: false }).inputValue(), '1995-05-14');
  assert.equal(await page.getByLabel('Phone number', { exact: false }).inputValue(), '+1 202-555-0100');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Skip — staff will help' }).click();
  await page.getByLabel('1. What brings you in today?').fill('Chest tightness since this morning');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Getting worse', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByText('Template fallback', { exact: true }).waitFor();
  assert.equal(await page.getByText('Because you mentioned “Chest tightness since this morning”.', { exact: true }).isVisible(), true);
  await screenshot('followup-template');
  await page.locator('#checkin-followup').fill('Started after breakfast');
  await page.getByRole('button', { name: 'Finish check-in', exact: true }).click();
  await page.getByText('You’re checked in, Ama P13c Synthetic.', { exact: true }).waitFor();
  const queueNo = Number(await page.locator('.checkin-queue').innerText());
  assert.ok(queueNo > 0);
  const room = await page.evaluate(() => new Promise(resolve => {
    const events = new EventSource('/api/events');
    events.addEventListener('state', event => { events.close(); resolve(JSON.parse(event.data)); }, { once: true });
  }));
  const visit = room.visits.findLast(item => item.name === 'Ama P13c Synthetic');
  assert.equal(visit.queueNo, queueNo); assert.equal(visit.faceEnrolled, false);
  assert.equal(visit.answers.dateOfBirth, '1995-05-14');
  assert.equal(visit.answers.phone, '+1 202-555-0100');
  assert.equal(visit.answers.followUp.answer, 'Started after breakfast');
  await screenshot('done');
  await page.getByRole('button', { name: 'Check in someone else', exact: true }).click();
  await page.getByRole('button', { name: 'I’d rather tap' }).click();
  assert.equal(await page.getByLabel('Your name', { exact: true }).inputValue(), '');
  assert.equal(await page.getByLabel('Date of birth', { exact: false }).inputValue(), '');
  assert.equal(await page.getByLabel('Phone number', { exact: false }).inputValue(), '');
  await page.goto(`${base}/lobby`);
  await page.getByText('Feeling worse while you wait? Please tell the front desk.', { exact: true }).waitFor();
  await page.getByRole('region', { name: 'Up next' }).waitFor();
  assert.equal((await page.locator('body').innerText()).includes('202-555-0100'), false);
  assert.equal((await page.locator('body').innerText()).includes('1995-05-14'), false);
  await page.goto(`${base}/check-in`);
  await page.getByRole('button', { name: 'Talk to Crisp', exact: true }).click();
  await page.getByRole('button', { name: 'I’d rather tap' }).click();
  assert.equal(await page.getByLabel('Your name', { exact: true }).isVisible(), true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 }); await noOverflow();
  assert.equal(await page.locator('.crisp-arrive').evaluate(node => getComputedStyle(node).animationName), 'none');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ form: 'pass', replayNoFalseEnrollment: true, detailsPersisted: true, resetClearsDetails: true, publicPhoneHidden: true, unavailableVoiceFallback: true, mobileWidth: 375, reducedMotion: true, queueNo, screenshots, errors }, null, 2));
} catch (error) { await screenshot('failure'); console.error(JSON.stringify({ errors, pending: [...pending], body: await page.locator('body').innerText() })); throw error; } finally { await browser.close(); }
