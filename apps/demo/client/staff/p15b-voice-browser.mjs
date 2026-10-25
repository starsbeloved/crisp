// Real Chrome, simulated ElevenLabs and browser recognition boundaries. No external APIs or real mic.
import { chromium, expect } from '@playwright/test';
const base = 'http://127.0.0.1:5212';
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
const sdk = `
import React from '/node_modules/.vite/deps/react.js';
const { createElement, Fragment, useCallback, useState } = React;
export function ConversationProvider({children}) { return createElement(Fragment, null, createElement('p', {}, 'SYNTHETIC voice session — provider simulated'), children); }
export function useConversation(callbacks) {
  window.__callbacks = callbacks;
  const [status, setStatus] = useState('disconnected');
  const endSession = useCallback(() => setStatus('disconnected'), []);
  const startSession = useCallback(async options => { window.__tools = options.clientTools; setStatus('connected'); }, []);
  const sendContextualUpdate = useCallback(text => { window.__context = text; }, []);
  const getOutputVolume = useCallback(() => 0, []);
  const sendUserMessage = useCallback(text => { window.__sent = text; }, []);
  return { status, isSpeaking:false, endSession, startSession, sendContextualUpdate, sendUserMessage, getOutputVolume };
}`;
await context.route('**/node_modules/.vite/deps/@elevenlabs_react.js*', route => route.fulfill({ contentType: 'application/javascript', body: sdk }));
await context.route('**/api/agent/signed-url*', route => route.fulfill({ json: { signedUrl: 'wss://synthetic.invalid' } }));
await context.addInitScript(() => {
  const room = { serverNow: Date.now(), visits: [], vitals: {}, alerts: [], cameras: {}, nowCalling: null, handoffs: {}, references: [], providers: { agent: true, gemini: false, elevenlabs: false } };
  window.EventSource = class extends EventTarget {
    constructor() { super(); setTimeout(() => { this.onopen?.(); this.dispatchEvent(new MessageEvent('state', { data: JSON.stringify(room) })); }, 0); }
    close() {}
  };
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    constructor() { window.__recognition = this; this.starts = 0; }
    start() { this.starts++; this.onstart?.(); }
    abort() { this.onend?.(); }
  };
});
const page = await context.newPage(); const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(base + '/check-in');
  await page.getByRole('button', { name: 'Talk to Crisp', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__tools))).toBe(true);
  const details = await page.evaluate(async () => {
    await window.__tools.set_name({ name: 'Synthetic Voice Patient' });
    return window.__tools.set_patient_details({ dateOfBirth: 'June 15th 1994', phone: '202-555-0100' });
  });
  expect(details).toMatch(/Next:.*face scan/);
  await expect(page.locator('#checkin-dob')).toHaveValue('1994-06-15');
  await page.evaluate(() => { window.__pendingScan = window.__tools.start_face_scan(); });
  await page.getByRole('button', { name: 'Continue', exact: true }).first().click();
  await page.evaluate(() => window.__pendingScan);
  await page.evaluate(() => window.__tools.save_answers({ reason: 'Fictional headache', onset: 'today', trend: 'same' }));
  const question = await page.evaluate(() => window.__tools.get_follow_up_question());
  expect(question).toContain('Next:');
  await page.evaluate(async text => {
    await window.__tools.save_follow_up({ question: text.split(' Next:')[0], answer: 'Nothing else' });
  }, question);
  checks.push('simulated voice tools normalize spoken DOB and reach follow-up after manual face-scan Continue');

  await page.evaluate(() => {
    for (let i = 0; i < 12; i++) window.__callbacks.onMessage({ role: 'user', message: `Message ${i}: This is synthetic caption text for checking whether the conversation follows new messages.` });
  });
  const box = page.getByRole('log', { name: 'Conversation captions', exact: true });
  await expect.poll(() => box.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(5);
  await box.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await page.evaluate(() => window.__callbacks.onMessage({ role: 'user', message: 'A new message while reading earlier messages' }));
  await expect.poll(() => box.evaluate(el => el.scrollTop)).toBe(0);
  await box.evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  await page.evaluate(() => window.__callbacks.onMessage({ role: 'user', message: 'Newest message after scrolling back down' }));
  await expect.poll(() => box.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(5);
  checks.push('captions auto-scroll, pause when scrolled up, and resume at bottom');
  const finished = await page.evaluate(() => window.__tools.finish_check_in());
  expect(finished).toMatch(/^Queue number \d+\. Please take a seat — Crisp will call you\. Next:/);
  await expect(page.locator('.checkin')).toHaveAttribute('data-step', 'done');
  checks.push('actual visit submission returns queue number and seat instruction to simulated voice agent');

  await page.goto(base + '/dashboard');
  const listen = page.getByRole('button', { name: 'Listen for Hey Crisp', exact: true });
  await expect(listen).toBeEnabled(); await listen.click();
  await expect(page.locator('.staff-mic-light')).toHaveAttribute('data-live', 'true');
  await page.evaluate(() => window.__recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Test phrase without wake words' } }] }));
  await expect(page.getByText('Last heard: Test phrase without wake words', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__recognition.onend());
  await expect.poll(() => page.evaluate(() => window.__recognition.starts)).toBe(2);
  await page.evaluate(() => { window.__recognition.onerror({ error: 'not-allowed' }); window.__recognition.onend(); });
  await expect(page.getByText(/Microphone permission denied/)).toBeVisible();
  await expect(page.locator('.staff-mic-light')).toHaveAttribute('data-live', 'false');
  checks.push('live mic indicator, last phrase, recognition restart and permission-denied instructions (recognition simulated)');
  await page.getByRole('button', { name: 'Talk to Crisp', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End voice', exact: true })).toBeVisible();
  expect(await page.evaluate(() => typeof window.__tools.remove_patient)).toBe('function');
  await page.getByRole('button', { name: 'End voice', exact: true }).click();
  checks.push('click-to-talk starts nurse voice and exposes remove_patient tool (provider simulated)');
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, checks, pageErrors: errors, provider: 'SIMULATED', microphone: 'SIMULATED' }, null, 2));
} finally { await browser.close(); }
