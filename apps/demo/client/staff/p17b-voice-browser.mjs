// Real Chrome + dev module transport. Recognition and ElevenLabs are explicitly simulated.
import { chromium, expect } from '@playwright/test';
const base = process.env.P17B_VOICE_BASE || 'http://127.0.0.1:5223';
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const errors = [], checks = [];
const sdk = `
import React from '/node_modules/.vite/deps/react.js';
const { createElement, Fragment, useCallback, useState } = React;
export function ConversationProvider({children}) { return createElement(Fragment, null, children); }
export function useConversation(callbacks) {
  window.__callbacks = callbacks;
  const [status, setStatus] = useState('disconnected');
  const endSession = useCallback(() => { window.__ends = (window.__ends || 0) + 1; setStatus('disconnected'); }, []);
  const startSession = useCallback(async options => { window.__tools = options.clientTools; setStatus('connected'); }, []);
  const sendContextualUpdate = useCallback(text => { window.__context = text; }, []);
  const getOutputVolume = useCallback(() => 0, []);
  const sendUserMessage = useCallback(text => { window.__sent = text; }, []);
  return { status, isSpeaking:false, endSession, startSession, sendContextualUpdate, sendUserMessage, getOutputVolume };
}`;
await context.route('**/node_modules/.vite/deps/@elevenlabs_react.js*', route => route.fulfill({ contentType: 'application/javascript', body: sdk }));
await context.route('**/api/agent/signed-url*', route => route.fulfill({ json: { signedUrl: 'wss://synthetic.invalid' } }));
await context.route('**/api/commands/*', route => route.fulfill({ json: { ok: true, message: 'Recorded confirmation (SIMULATED).' } }));
await context.route('**/api/suggestions', route => route.fulfill({ json: { suggestions: [], dispositions: {} } }));
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
try {
  for (const path of ['/dashboard', '/exam?room=1']) {
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base + path);
    await expect(page.getByRole('button', { name: 'Listen for Hey Crisp', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Listen for Hey Crisp', exact: true }).click();
    await expect(page.locator('.staff-mic-light')).toHaveAttribute('data-live', 'true');
    await page.evaluate(() => window.__recognition.onend());
    await expect.poll(() => page.evaluate(() => window.__recognition.starts)).toBe(2);
    for (const [phrase, goodbye] of [['heychris', 'No.'], ['Hi kris', "that’s all"], ['Okay christ', 'Thanks!'], ['Hey grisp', 'stop']]) {
      await page.evaluate(phrase => window.__recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: phrase + ', list waiting' } }] }), phrase);
      await expect(page.getByText(`Matched wake phrase: ${phrase}`, { exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.__sent)).toBe('list waiting');
      const result = await page.evaluate(() => window.__tools.list_waiting({})); expect(result).toContain('Anything else?');
      await page.evaluate(message => window.__callbacks.onMessage({ role: 'user', message }), goodbye);
      await expect(page.getByRole('button', { name: 'End voice', exact: true })).toHaveCount(0);
      await expect(page.locator('.staff-mic')).toContainText('listening for Hey Crisp');
    }
    await page.evaluate(() => window.__recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Hey crisps, list waiting' } }] }));
    await expect(page.getByRole('button', { name: 'End voice', exact: true })).toBeVisible();
    await page.evaluate(async () => { await window.__tools.list_waiting({}); window.__callbacks.onMessage({ role: 'agent', message: 'Recorded confirmation. Anything else?' }); });
    await expect(page.getByRole('button', { name: 'End voice', exact: true })).toHaveCount(0, { timeout: 11000 });
    await expect(page.locator('.staff-mic')).toContainText('listening for Hey Crisp');
    checks.push(`${path}: Chrome stop/restart; merged/fuzzy wake phrase shown; command forwarded; all farewells and eight-second silence return to wake listening`);
    await page.close();
  }
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, checks, consoleErrors: errors, build: 'dev (SDK simulation via module route)', microphone: 'SIMULATED', providers: 'SIMULATED' }, null, 2));
} finally { await browser.close(); }
