// @vitest-environment jsdom
import { act, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrispAgent } from './CrispAgent.tsx';
import { AskCrispVoice } from '../../dashboard/AskCrispVoice.tsx';
import { CheckInContext, type CheckInController } from '../controller-types.ts';
import type { RoomState } from '../../../shared/types.ts';

const sdk = vi.hoisted(() => ({
  status: 'disconnected', options: {} as Record<string, any>, start: vi.fn(), end: vi.fn(), mute: vi.fn(),
  context: vi.fn(), callbacks: {} as Record<string, any>, room: null as RoomState | null,
}));
vi.mock('@elevenlabs/react', () => ({
  ConversationProvider: ({ children, isMuted }: PropsWithChildren<{ isMuted?: boolean }>) => { if (isMuted !== undefined) sdk.mute(isMuted); return children; },
  useConversation: (callbacks: Record<string, any>) => {
    sdk.callbacks = callbacks;
    return { status: sdk.status, isSpeaking: false, sendContextualUpdate: sdk.context, endSession: sdk.end, setMuted: sdk.mute, getOutputVolume: () => 0,
      startSession: (options: Record<string, any>) => { sdk.options = options; sdk.start(options); } };
  },
}));
vi.mock('../../lib/useRoomState.ts', () => ({ useRoomState: () => ({ state: sdk.room, connected: Boolean(sdk.room) }) }));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  sdk.status = 'disconnected'; sdk.options = {}; sdk.start.mockClear(); sdk.end.mockClear(); sdk.mute.mockClear();
  sdk.context.mockClear();
  sdk.room = { serverNow: 0, visits: [], vitals: {}, alerts: [], cameras: {}, nowCalling: null, handoffs: {}, references: [], providers: { gemini: false, elevenlabs: false, agent: true } };
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('{"signedUrl":"wss://api.elevenlabs.io/v1/convai/conversation?test=1"}')));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(node: React.ReactNode) { await act(async () => { root.render(node); }); }
function click(label: string) { const button = [...container.querySelectorAll('button')].find(button => button.textContent === label); expect(button).toBeDefined(); button!.click(); }
function controller(): CheckInController {
  const c: CheckInController = {
    followUpPrompt: null, setFollowUpPrompt: vi.fn(),
    step: 'welcome', name: '', answers: { reason: '', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' }, face: { status: 'idle', message: '' }, queueNo: null, via: 'form',
    setVia: vi.fn(v => { c.via = v; }), setName: vi.fn(n => { c.name = n; }), startFaceScan: vi.fn(async () => ({ ok: true, reason: null })),
    skipFace: vi.fn(), setAnswers: vi.fn(), setFollowUp: vi.fn(), finish: vi.fn(async () => ({ queueNo: 3 })), reset: vi.fn(), goTo: vi.fn(),
  }; return c;
}
describe('voice widgets with a simulated ElevenLabs session', () => {
  it('keeps voice hidden without configured ids or after an unavailable signing response', async () => {
    const c = controller(); sdk.room!.providers.agent = false;
    const page = <CheckInContext value={c}><CrispAgent /></CheckInContext>;
    await render(page);
    expect(container.textContent).toContain('Talk to Crisp'); expect(container.textContent).toContain('I’d rather tap'); expect(fetch).not.toHaveBeenCalled();
    sdk.room!.providers.agent = true;
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 503 }));
    await render(<CheckInContext value={c}><CrispAgent /></CheckInContext>);
    expect(container.textContent).toContain('Talk to Crisp'); expect(container.textContent).toContain('I’d rather tap');
  });
  it('starts with signed URL and tools, shows both captions, and preserves fields when switching to taps', async () => {
    const c = controller();
    await render(<CheckInContext value={c}><CrispAgent /></CheckInContext>);
    await act(async () => click('Talk to Crisp'));
    expect(c.via).toBe('voice');
    expect(c.goTo).toHaveBeenCalledWith('name');
    expect(sdk.options.clientTools.set_patient_details).toBeTypeOf('function');
    expect(sdk.options).toMatchObject({ connectionType: 'websocket', signedUrl: expect.stringContaining('wss://') });
    await act(async () => { await sdk.options.clientTools.set_name({ name: 'Ama' });
      sdk.callbacks.onMessage({ role: 'user', source: 'user', message: 'My name is Ama' });
      sdk.callbacks.onMessage({ role: 'agent', source: 'ai', message: '[happy] Thanks, Ama [laughs]' }); });
    sdk.status = 'connected'; await render(<CheckInContext value={c}><CrispAgent /></CheckInContext>);
    expect(sdk.context).toHaveBeenCalledWith(expect.stringContaining('date of birth'));
    expect(sdk.context).toHaveBeenCalledWith(expect.stringContaining('get_follow_up_question'));
    expect(c.name).toBe('Ama'); expect(container.textContent).toContain('Crisp: Thanks, Ama'); expect(container.textContent).not.toContain('[happy]');
    await act(() => container.querySelector<HTMLInputElement>('[aria-label="Show conversation history"]')!.click());
    expect(container.querySelector('[aria-label="Conversation history"]')?.textContent).toContain('You: My name is Ama');
    await act(async () => click('I’d rather tap'));
    expect(c.name).toBe('Ama'); expect(c.via).toBe('form'); expect(sdk.end).toHaveBeenCalled(); expect(container.querySelector('button')).toBeNull();
  });
  it('shows fallback after a session error', async () => {
    const c = controller(); c.step = 'name';
    await render(<CheckInContext value={c}><CrispAgent /></CheckInContext>);
    await act(() => sdk.callbacks.onMessage({ role: 'agent', source: 'ai', message: 'Hello there' }));
    await act(async () => sdk.callbacks.onError('microphone denied'));
    expect(container.textContent).toContain('Talk to Crisp'); expect(container.textContent).toContain('I’d rather tap');
    expect(container.textContent).toContain('Conversation paused');
    expect(sdk.end).toHaveBeenCalled();
  });
  it('keeps the answer summary hidden until its view toggle is enabled and preserves corrections', async () => {
    const c = controller(); c.name = 'Ama'; c.via = 'voice'; c.step = 'name'; sdk.status = 'connected';
    await render(<CheckInContext value={c}><CrispAgent /></CheckInContext>);
    expect(container.querySelector('[aria-label="What Crisp understood"]')).toBeNull();
    const toggle = container.querySelector<HTMLInputElement>('[aria-label="Show answer summary"]');
    expect(toggle).not.toBeNull();
    expect(toggle!.checked).toBe(false);
    await act(() => toggle!.click());
    const summary = container.querySelector('[aria-label="What Crisp understood"]')!;
    expect(summary.textContent).toContain('Ama');
    await act(() => summary.querySelector<HTMLButtonElement>('[aria-label="Edit Name"]')!.click());
    const input = summary.querySelector('input')!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Amara');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(() => summary.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(c.setName).toHaveBeenCalledWith('Amara');
    await act(() => toggle!.click());
    expect(container.querySelector('[aria-label="What Crisp understood"]')).toBeNull();
    expect(c.name).toBe('Amara');
    expect(sdk.end).not.toHaveBeenCalled();
  });
  it('shows the current Crisp message without scrolling and reveals earlier captions only on request', async () => {
    sdk.status = 'connected';
    await render(<CheckInContext value={controller()}><CrispAgent /></CheckInContext>);
    await act(() => {
      sdk.callbacks.onMessage({ role: 'agent', source: 'ai', message: 'What name should I call you?' });
      sdk.callbacks.onMessage({ role: 'user', source: 'user', message: 'Ama' });
      sdk.callbacks.onMessage({ role: 'agent', source: 'ai', message: 'Thanks, Ama. What brings you in?' });
    });
    const bubble = container.querySelector('[aria-label="Conversation captions"]');
    expect(bubble?.textContent).toContain('Thanks, Ama. What brings you in?');
    expect(bubble?.textContent).not.toContain('What name should I call you?');
    expect(container.querySelector('[aria-label="Conversation history"]')).toBeNull();
    const toggle = container.querySelector<HTMLInputElement>('[aria-label="Show conversation history"]')!;
    await act(() => toggle.click());
    const history = container.querySelector('[aria-label="Conversation history"]');
    expect(history?.textContent).toContain('What name should I call you?');
    expect(history?.textContent).toContain('You: Ama');
    await act(() => toggle.click());
    expect(container.querySelector('[aria-label="Conversation history"]')).toBeNull();
  });
  it('places display controls and revealed answers in the page footer when a target is supplied', async () => {
    const footer = document.createElement('div'); document.body.append(footer);
    sdk.status = 'connected';
    try {
      await render(<CheckInContext value={controller()}><CrispAgent optionsTarget={footer} /></CheckInContext>);
      expect(container.querySelector('.checkin-view-options')).toBeNull();
      const toggle = footer.querySelector<HTMLInputElement>('[aria-label="Show answer summary"]');
      expect(toggle).not.toBeNull();
      await act(() => toggle!.click());
      expect(footer.querySelector('[aria-label="What Crisp understood"]')).not.toBeNull();
      expect(container.querySelector('[aria-label="What Crisp understood"]')).toBeNull();
    } finally { footer.remove(); }
  });
  it('hides the previous conversation when the kiosk returns to welcome for the next visitor', async () => {
    const c = controller(); c.step = 'name'; sdk.status = 'connected';
    await render(<CheckInContext value={c}><CrispAgent /></CheckInContext>);
    await act(() => sdk.callbacks.onMessage({ role: 'agent', source: 'ai', message: 'Thanks, Ama' }));
    expect(container.querySelector('[aria-label="Conversation captions"]')?.textContent).toContain('Thanks, Ama');
    c.step = 'welcome'; sdk.status = 'disconnected';
    await render(<CheckInContext value={c}><CrispAgent /></CheckInContext>);
    expect(container.querySelector('[aria-label="Conversation captions"]')).toBeNull();
    expect(container.querySelector('.checkin-view-options')).toBeNull();
  });
  it('mutes nurse input on keyboard release even if connection finishes later, and fetches the current room digest', async () => {
    await render(<AskCrispVoice />);
    const button = container.querySelector('button')!;
    await act(async () => { button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); });
    expect(sdk.start).toHaveBeenCalledOnce(); expect(sdk.mute).toHaveBeenLastCalledWith(false);
    await act(async () => { button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true })); });
    expect(sdk.mute).toHaveBeenLastCalledWith(true);
    sdk.status = 'connected'; await render(<AskCrispVoice />);
    expect(sdk.mute).toHaveBeenLastCalledWith(true);
    await act(async () => { expect(JSON.parse(await sdk.options.clientTools.get_room_digest())).toMatchObject({ visits: [] }); });
    await act(async () => { window.dispatchEvent(new Event('blur')); });
    expect(sdk.mute).toHaveBeenLastCalledWith(true);
  });
});

it('shows voice identity fields and the actual follow-up context', async () => {
  const c = controller(); c.via = 'voice'; c.step = 'followup';
  c.answers.dateOfBirth = '1995-05-14'; c.answers.phone = '202-555-0100';
  c.followUpPrompt = { question: 'Where is the tightness?', why: 'Because you mentioned “chest tightness”.', source: 'template' };
  sdk.status = 'connected';
  await render(<CheckInContext value={c}><CrispAgent /></CheckInContext>);
  await act(() => container.querySelector<HTMLInputElement>('[aria-label="Show answer summary"]')!.click());
  expect(container.textContent).toContain('1995-05-14');
  expect(container.textContent).toContain('202-555-0100');
  expect(container.textContent).toContain('Template fallback');
  expect(container.textContent).toContain('Where is the tightness?');
  expect(container.textContent).toContain('Because you mentioned “chest tightness”.');
});
