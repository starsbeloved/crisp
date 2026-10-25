// Optimized production bundle and real ElevenLabs SDK. Provider wire protocol and speech are simulated.
import { chromium, expect } from '@playwright/test';
const base = process.env.P17B_BASE || 'http://127.0.0.1:5222';
const browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.grantPermissions(['microphone']);
const errors = [], checks = [], outgoing = [];
let socket;
await context.routeWebSocket('wss://synthetic.invalid/**', ws => {
  socket = ws;
  ws.onMessage(raw => {
    const message = JSON.parse(String(raw));
    if (message.type !== 'user_audio_chunk') outgoing.push(message);
    if (message.type === 'conversation_initiation_client_data') ws.send(JSON.stringify({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'synthetic-local-session', agent_output_audio_format: 'pcm_16000', user_input_audio_format: 'pcm_16000' } }));
  });
});
await context.route('**/api/agent/signed-url*', route => route.fulfill({ json: { signedUrl: 'wss://synthetic.invalid/conversation' } }));
await context.route('**/api/commands/*', route => route.fulfill({ json: { ok: true, message: 'Recorded confirmation (SIMULATED).' } }));
await context.route('**/api/suggestions', route => route.fulfill({ json: { suggestions: [], dispositions: {} } }));
await context.addInitScript(() => {
  // Headless macOS may leave getUserMedia pending even with fake-device flags.
  // Feed an actual Web Audio MediaStream into the unmodified SDK instead.
  navigator.mediaDevices.getUserMedia = async () => {
    const audio = new AudioContext({ sampleRate: 16000 });
    const stream = audio.createMediaStreamDestination().stream;
    const track = stream.getAudioTracks()[0], stop = track.stop.bind(track);
    track.stop = () => { stop(); void audio.close(); };
    return stream;
  };
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
const emit = message => socket.send(JSON.stringify(message));
try {
  for (const path of ['/dashboard', '/exam?room=1']) {
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(base + path);
    await expect(page.getByRole('button', { name: 'Listen for Hey Crisp', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Listen for Hey Crisp', exact: true }).click();
    await page.evaluate(() => window.__recognition.onend());
    await expect.poll(() => page.evaluate(() => window.__recognition.starts)).toBe(2);
    for (const [phrase, goodbye] of [['heychris', 'No.'], ['Hi kris', "that’s all"], ['Okay christ', 'Thanks!'], ['Hey grisp', 'stop']]) {
      outgoing.length = 0;
      await page.evaluate(phrase => window.__recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: phrase + ', list waiting' } }] }), phrase);
      await expect(page.getByText(`Matched wake phrase: ${phrase}`, { exact: true })).toBeVisible();
      await expect(page.locator('.staff-mic')).toContainText('session connected');
      await expect.poll(() => outgoing.some(m => m.type === 'user_message' && m.text === 'list waiting')).toBe(true);
      emit({ type: 'client_tool_call', client_tool_call: { tool_name: 'list_waiting', tool_call_id: 'simulated-list', parameters: {} } });
      await expect.poll(() => outgoing.some(m => m.type === 'client_tool_result' && m.result.includes('Anything else?'))).toBe(true);
      emit({ type: 'agent_response', agent_response_event: { agent_response: 'Recorded confirmation. Anything else?', event_id: 1 } });
      emit({ type: 'user_transcript', user_transcription_event: { user_transcript: goodbye, event_id: 2 } });
      await expect(page.getByRole('button', { name: 'End voice', exact: true })).toHaveCount(0);
      await expect(page.locator('.staff-mic')).toContainText('listening for Hey Crisp');
    }
    outgoing.length = 0;
    await page.evaluate(() => window.__recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Hey crisps, list waiting' } }] }));
    await expect(page.locator('.staff-mic')).toContainText('session connected');
    emit({ type: 'client_tool_call', client_tool_call: { tool_name: 'list_waiting', tool_call_id: 'simulated-silence', parameters: {} } });
    await expect.poll(() => outgoing.some(m => m.type === 'client_tool_result')).toBe(true);
    emit({ type: 'agent_response', agent_response_event: { agent_response: 'Recorded confirmation. Anything else?', event_id: 3 } });
    await expect(page.getByRole('button', { name: 'End voice', exact: true })).toHaveCount(0, { timeout: 11000 });
    await expect(page.locator('.staff-mic')).toContainText('listening for Hey Crisp');
    checks.push(`${path}: production SDK connects, forwards fuzzy wake request once, returns command prompt, and resumes recognition after four farewells and eight seconds of silence`);
    await page.close();
  }
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, production: true, sdk: 'real installed ElevenLabs SDK', checks, consoleErrors: errors, microphone: 'SIMULATED', provider: 'SIMULATED WebSocket protocol' }, null, 2));
} finally { await browser.close(); }
