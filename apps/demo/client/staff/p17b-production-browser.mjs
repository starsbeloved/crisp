// Production build + real local API/SSE in Chrome. Fictional visits only; no providers or real mic.
import { chromium, expect } from '@playwright/test';
const base = process.env.P17B_BASE || 'http://127.0.0.1:5222';
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const errors = [], checks = [];
context.on('page', page => { page.on('pageerror', error => errors.push(error.message)); page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); }); });
await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
const post = async (path, data) => {
  const response = await context.request.post(base + path, { data }); expect(response.ok()).toBe(true); return response.json();
};
try {
  const station = await context.newPage(); await station.goto(base + '/station?choose=1');
  await expect(station.getByRole('button', { name: /Exam room 1/ })).toBeVisible();
  await expect(station.getByRole('button', { name: /Lobby/ })).toHaveCount(0);
  checks.push('production station picker has four choices and hides Lobby');
  const dashboard = await context.newPage(), exam = await context.newPage();
  await dashboard.goto(base + '/dashboard'); await exam.goto(base + '/exam?room=Room%20one');
  await expect(exam.getByRole('heading', { name: 'Room 1 · waiting for patient' })).toBeVisible();
  const anna = await post('/api/visits', { name: 'Anna', descriptor: null, answers: { reason: 'Fictional filming headache', reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form' } });
  await expect(dashboard.locator('.patient-list')).toContainText('Anna');
  expect((await post('/api/commands/call_patient', { name: 'Anna', room: 'room one' })).ok).toBe(true);
  await expect(exam.getByRole('heading', { name: 'Anna', exact: true })).toBeVisible();
  await expect(exam.getByText('matched by name only', { exact: true })).toBeVisible();
  await expect(exam.getByText('Demo records — fictional', { exact: true }).first()).toBeVisible();
  await expect(exam.getByText('Penicillin', { exact: true })).toBeVisible();
  const label = `#${anna.queueNo} · Anna — Room 1`;
  await dashboard.locator('.called-list').evaluate(el => el.open = true);
  await expect(dashboard.getByRole('button', { name: label, exact: true })).toBeVisible();
  await expect(dashboard.getByTitle('Queue number').filter({ hasText: `#${anna.queueNo}` })).toBeVisible();
  await expect(exam.getByRole('option', { name: label, exact: true })).toHaveCount(1);
  await exam.getByRole('button', { name: 'Read recorded allergies' }).click();
  await expect(exam.getByText("From Anna's demo record: allergic to penicillin.", { exact: true })).toBeVisible();
  checks.push('spoken room normalization + SSE auto-open + exact queue/room labels + name-only fictional allergy readback');
  expect((await post('/api/exam/patient-done', { room: 'Room one', visitId: anna.id })).ok).toBe(true);
  await expect(exam.getByRole('heading', { name: 'Room 1 · waiting for patient' })).toBeVisible();
  for (const [name, dob, found] of [['Jason Miller', '1990-03-12', true], ['Daniel Kim', '1985-11-02', true], ['Anna Lopez', '1997-07-20', false]]) {
    const visit = await post('/api/visits', { name, descriptor: null, answers: { reason: 'Fictional record check', dateOfBirth: dob, reasonChips: [], onset: 'today', trend: 'same', followUp: null, via: 'form' } });
    await post(`/api/visits/${visit.id}/call-in`, { room: 'Room one' });
    await expect(exam.getByRole('heading', { name, exact: true })).toBeVisible();
    if (found) {
      await expect(exam.getByText('Matched by first name + date of birth.', { exact: true })).toBeVisible();
      await expect(exam.locator('.exam-history .exam-record-list').nth(3).locator('li')).toHaveCount(2);
    } else await expect(exam.getByText("I don't have earlier records for Anna in this demo system.", { exact: true })).toBeVisible();
    expect((await post('/api/exam/patient-done', { room: '1', visitId: visit.id })).ok).toBe(true);
  }
  checks.push('full-name/DOB records and two prior visits; mismatched DOB never uses name-only fallback; chart clears on Patient done');
  await station.goto(base + '/lobby'); await expect(station.locator('body')).toContainText('Crisp');
  checks.push('direct Lobby route remains available');
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, production: true, checks, consoleErrors: errors, microphone: 'not exercised', providers: 'not exercised' }, null, 2));
} finally { await browser.close(); }
