// Simulated provider boundary in a real browser. No microphone or provider account is used.
// Start P13c API :8802 and Vite :5202 before running.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
const pending = new Set();
page.on('request', request => pending.add(request.url()));
page.on('requestfinished', request => pending.delete(request.url()));
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
page.on('requestfailed', request => console.error(`${request.url()}: ${request.failure()?.errorText}`));
const sdkFixture = `
import React from '/node_modules/.vite/deps/react.js';
const { createElement, Fragment, useCallback, useState } = React;
export function ConversationProvider({children}) {
  return createElement(Fragment, null, createElement('p', {'data-testid':'synthetic-session'}, 'SYNTHETIC voice session — provider simulated'), children);
}
export function useConversation() {
  const [status, setStatus] = useState('disconnected');
  const endSession = useCallback(() => { if (window.__p13cSession) window.__p13cSession.ended = true; setStatus('disconnected'); }, []);
  const startSession = useCallback(async options => { window.__p13cSession = { tools: options.clientTools, ended: false }; setStatus('connected'); }, []);
  const sendContextualUpdate = useCallback(text => { window.__p13cSession.context = text; }, []);
  const getOutputVolume = useCallback(() => 0, []);
  return { status, isSpeaking:false, endSession, startSession, sendContextualUpdate, getOutputVolume, setMuted() {} };
}`;
try {
  await page.route('**/node_modules/.vite/deps/@elevenlabs_react.js*', route => route.fulfill({ contentType: 'application/javascript', body: sdkFixture }));
  await page.route('**/api/agent/signed-url*', route => route.fulfill({ json: { signedUrl: 'wss://synthetic.invalid' } }));
  // This tests the UI's Gemini source branch, not a live Gemini response.
  await page.route('**/api/checkin/follow-up', route => route.fulfill({ json: { question: 'Where do you feel the tightness?', source: 'gemini' } }));
  await page.goto('http://127.0.0.1:5202/check-in');
  await page.getByRole('button', { name: 'Talk to Crisp', exact: true }).click();
  await page.getByText('View options', { exact: true }).click();
  await page.getByRole('switch', { name: 'Show answer summary' }).check();
  await page.getByRole('region', { name: 'What Crisp understood' }).waitFor();
  assert.equal(await page.locator('.checkin').getAttribute('data-step'), 'name');
  assert.match(await page.evaluate(() => window.__p13cSession.context), /date of birth/);
  await page.evaluate(async () => {
    await window.__p13cSession.tools.set_name({ name: 'Ben P13c Synthetic' });
    await window.__p13cSession.tools.set_patient_details({ dateOfBirth: '1998-06-02', phone: '202-555-0101' });
  });
  const understood = page.getByRole('region', { name: 'What Crisp understood' });
  await understood.getByText('1998-06-02', { exact: true }).waitFor();
  await understood.getByText('202-555-0101', { exact: true }).waitFor();
  await page.evaluate(async () => { window.__scan = window.__p13cSession.tools.start_face_scan(); });
  await page.getByRole('button', { name: 'Skip — staff will help' }).click();
  await page.evaluate(async () => { await window.__scan; await window.__p13cSession.tools.save_answers({ reason: 'Chest tightness', onset: 'today', trend: 'worse' }); });
  const rejected = await page.evaluate(() => window.__p13cSession.tools.finish_check_in());
  assert.match(rejected, /get_follow_up_question/);
  const question = await page.evaluate(() => window.__p13cSession.tools.get_follow_up_question());
  assert.equal(question, 'Where do you feel the tightness?');
  await understood.getByText('Gemini follow-up', { exact: true }).waitFor();
  await understood.getByText('Because you mentioned “Chest tightness”.', { exact: true }).waitFor();
  await page.screenshot({ path: '/private/tmp/crisp-p13c-voice-synthetic.png', fullPage: true });
  await page.evaluate(async question => { await window.__p13cSession.tools.save_follow_up({ question, answer: 'In the middle' }); }, question);
  const result = await page.evaluate(() => window.__p13cSession.tools.finish_check_in());
  assert.match(result, /^queue number \d+$/);
  await page.getByText('You’re checked in, Ben P13c Synthetic.', { exact: true }).waitFor();
  // Keep the session alive long enough for the agent to speak the returned queue number.
  assert.equal(await page.evaluate(() => window.__p13cSession.ended), false);
  await page.waitForFunction(() => window.__p13cSession.ended, { timeout: 9500 });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ simulatedVoice: 'pass', detailsTools: true, requiredFollowUpTool: true, provenanceVisible: true, queueReplyBeforeMicRelease: true, result, errors }));
} catch (error) {
  await page.screenshot({ path: '/private/tmp/crisp-p13c-voice-failure.png', fullPage: true });
  console.error(JSON.stringify({ errors, pending: [...pending], body: await page.locator('body').innerText() })); throw error;
} finally { await browser.close(); }
