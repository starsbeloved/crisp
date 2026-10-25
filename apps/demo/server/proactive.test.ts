import { describe, expect, it, vi } from 'vitest';
import { ProactiveAgent } from './proactive.ts';
import { StaffCommands } from './commands.ts';
import { RoomStore } from './store.ts';
import { demoFixture } from '../client/dashboard/fixture.ts';
const now = 10_000_000;
function setup() {
  const store = new RoomStore(); store.state = demoFixture(now); store.state.alerts = [];
  const commands = new StaffCommands(store, { onCall: vi.fn(async () => {}) });
  const agent = new ProactiveAgent(store, { call: (visit, room) => commands.call(visit, room, now) });
  return { store, agent, commands };
}
describe('proactive rules and human confirmation', () => {
  it('room free proposes FIFO next; nothing calls until Yes; duplicate accepts never call twice', async () => {
    const { store, agent } = setup(); const [bea, ama] = store.state.visits;
    Object.assign(bea, { status: 'called', room: '1', calledAt: now - 5000 });
    expect(agent.patientDone('1', bea.id, now).ok).toBe(true);
    expect(store.state.visits[1].status).toBe('waiting');
    const card = agent.list(now).suggestions.find(s => s.kind === 'room_free')!;
    expect(card.text).toContain('Ama');
    expect((await agent.accept(card.id, now)).ok).toBe(true);
    expect(ama).toMatchObject({ status: 'called', room: '1' });
    expect((await agent.accept(card.id, now)).ok).toBe(false);
    expect(agent.list(now).dispositions[bea.id].status).toBe('done');
    expect(store.state.visits).toContain(bea); // record kept
  });
  it('rejects stale room completion and obsolete suggestions', async () => {
    const { store, agent } = setup(); const [bea, ama] = store.state.visits;
    Object.assign(bea, { status: 'called', room: '1', calledAt: now });
    expect(agent.patientDone('1', 'wrong-visit', now).ok).toBe(false);
    agent.patientDone('1', bea.id, now);
    const card = agent.list(now).suggestions.find(s => s.kind === 'room_free')!;
    Object.assign(bea, { room: '1' });
    expect((await agent.accept(card.id, now)).ok).toBe(false);
    expect(ama.status).toBe('waiting');
  });
  it('long wait reminder requires over 45 min and worsening; Yes does not claim patient checked', async () => {
    const { store, agent } = setup(); const visit = store.state.visits[0];
    visit.createdAt = now - 45 * 60_000;
    expect(agent.list(now).suggestions.some(s => s.kind === 'long_wait')).toBe(false);
    visit.createdAt -= 60_000;
    const card = agent.list(now).suggestions.find(s => s.kind === 'long_wait')!;
    expect(card.text).toContain('46 min');
    expect((await agent.accept(card.id, now)).message).toContain('human check');
    expect(agent.list(now).suggestions.some(s => s.id === card.id)).toBe(false);
    expect(store.state.alerts).toHaveLength(0);
  });
  it('does not remind for stable, checked or called patients', () => {
    const { store, agent } = setup(); const [bea, ama] = store.state.visits;
    bea.createdAt = ama.createdAt = now - 60 * 60_000; bea.answers.trend = 'same';
    agent.noteChecked(ama.id, now);
    expect(agent.list(now).suggestions.some(s => s.kind === 'long_wait')).toBe(false);
  });
  it('missing for 10 min proposes may have left; Yes keeps record, removes waiting and clears room', async () => {
    const { store, agent } = setup(); const visit = store.state.visits[0];
    store.state.vitals[visit.id].lastSeenAt = now - 10 * 60_000;
    const card = agent.list(now).suggestions.find(s => s.kind === 'may_have_left')!;
    expect(card.text).toContain('may have left'); expect(visit.status).toBe('waiting');
    await agent.accept(card.id, now);
    expect(visit).toMatchObject({ status: 'called', room: null, calledAt: null });
    expect(agent.list(now).dispositions[visit.id].status).toBe('left');
    expect(store.state.visits).toContain(visit);
  });
  it('never assumes departure without a recorded sighting and invalidates on reappearance', async () => {
    const { store, agent } = setup(); const visit = store.state.visits[0];
    delete store.state.vitals[visit.id]; visit.createdAt = now - 60 * 60_000;
    expect(agent.list(now).suggestions.some(s => s.kind === 'may_have_left')).toBe(false);
    store.state.vitals[visit.id] = { ...store.state.vitals[store.state.visits[1].id], visitId: visit.id, lastSeenAt: now - 600_000 };
    const card = agent.list(now).suggestions.find(s => s.kind === 'may_have_left')!;
    store.state.vitals[visit.id].lastSeenAt = now;
    expect((await agent.accept(card.id, now)).ok).toBe(false); expect(visit.status).toBe('waiting');
  });
  it('chart ready waits for handoff and is informational; repeated polls do not duplicate it', () => {
    const { store, agent } = setup(); const visit = store.state.visits[0];
    Object.assign(visit, { status: 'called', room: '1', calledAt: now });
    expect(agent.list(now).suggestions.some(s => s.kind === 'chart_ready')).toBe(false);
    store.state.handoffs[visit.id] = { visitId: visit.id, text: 'Recorded words', source: 'template', createdAt: now };
    const cards = agent.list(now).suggestions.filter(s => s.kind === 'chart_ready');
    expect(cards).toHaveLength(1); expect(cards[0].text).toContain('chart is ready in Room 1');
    expect(agent.list(now).suggestions.filter(s => s.kind === 'chart_ready')[0].id).toBe(cards[0].id);
  });
  it('check-back at 30 min only publishes anonymized hallway message after Yes', async () => {
    const { store, agent } = setup(); const visit = store.state.visits[0]; visit.createdAt = now - 30 * 60_000;
    const card = agent.list(now).suggestions.find(s => s.kind === 'check_back')!;
    expect(agent.hallway(now)).toHaveLength(0);
    await agent.accept(card.id, now);
    expect(JSON.stringify(agent.hallway(now))).toContain('#1 · B.');
    expect(JSON.stringify(agent.hallway(now))).not.toContain('Bea');
    expect(JSON.stringify(agent.hallway(now))).not.toContain('Headache');
  });
  it('shift summary is created only on request and labeled with its actual source', async () => {
    const { agent } = setup();
    expect(agent.list(now).suggestions.some(s => s.kind === 'shift_summary')).toBe(false);
    const result = await agent.shiftSummary(async () => ({ answer: '2 waiting; recorded requests only.', source: 'template' }), now);
    expect(result.ok).toBe(true);
    expect(agent.list(now).suggestions.find(s => s.kind === 'shift_summary')).toMatchObject({ source: 'template', text: '2 waiting; recorded requests only.' });
  });
  it('Not now suppresses the same event and reset clears suggestion/disposition state', () => {
    const { store, agent } = setup(); store.state.visits[0].createdAt = now - 60 * 60_000;
    const card = agent.list(now).suggestions.find(s => s.kind === 'long_wait')!;
    expect(agent.dismiss(card.id, now).ok).toBe(true);
    expect(agent.list(now + 1000).suggestions.some(s => s.kind === 'long_wait')).toBe(false);
    store.reset(); expect(agent.list(now).suggestions).toHaveLength(0); expect(agent.list(now).dispositions).toEqual({});
  });
});
