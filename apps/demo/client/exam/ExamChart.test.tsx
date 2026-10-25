// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExamChart } from './ExamChart.tsx';
import type { RoomState, Visit } from '../../shared/types.ts';
import { DEMO_RECORDS, RECORDS_LABEL } from '../../server/records.ts';
const visit: Visit = { id: 'ama', name: 'Ama', queueNo: 2, createdAt: 1000, status: 'called', calledAt: 181000, room: '1', faceEnrolled: true, summary: { text: 'Recorded summary', chiefComplaint: 'Tightness', source: 'gemini' }, answers: { dateOfBirth: '1994-06-15', phone: '202-555-0142', reason: 'My chest feels tight', reasonChips: [], onset: 'today', trend: 'worse', followUp: { question: 'When did it start?', answer: 'This morning' }, via: 'form' } };
const state: RoomState = { serverNow: 182000, visits: [visit], vitals: {}, alerts: [], cameras: {}, nowCalling: null, handoffs: {}, references: [], providers: { gemini: false, elevenlabs: false, agent: false } };
describe('read-only exam chart', () => {
  it('shows original answers, labeled generated summary, demographics and fictional history with allergies first', () => {
    const node = document.createElement('div');
    node.innerHTML = renderToStaticMarkup(<ExamChart visit={visit} state={state} record={DEMO_RECORDS[0]} recordStatus="ready" connected />);
    expect(node.textContent).toContain(RECORDS_LABEL);
    expect(node.textContent).toContain('My chest feels tight');
    expect(node.textContent).toContain('This morning');
    expect(node.textContent).toContain('Gemini');
    expect(node.textContent).toContain('202-555-0142');
    expect(node.textContent).toContain('Waited 3 min');
    expect(node.textContent!.indexOf('Penicillin')).toBeLessThan(node.textContent!.indexOf('Cetirizine'));
    expect(node.querySelectorAll('input, textarea').length).toBe(0);
  });
  it('shows no prior record found without inventing history or reusing another visit', () => {
    const html = renderToStaticMarkup(<ExamChart visit={visit} state={state} record={null} recordStatus="ready" connected />);
    expect(html).toContain("I don&#x27;t have earlier records for Ama in this demo system."); expect(html).not.toContain('Penicillin');
  });
  it('labels replay and hides low-quality historical and current values', () => {
    const s: RoomState = { ...state, vitals: { ama: { visitId: 'ama', lastSeenAt: 182000, cameraId: 'A', box: { x: 0, y: 0, w: 1, h: 1 }, hrBpm: 197, rrBpm: 47, hrQuality: 'low', rrQuality: 'low', baselineHr: null, baselineRr: null, posture: null, hint: 'too dark', source: 'replay', pulseTrace: null, level: 'none', history: [{ t: 181000, hr: 197, rr: 47 }] } } };
    s.handoffs.ama = { visitId: 'ama', source: 'template', createdAt: 182000, text: 'Situation: Ama. Assessment: Camera estimates: heart rate 197 (low); breathing 47 (low); replay.' };
    const html = renderToStaticMarkup(<ExamChart visit={visit} state={s} record={null} recordStatus="ready" connected />);
    expect(html).toContain('REPLAY'); expect(html).toContain('Low signal');
    const node = document.createElement('div'); node.innerHTML = html;
    expect(node.textContent).not.toContain('197'); expect(node.textContent).not.toContain('47');
  });
});
