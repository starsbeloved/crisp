// Generated video → Room view overlay → server MJPEG → Command Center, with no physical camera or provider.
import { chromium, expect } from '@playwright/test';
const base = 'http://127.0.0.1:5212';
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
const page = await context.newPage(); const errors = [];
context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)));
try {
  await page.goto(base);
  const video = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#17382b'; ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif'; ctx.fillText('SYNTHETIC — no people or readings', 60, 180);
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/mp4' }); const chunks = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const done = new Promise(resolve => { recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))); });
    recorder.start(); let x = 0;
    const timer = setInterval(() => { ctx.fillStyle = '#8adaaf'; ctx.fillRect(50 + x++ * 10, 280, 8, 8); }, 100);
    await new Promise(resolve => setTimeout(resolve, 1200)); clearInterval(timer); recorder.stop();
    stream.getTracks().forEach(track => track.stop()); return done;
  }));
  await context.route('**/fixtures/p15b-synthetic.mp4', route => route.fulfill({ contentType: 'video/mp4', body: video }));
  await page.goto(base + '/room?video=/fixtures/p15b-synthetic.mp4&cam=P15bRoom');
  await expect(page.getByRole('heading', { name: 'Room view', exact: true })).toBeVisible();
  await expect(page.getByText('REPLAY source ready', { exact: true })).toBeVisible();
  await expect(page.getByText(/Streaming ·/)).toBeVisible({ timeout: 15000 });
  const dashboard = await context.newPage();
  await dashboard.goto(base + '/dashboard');
  await expect(dashboard.getByRole('img', { name: 'Camera P15bRoom · REPLAY', exact: true })).toBeVisible();
  await expect.poll(() => dashboard.getByRole('img', { name: 'Camera P15bRoom · REPLAY', exact: true }).evaluate(img => img.naturalWidth)).toBe(640);
  // Keep the camera document visible for the real-time source, as the filming setup requires.
  await page.bringToFront();
  await expect(page.getByRole('link', { name: 'Stations', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Stations', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Stations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What is this screen?', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, checks: ['generated REPLAY video traverses Room view processing and server MJPEG to Command Center', 'Stations link remains usable inside native fullscreen', 'role change exits camera surface'], pageErrors: errors, physicalCamera: 'NOT USED' }, null, 2));
} finally { await browser.close(); }
