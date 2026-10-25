import { describe, expect, it } from 'vitest';
import type { RoomState, Visit } from '../shared/types.ts';
import { doctorBriefPrompt, doctorBriefTemplate } from './briefs.ts';

const visit: Visit = {
  id: 'ama', queueNo: 2, name: 'Ama Jones', createdAt: 1_000, faceEnrolled: false,
  answers: { reason: 'My chest feels tight', reasonChips: [], onset: 'today', trend: 'worse', followUp: { question: 'When did it start?', answer: 'This morning' }, via: 'form' },
  summary: null, status: 'called', calledAt: 2_000, room: '1',
};
const state: RoomState = {
  serverNow: 3_000, visits: [visit], vitals: {}, alerts: [{
    id: 'alert-1', visitId: 'ama', level: 'red', reasons: ['Fall-like movement detected'], facts: {
      name: visit.name, queueNo: visit.queueNo, chiefComplaint: 'chest pain', answers: visit.answers,
      hrBpm: null, baselineHr: null, rrBpm: null, baselineRr: null, hrReason: null, rrReason: null,
      postureEvents: [{ kind: 'fall', seconds: 0 }], waitedMin: 0,
    }, openedAt: 2_500, updatedAt: 2_500, status: 'open', acknowledgedAt: null, checkedAt: null,
    explanation: null, audio: null, replayFrames: 0, cameraId: 'A',
  }], cameras: {}, nowCalling: null, handoffs: {}, references: [], providers: { gemini: true, elevenlabs: false, agent: false },
};

describe('doctor brief facts', () => {
  it('builds a grounded prompt from today’s words and recorded room events', () => {
    const prompt = doctorBriefPrompt(visit, state);
    expect(prompt).toContain('Ama Jones');
    expect(prompt).toContain('My chest feels tight');
    expect(prompt).toContain('Fall-like movement detected');
    expect(prompt.toLowerCase()).not.toContain('diagnosis');
  });

  it('provides a three-line template that keeps the human-check wording', () => {
    const brief = doctorBriefTemplate(visit, state);
    expect(brief.split('\n')).toHaveLength(3);
    expect(brief).toContain('My chest feels tight');
    expect(brief).toContain('Suggested next step: a human check');
  });
});
