// @vitest-environment jsdom
import { act, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AskCrispVoice } from './AskCrispVoice.tsx';
import { demoFixture } from './fixture.ts';
const session = vi.hoisted(() => ({ status: 'disconnected', start: vi.fn(async () => {}), endSession: vi.fn(), sendUserMessage: vi.fn(), muted: true, tools: {} as Record<string, (input: unknown) => Promise<string>>, connected: true, available: true }));
vi.mock('@elevenlabs/react', () => ({ ConversationProvider: ({ children, isMuted }: PropsWithChildren<{ isMuted: boolean }>) => { session.muted = isMuted; return children; } }));
vi.mock('../checkin/agent/useVoiceAgent.ts', () => ({ useVoiceAgent: (_mode: string, _enabled: boolean, tools: typeof session.tools) => { session.tools = tools; return { ...session, captions: [], mascotState: 'idle', level: 0 }; } }));
vi.mock('../lib/useRoomState.ts', () => ({ useRoomState: () => ({ state: demoFixture(), connected: session.connected }) }));
let root: Root | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; session.status = 'disconnected'; session.connected = true; session.available = true; vi.clearAllMocks(); vi.unstubAllGlobals(); });
it('wake starts existing nurse voice, forwards the initial command once and registers action tools with toast feedback', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const listeners: any[] = [];
  class Recognition { onresult: any; onend: any; onerror: any; onstart: any; start = vi.fn(() => this.onstart?.()); abort = vi.fn(); constructor() { listeners.push(this); } }
  vi.stubGlobal('webkitSpeechRecognition', Recognition);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, message: 'Calling Ama to Room 1.' }) })));
  const node = document.createElement('div'); root = createRoot(node);
  await act(() => root!.render(<AskCrispVoice />)); expect(listeners).toHaveLength(0); expect(session.muted).toBe(true);
  await act(() => [...node.querySelectorAll('button')].find(button => button.textContent === 'Listen for Hey Crisp')!.click());
  await act(async () => listeners[0].onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Hey Crispy, call Ama to Room 1' } }] }));
  expect(session.start).toHaveBeenCalledTimes(1); expect(session.muted).toBe(false); expect(listeners[0].abort).toHaveBeenCalled();
  session.status = 'connected'; await act(() => root!.render(<AskCrispVoice />));
  expect(session.sendUserMessage).toHaveBeenCalledExactlyOnceWith('call Ama to Room 1');
  await act(() => root!.render(<AskCrispVoice />)); expect(session.sendUserMessage).toHaveBeenCalledTimes(1);
  await act(async () => { await session.tools.call_patient({ name: 'Ama', room: '1' }); });
  expect(node.textContent).toContain('Calling Ama to Room 1.');
  expect(JSON.parse(await session.tools.get_room_digest({})).visits).toHaveLength(2);
  await act(() => [...node.querySelectorAll('button')].find(button => button.textContent === 'End voice')!.click());
  expect(session.endSession).toHaveBeenCalled(); expect(session.muted).toBe(true);
});
it('mutes and ends the nurse session when the room disconnects', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); root = createRoot(document.createElement('div'));
  await act(() => root!.render(<AskCrispVoice />));
  session.connected = false; await act(() => root!.render(<AskCrispVoice />));
  expect(session.endSession).toHaveBeenCalled(); expect(session.muted).toBe(true);
});
