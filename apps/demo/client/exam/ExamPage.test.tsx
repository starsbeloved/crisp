// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomState, Visit } from '../../shared/types.ts';
import { ExamPage } from './ExamPage.tsx';
import { DEMO_RECORDS, RECORDS_LABEL } from '../../server/records.ts';
const room = vi.hoisted(() => ({ state: null as RoomState | null, connected: true }));
vi.mock('../lib/useRoomState.ts', () => ({ useRoomState: () => room }));
vi.mock('./useExamRecognition.ts', () => ({ useExamRecognition: () => ({ status: 'Camera off', replay: false }) }));
const visit = (id: string): Visit => ({ id, name: id, queueNo: 1, createdAt: Date.now() - 120000, status: 'called', calledAt: Date.now(), room: '1', faceEnrolled: true, summary: null, answers: { dateOfBirth: '1994-06-15', reason: `${id}'s words`, reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' } });
const empty = (): RoomState => ({ serverNow: Date.now(), visits: [], vitals: {}, alerts: [], cameras: {}, nowCalling: null, handoffs: {}, references: [], providers: { gemini: false, elevenlabs: false, agent: false } });
let root: Root | undefined; let node: HTMLDivElement;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; vi.unstubAllGlobals(); room.state = null; room.connected = true; });
function setup() { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); node = document.createElement('div'); root = createRoot(node); history.replaceState(null, '', '/exam?room=1'); }
async function render() { await act(async () => { root!.render(<ExamPage />); }); }
describe('exam room page', () => {
  it('waits when idle and preloads only a patient called to this room', async () => {
    setup(); room.state = empty(); vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ label: RECORDS_LABEL, visitId: 'Ama', record: DEMO_RECORDS[0] }) })));
    await render(); expect(node.textContent).toContain('Room 1 · waiting for patient');
    room.state.visits.push(visit('Ama'), { ...visit('Ben'), room: '2' });
    await render(); expect(node.textContent).toContain('Ama is on the way'); expect(node.textContent).toContain('Penicillin'); expect(node.textContent).not.toContain("Ben's words");
  });
  it('does not leak an old chart when the visit changes while a record lookup is pending', async () => {
    setup(); room.state = { ...empty(), visits: [visit('Ama')] };
    let finish!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve; })));
    await render(); const finishAma = finish;
    room.state.visits = [visit('Ben')]; await render();
    await act(async () => { finishAma({ ok: true, json: async () => ({ label: RECORDS_LABEL, visitId: 'Ama', record: DEMO_RECORDS[0] }) }); });
    expect(node.textContent).not.toContain('Penicillin'); expect(node.textContent).toContain("Ben's words");
    room.state.visits = []; await render(); expect(node.textContent).not.toContain("Ben's words");
  });
  it('opens a newly called chart even if staff had manually selected an older chart', async () => {
    setup(); const old = { ...visit('Old'), room: 'one', calledAt: 1000 };
    room.state = { ...empty(), visits: [old] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => ({ visitId: new URL(url, 'http://localhost').searchParams.get('visitId'), record: null }) })));
    await render();
    const select = node.querySelector('select')!;
    await act(() => { select.value = old.id; select.dispatchEvent(new Event('change', { bubbles: true })); });
    room.state.visits.push({ ...visit('Anna'), room: 'Room one', calledAt: 2000 });
    await render();
    expect(node.querySelector('h1')?.textContent).toBe('Anna');
    expect(node.textContent).toContain('#1 · Anna — Room 1');
    expect(node.textContent).not.toContain("Old's words");
  });
  it('marks disconnected information and prevents voice lookup and arrival recognition', async () => {
    setup(); room.state = { ...empty(), visits: [visit('Ama')] }; room.connected = false;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ visitId: 'Ama', record: null }) })));
    await render(); expect(node.textContent).toContain('Disconnected');
    const voice = [...node.querySelectorAll('button')].find(button => button.textContent?.includes('Hey Crisp'));
    expect(voice?.disabled).toBe(true);
  });
  it('clears allergy read-back when a different patient is called to the room', async () => {
    setup(); room.state = { ...empty(), visits: [visit('Ama')] };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ label: RECORDS_LABEL, visitId: 'Ama', record: DEMO_RECORDS[0], allergyText: 'Penicillin' }) })));
    await render();
    await act(async () => { [...node.querySelectorAll('button')].find(button => button.textContent === 'Read recorded allergies')!.click(); });
    expect(node.textContent).toContain('Penicillin');
    room.state.visits = [visit('Ben')]; await render();
    expect(node.textContent).not.toContain('Penicillin');
  });
});
