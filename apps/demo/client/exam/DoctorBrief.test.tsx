// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomState, Visit } from '../../shared/types.ts';
import { DoctorBrief } from './DoctorBrief.tsx';

const visit: Visit = { id: 'ama', queueNo: 2, name: 'Ama', createdAt: 1, status: 'called', calledAt: 2, room: '1', faceEnrolled: false,
  summary: null, answers: { reason: 'chest tightness', reasonChips: [], onset: 'today', trend: 'worse', followUp: null, via: 'form' } };
const state: RoomState = { serverNow: 3, visits: [visit], vitals: {}, alerts: [], cameras: {}, nowCalling: null, handoffs: {}, references: [], providers: { gemini: true, elevenlabs: false, agent: false } };
let root: Root | undefined;

afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; vi.unstubAllGlobals(); });

describe('doctor pre-visit brief', () => {
  it('shows the provider source and marks the records context fictional', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ answer: 'Today: chest tightness\nWaiting room: no request recorded\nSuggested next step: a human check', source: 'gemini' }))));
    const container = document.createElement('div'); root = createRoot(container);
    await act(async () => { root!.render(<DoctorBrief visit={visit} state={state} />); });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('Doctor pre-visit brief');
    expect(container.textContent).toContain('✦ Gemini');
    expect(container.textContent).toContain('Demo records — fictional');
    expect(container.textContent).toContain('Suggested next step: a human check');
  });
});
