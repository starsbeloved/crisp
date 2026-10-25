// Start the demo on API_PORT=8801 WEB_PORT=5201 with providers disabled before running.
// Uses only a generated SYNTHETIC test-pattern video and fictional visits.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:5201';
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: true, args: ['--use-fake-device-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15_000);
const errors = [];
let eventStreams = 0;
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (request.url().endsWith('/api/events')) eventStreams++; });
const output = 'output/playwright';
await mkdir(output, { recursive: true });

try {
  await page.goto(base);
  // Generate a moving video in Chrome without downloading, filming or storing anyone.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' });
    const chunks = [];
    const finished = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.ondataavailable = event => chunks.push(event.data);
    let frame = 0;
    function draw() {
      ctx.fillStyle = '#1d1d1f'; ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#e8f1eb'; ctx.font = 'bold 28px sans-serif';
      ctx.fillText('SYNTHETIC · test pattern', 110, 160);
      ctx.font = '20px sans-serif'; ctx.fillText('No patient or camera measurements', 115, 205);
      ctx.fillStyle = '#246b45'; ctx.fillRect(70 + frame++ * 8, 280, 80, 80);
    }
    draw(); recorder.start();
    const timer = setInterval(draw, 80);
    await new Promise(resolve => setTimeout(resolve, 1400));
    recorder.stop(); clearInterval(timer); await finished; stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/mp4' }).arrayBuffer()));
  });
  await page.route(url => url.pathname === '/fixtures/p13b-synthetic.mp4', route => route.fulfill({ contentType: 'video/mp4', body: Buffer.from(bytes) }));
  await page.addInitScript(() => {
    window.__p13bSpoken = [];
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = utterance => { window.__p13bSpoken.push(utterance.text); speak(utterance); };
  });
  eventStreams = 0;
  await page.goto(`${base}/room?video=/fixtures/p13b-synthetic.mp4`);
  await page.getByText('REPLAY source ready', { exact: true }).waitFor();
  await page.getByText(/Streaming ·/).waitFor();
  assert.equal(eventStreams, 1, 'Room view should share one SSE connection');
  assert.equal(await page.locator('.camera-canvas').evaluate(canvas => canvas.width), 640);
  assert.equal(await page.getByRole('heading', { name: 'Room camera A' }).count(), 1);
  const ratio = await page.evaluate(() => document.querySelector('.room-camera').getBoundingClientRect().width / document.querySelector('.room-hallway').getBoundingClientRect().width);
  assert.ok(Math.abs(ratio - 3) < .01, `Expected a 3:1 room layout, got ${ratio}`);
  assert.equal(await page.locator('.camera-demo-view').count(), 0);

  const visitResponse = await page.request.post(`${base}/api/visits`, { data: {
    name: 'Ama Example', descriptor: null,
    answers: { reason: 'SYNTHETIC — fictional browser check', reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form', phone: '555-0100', dateOfBirth: '1990-01-01' },
  } });
  assert.equal(visitResponse.status(), 201);
  const visit = await visitResponse.json();
  const callResponse = await page.request.post(`${base}/api/visits/${visit.id}/call-in`, { data: { room: 'Room 1' } });
  assert.equal(callResponse.status(), 200);
  await page.locator('.room-call-name').filter({ hasText: 'Ama' }).waitFor();
  await page.getByText(`#${visit.queueNo}`, { exact: true }).waitFor();
  assert.match(await page.locator('.room-call-destination').innerText(), /Room 1/);
  const hallway = await page.locator('.room-hallway').innerText();
  for (const privateText of ['Example', '555-0100', '1990-01-01', 'fictional browser check']) assert.ok(!hallway.includes(privateText));
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await page.waitForFunction(() => window.__p13bSpoken.length === 1);
  const expectedSpeech = `Ama, number ${visit.queueNo}, please come to Room 1.`;
  assert.deepEqual(await page.evaluate(() => window.__p13bSpoken), [expectedSpeech]);
  await page.getByRole('button', { name: 'Disable sound', exact: true }).click();
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  // Frame uploads cause continuing SSE refreshes; a new frame must not repeat the call.
  await page.waitForResponse(response => response.url().includes('/api/frame?') && response.status() === 200);
  assert.deepEqual(await page.evaluate(() => window.__p13bSpoken), [expectedSpeech]);

  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.fullscreenElement?.className), 'room-view');
  await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Camera settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Camera settings', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Camera settings' }).getAttribute('aria-expanded'), 'false');
  await page.screenshot({ path: `${output}/p13b-room-desktop.png`, fullPage: true });

  const dashboard = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await dashboard.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
  await dashboard.getByRole('img', { name: 'Camera A · REPLAY', exact: true }).waitFor();
  await dashboard.waitForFunction(() => document.querySelector('img.stream')?.naturalWidth === 640);
  await dashboard.close();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const compact = await page.locator('.room-hallway').evaluate(element => ({ height: element.clientHeight, content: element.scrollHeight, mascotWidth: element.querySelector('.crisp-character').getBoundingClientRect().width }));
  assert.ok(compact.content <= compact.height + 1, `Call-out and sound controls should fit a 1280 × 720 laptop: ${JSON.stringify(compact)}`);
  await page.screenshot({ path: `${output}/p13b-room-laptop.png` });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  // Let the fixed canvas and scrolling panel settle after changing viewport size.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('.room-view').evaluate(element => element.scrollWidth > element.clientWidth), false);
  assert.equal(await page.getByRole('heading', { name: 'Room view', exact: true }).count(), 1);
  await page.screenshot({ path: `${output}/p13b-room-mobile.png` });
  await page.locator('.room-hallway').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Disable sound', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/p13b-room-mobile-hallway.png` });

  // The browser supplies a synthetic device; this never opens the computer's real webcam.
  const webcam = await browser.newPage({ permissions: ['camera'], viewport: { width: 1280, height: 720 } });
  await webcam.goto(`${base}/room?cam=SYNTHETIC`);
  await webcam.getByText('Camera ready', { exact: true }).waitFor();
  await webcam.getByText(/Streaming ·/).waitFor();
  assert.equal(await webcam.locator('video').evaluate(video => video.srcObject?.active), true);
  await webcam.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ replayFrames: true, syntheticVideo: true, syntheticWebcam: true, dashboardReplay: true, sseConnections: eventStreams, cameraToHallwayRatio: ratio, publicCallOut: true, fallbackSpeechOnce: true, fullscreen: true, escapeSettings: true, mobileOverflow: false, errors }));
} catch (error) {
  console.error(JSON.stringify({ errors, screen: await page.locator('body').innerText(), video: await page.locator('video').evaluateAll(videos => videos.map(video => ({ readyState: video.readyState, currentSrc: video.currentSrc, error: video.error?.message }))) }));
  await page.screenshot({ path: `${output}/p13b-room-failure.png`, fullPage: true });
  throw error;
} finally { await browser.close(); }
