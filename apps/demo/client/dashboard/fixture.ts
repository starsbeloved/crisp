import type { Alert, RoomState, Visit, Vitals } from '../../shared/types.ts';

export function demoFixture(now = Date.now()): RoomState {
  const visit = (id: string, queueNo: number, name: string, reason: string): Visit => ({ id, queueNo, name, createdAt: now - queueNo * 120_000, faceEnrolled: true,
    answers: { reason, reasonChips: [], onset: 'today', trend: 'worse', followUp: { question: 'Is there anything else you want the nurse to know?', answer: 'It is getting worse.' }, via: 'form' },
    summary: { chiefComplaint: reason, text: reason, source: 'template' }, status: 'waiting', calledAt: null, room: null });
  const visits = [visit('synthetic-bea', 1, 'Bea', 'Headache'), visit('synthetic-ama', 2, 'Ama', 'Chest feels tight')];
  const vitals = (v: Visit, hr: number, rr: number): Vitals => ({ visitId: v.id, lastSeenAt: now, cameraId: 'SYNTHETIC', box: { x: 0, y: 0, w: 1, h: 1 }, hrBpm: hr, hrQuality: 'good', rrBpm: rr, rrQuality: 'fair', baselineHr: 82, baselineRr: 15,
    posture: { slumpSec: v.queueNo === 2 ? 14 : 0, headDropSec: 0, stillSec: 0, fallSuspected: false }, hint: null, source: 'replay', pulseTrace: Array.from({ length: 60 }, (_, i) => Math.sin(i * .8) * .55 + Math.sin(i * 1.6) * .2), level: v.queueNo === 2 ? 'red' : 'none',
    history: Array.from({ length: 91 }, (_, i) => ({ t: now - 90_000 + i * 1000, hr: Math.round(82 + (hr - 82) * i / 90), rr })) });
  const alert: Alert = { id: 'synthetic-alert', visitId: visits[1].id, level: 'red', reasons: ['SYNTHETIC · heart rate change with slumped posture'],
    facts: { name: 'Ama', queueNo: 2, chiefComplaint: 'Chest feels tight', answers: visits[1].answers, hrBpm: 118, baselineHr: 82, rrBpm: 22, baselineRr: 15, hrReason: 'baseline-delta', rrReason: null, postureEvents: [{ kind: 'slump', seconds: 14 }], waitedMin: 4 },
    openedAt: now, updatedAt: now, status: 'open', acknowledgedAt: null, checkedAt: null,
    explanation: { bubble: 'SYNTHETIC · Ama reported chest tightness. Camera estimate: heart rate 82 → 118; slumped forward 14 s. Ama may need a check.', speech: 'Synthetic example. Ama may need a check.', source: 'template' }, audio: 'failed', replayFrames: 75, cameraId: 'SYNTHETIC' };
  return { serverNow: now, visits, vitals: Object.fromEntries(visits.map(v => [v.id, vitals(v, v.queueNo === 2 ? 118 : 84, v.queueNo === 2 ? 22 : 15)])), alerts: [alert], cameras: {}, nowCalling: null, handoffs: {}, references: [], providers: { gemini: false, elevenlabs: false, agent: false } };
}
