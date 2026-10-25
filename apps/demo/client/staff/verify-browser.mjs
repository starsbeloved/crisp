// Run against an isolated demo server on 8807 / 5207. Creates fictional visits; never resets existing data.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = 'http://127.0.0.1:5207';
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
await context.addInitScript(() => {
  window.__crispSpoken = [];
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    cancel() {}, speak(utterance) { window.__crispSpoken.push(utterance.text); queueMicrotask(() => utterance.onend?.()); },
  } });
});
const page = await context.newPage(); const errors = [];
page.on('pageerror', error => errors.push(error.message));
const request = context.request;
async function post(path, body) { const response = await request.post(base + path, { data: body }); return { status: response.status(), value: await response.json() }; }
try {
  await page.goto(base + '/dashboard?fixture=1');
  await expect(page.getByRole('heading', { name: 'Crisp Command Center' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Listen for Hey Crisp', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const before = await post('/api/commands/list_waiting', {});
  await page.getByRole('button', { name: 'Load demo fixture', exact: true }).click();
  await expect(page.getByText('SYNTHETIC · preview suggestions; actions stay in this preview.')).toBeVisible();
  await page.getByRole('region', { name: 'Crisp suggestions' }).getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.getByText('SYNTHETIC · Calling Ama to Room 1.', { exact: true })).toBeVisible();
  const after = await post('/api/commands/list_waiting', {});
  expect(after.value.data).toEqual(before.value.data);
  await mkdir('/tmp/crisp-p13a-browser', { recursive: true });
  await page.screenshot({ path: '/tmp/crisp-p13a-browser/command-center-fixture.png', fullPage: true });
  await page.getByRole('button', { name: 'Return to live room' }).click();

  const visitInput = (name, dateOfBirth) => ({ name, descriptor: null, answers: { reason: 'Fictional demo visit for browser verification', reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form', dateOfBirth } });
  const ama = (await post('/api/visits', visitInput('Ama', '1994-06-15'))).value;
  const ben = (await post('/api/visits', visitInput('Ben', '1988-11-02'))).value;
  expect((await post('/api/commands/call_patient', { name: 'ama', room: 'Room 1' })).value.ok).toBe(true);
  const record = await post('/api/commands/get_record', { name: 'am' });
  expect(record.value.data.record.allergies).toContain('Penicillin, recorded 2023 (demo record)');
  await page.goto(base + '/exam?room=1&fixture=1');
  await expect(page.getByText('Ama is on the way', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo records — fictional', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Listen for Hey Crisp', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Penicillin, recorded 2023 (demo record)', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: '/tmp/crisp-p13a-browser/exam-chart.png', fullPage: true });
  await page.getByRole('button', { name: 'Patient done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Room 1 · waiting for patient', exact: true })).toBeVisible();
  await page.goto(base + '/dashboard?fixture=1');
  const region = page.getByRole('region', { name: 'Crisp suggestions' });
  await expect(region.getByText(/Room 1 is free.*Ben/)).toBeVisible();
  await region.getByRole('button', { name: 'Yes', exact: true }).first().click();
  await expect(page.getByText('Calling Ben to Room 1.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Waiting room · 0 waiting', exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/crisp-p13a-browser/command-center-live.png', fullPage: true });
  const suggestions = await (await request.get(base + '/api/suggestions')).json();
  expect(suggestions.dispositions[ama.id].status).toBe('done');
  expect((await post('/api/commands/patient_summary', { name: 'Ben' })).value.data).toMatchObject({ id: ben.id, status: 'called', room: '1' });
  expect((await post('/api/commands/get_record', { name: 'Ama' })).value.data.record.name).toBe('Ama');
  await expect(region.getByText("Ben's chart is ready in Room 1.", { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Enable voice', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__crispSpoken.filter(text => text.includes("Ben's chart is ready")).length)).toBe(1);
  const refreshed = page.waitForResponse(response => response.url().endsWith('/api/suggestions'));
  await page.evaluate(() => window.dispatchEvent(new Event('crisp-staff-change')));
  await refreshed;
  await page.waitForTimeout(200);
  await expect.poll(() => page.evaluate(() => window.__crispSpoken.filter(text => text.includes("Ben's chart is ready")).length)).toBe(1);
  await page.getByRole('button', { name: 'Summarize this shift', exact: true }).click();
  const summaryCard = page.locator('.staff-suggestion').filter({ has: page.locator('small', { hasText: 'shift summary' }) });
  await expect(summaryCard).toBeVisible();
  const summaryText = await summaryCard.locator('p').innerText();
  await expect.poll(() => page.evaluate(text => window.__crispSpoken.filter(item => item === text).length, summaryText)).toBe(1);
  await page.waitForTimeout(200);
  expect(await page.evaluate(text => window.__crispSpoken.filter(item => item === text).length, summaryText)).toBe(1);
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, checks: ['fixture stays local', 'wake off by default on both screens', 'fictional record and allergy chart', 'Patient done frees room', 'Yes calls next patient', 'record retained', 'suggestion speech once across refresh (simulated audio output)', 'no browser errors'], screenshots: '/tmp/crisp-p13a-browser' }));
} finally { await browser.close(); }
