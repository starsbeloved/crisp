// Real Chrome against the isolated, in-memory P15b server. No provider calls.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = 'http://127.0.0.1:5212';
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  return ['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
});
const errors = [], checks = [];
let frameTimer;
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const post = async (path, data = {}) => {
  const result = await context.request.post(base + path, { data });
  return result.json();
};
const dashboard = await context.newPage();
const dashboardStreams = new Set();
 dashboard.on('request', request => { if (request.url().endsWith('/api/events')) dashboardStreams.add(request); });
 dashboard.on('requestfailed', request => dashboardStreams.delete(request));
 dashboard.on('requestfinished', request => dashboardStreams.delete(request));
const kiosk = await context.newPage();
try {
  await post('/api/demo/reset');
  await dashboard.goto(base + '/?role=command');
  await expect(dashboard.getByRole('heading', { name: 'Crisp Command Center', exact: true })).toBeVisible();
  await kiosk.goto(base + '/?role=kiosk');
  await expect(kiosk.getByRole('button', { name: 'Talk to Crisp', exact: true })).toBeVisible();
  await expect.poll(() => dashboardStreams.size).toBe(1);
  const profile = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('crisp-station')));
  const commandProfile = await profile(dashboard), kioskProfile = await profile(kiosk);
  expect(commandProfile.selection.role).toBe('command'); expect(kioskProfile.selection.role).toBe('kiosk');
  expect(commandProfile.id).not.toBe(kioskProfile.id);
  checks.push('two simultaneous tabs retain independent query roles and station identities');

  await kiosk.getByRole('button', { name: 'I need help', exact: true }).click();
  await expect(kiosk.getByText('A staff member has been notified.', { exact: false })).toBeVisible();
  await expect(dashboard.getByText('Someone asked for help at the check-in kiosk', { exact: true })).toBeVisible({ timeout: 8000 });
  checks.push('kiosk help reaches Command Center');

  // Exercise the visible voice-stall recovery without signing a provider session.
  await kiosk.getByRole('button', { name: 'Talk to Crisp', exact: true }).click();
  await kiosk.getByLabel('Your name', { exact: true }).fill('Browser Patient');
  await kiosk.getByLabel('Date of birth', { exact: false }).fill('1994-06-15');
  await kiosk.getByLabel('Phone number', { exact: false }).fill('202-555-0100');
  await kiosk.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(kiosk.locator('.checkin')).toHaveAttribute('data-step', 'face');
  await kiosk.getByRole('button', { name: 'Continue', exact: true }).first().click();
  await expect(kiosk.locator('.checkin')).toHaveAttribute('data-step', 'questions');
  await kiosk.locator('#checkin-reason').fill('Fictional headache');
  await kiosk.getByRole('button', { name: 'Today', exact: true }).click();
  await kiosk.getByRole('button', { name: 'About the same', exact: true }).click();
  await kiosk.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(kiosk.locator('.checkin')).toHaveAttribute('data-step', 'followup');
  await kiosk.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(kiosk.locator('.checkin')).toHaveAttribute('data-step', 'done');
  await expect(kiosk.getByText('Please take a seat.', { exact: false }).first()).toBeVisible();
  await expect(dashboard.getByRole('heading', { name: 'Waiting room · 1 waiting', exact: true })).toBeVisible();
  checks.push('voice-stall Continue path: details → face skip → three questions → follow-up → queue number and seat');

  const row = dashboard.locator('.queue-row').filter({ hasText: 'Browser Patient' });
  dashboard.once('dialog', dialog => dialog.dismiss());
  await row.getByRole('button', { name: 'Remove from queue', exact: true }).click();
  await expect(row).toBeVisible();
  dashboard.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', { name: 'Remove from queue', exact: true }).click();
  await expect(dashboard.getByRole('heading', { name: 'Waiting room · 0 waiting', exact: true })).toBeVisible();
  expect((await post('/api/commands/patient_summary', { name: 'Browser Patient' })).ok).toBe(true);
  checks.push('removal cancellation, confirmation, SSE queue update and retained record');

  await expect(dashboard.getByRole('button', { name: 'Talk to Crisp', exact: true })).toBeVisible();
  await expect(dashboard.getByText('Last heard: Nothing yet', { exact: true })).toBeVisible();
  checks.push('always-visible staff Talk to Crisp fallback and last-heard state');

  const lobby = await context.newPage();
  await lobby.goto(base + '/lobby');
  await expect(lobby.getByRole('button', { name: 'Switch station role', exact: true })).toBeVisible();
  await lobby.getByRole('button', { name: 'Switch station role', exact: true }).click();
  await expect(lobby.getByRole('heading', { name: 'What is this screen?', exact: true })).toBeVisible();
  await expect(lobby.locator('.station-choice')).toHaveCount(5);
  await expect(lobby.getByLabel('Screen name (shown in Command Center)')).toHaveValue(/Screen /);
  await expect(lobby.getByRole('button', { name: /Exam room 2/ })).toHaveCount(0);
  await lobby.getByRole('button', { name: /Lobby/ }).click();
  await expect(lobby.getByRole('button', { name: 'Enable sound', exact: true })).toBeVisible();
  await lobby.keyboard.press('Shift+S');
  await expect(lobby.getByRole('heading', { name: 'What is this screen?', exact: true })).toBeVisible();
  checks.push('Lobby one-click Stations, Shift+S, five explained roles and screen name');
  await lobby.close();

  // Stream an explicitly labelled synthetic REPLAY image to verify dashboard MJPEG display.
  const jpeg = await kiosk.screenshot({ type: 'jpeg' });
  const upload = () => context.request.post(base + '/api/frame?cam=P15b&source=replay', { data: jpeg, headers: { 'Content-Type': 'image/jpeg' } });
  await upload();
  frameTimer = setInterval(() => { void upload().catch(() => {}); }, 200);
  await expect(dashboard.locator('.command-room-camera img.stream')).toBeVisible();
  await expect(dashboard.locator('.command-room-camera').getByText('REPLAY', { exact: true })).toBeVisible();
  await expect.poll(() => dashboard.locator('.command-room-camera img.stream').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  checks.push('prominent MJPEG room feed renders supplied synthetic frame with REPLAY label');
  await mkdir('/tmp/crisp-p15b-browser', { recursive: true });
  await dashboard.screenshot({ path: '/tmp/crisp-p15b-browser/command-center.png', fullPage: true });

  clearInterval(frameTimer);
  dashboard.once('dialog', dialog => dialog.accept());
  const resetResponse = dashboard.waitForResponse(response => response.url().endsWith('/api/demo/reset'));
  await dashboard.getByRole('button', { name: 'Reset demo', exact: true }).click();
  const response = await resetResponse;
  expect(response.status()).toBe(200);
  const elapsed = (await response.finished(), response.request().timing().responseEnd);
  expect(elapsed).toBeLessThan(1000);
  await expect(dashboard.getByText('Reset done', { exact: true })).toBeVisible();
  await expect(dashboard.locator('.command-room-camera img.stream')).toHaveCount(0);
  expect(await (await context.request.get(base + '/api/suggestions')).json()).toEqual({ suggestions: [], dispositions: {} });
  checks.push(`reset acknowledged in ${Math.round(elapsed)}ms, clears queue/feed/suggestions/dispositions`);

  await dashboard.getByRole('link', { name: 'Check in', exact: true }).click();
  await expect(dashboard.locator('.checkin')).toBeVisible();
  await dashboard.getByRole('link', { name: 'Crisp Command Center', exact: true }).click();
  await expect(dashboard.getByRole('heading', { name: 'Crisp Command Center', exact: true })).toBeVisible();
  checks.push('top navigation changes pages despite remembered station role');
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, checks, pageErrors: errors, screenshots: '/tmp/crisp-p15b-browser', limitations: ['Provider voice not connected', 'Physical mic/camera not used; synthetic stream explicitly labelled REPLAY'] }, null, 2));
} finally { clearInterval(frameTimer); await browser.close(); }
