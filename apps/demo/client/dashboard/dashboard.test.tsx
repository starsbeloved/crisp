// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RoomState } from '../../shared/types.ts';
import { DashboardPage } from './DashboardPage.tsx';
import { LobbyPage } from '../lobby/LobbyPage.tsx';
import { demoFixture } from './fixture.ts';
import { waitingQueue } from './presentation.ts';

const room = vi.hoisted(() => ({ state: null as RoomState | null, connected: true }));
vi.mock('../lib/useRoomState.ts', () => ({ useRoomState: () => room }));
const answers = { reason: 'Private complaint', reasonChips: [], onset: 'today' as const, trend: 'same' as const, followUp: null, via: 'form' as const };
function state(): RoomState {
  return { serverNow: Date.now(), visits: [{ id: 'a', queueNo: 1, name: 'Ama Jones', createdAt: Date.now(), faceEnrolled: true, answers, summary: null, status: 'waiting', calledAt: null, room: null }], vitals: {}, alerts: [], cameras: {}, nowCalling: null, handoffs: {}, references: [], providers: { gemini: false, elevenlabs: false, agent: false } };
}
describe('dashboard and public lobby', () => {
  it('puts an open or acknowledged red request first and restores arrival order when checked', () => {
    const s = demoFixture();
    expect(waitingQueue(s).map(v => v.name)).toEqual(['Ama', 'Bea']);
    s.alerts[0].status = 'acknowledged';
    expect(waitingQueue(s).map(v => v.name)).toEqual(['Ama', 'Bea']);
    s.alerts[0].status = 'checked';
    expect(waitingQueue(s).map(v => v.name)).toEqual(['Bea', 'Ama']);
    s.visits[0].status = 'called';
    expect(waitingQueue(s).map(v => v.name)).toEqual(['Ama']);
  });
  it('hides rejected camera readings and pulse trace when signal is low', () => {
    room.state = state();
    room.state.vitals.a = { visitId: 'a', lastSeenAt: Date.now(), cameraId: 'A', box: { x: 0, y: 0, w: 1, h: 1 }, hrBpm: 197, rrBpm: 47, hrQuality: 'low', rrQuality: 'low', baselineHr: null, baselineRr: null, posture: null, hint: 'too dark', source: 'live', pulseTrace: [0, 1, 0], level: 'none', history: [] };
    const html = renderToStaticMarkup(<DashboardPage />);
    const node = document.createElement('div'); node.innerHTML = html;
    const visible = node.textContent;
    expect(visible).not.toContain('197');
    expect(visible).not.toContain('47');
    expect(visible).toContain('low signal');
  });
  it('shows only first name on call and initials in the public queue', () => {
    room.state = state();
    room.state.nowCalling = { id: 'call', visitId: 'b', name: 'Bea Smith', queueNo: 2, room: 'Room 2', at: Date.now(), audio: 'failed' };
    const html = renderToStaticMarkup(<LobbyPage />);
    expect(html).toContain('Bea');
    expect(html).not.toContain('Smith');
    expect(html).not.toContain('Ama');
    expect(html).not.toContain('Private complaint');
    expect(html).not.toContain('Room Room');
    expect(html).toContain('A.');
  });
});
