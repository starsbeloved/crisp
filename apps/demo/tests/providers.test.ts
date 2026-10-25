import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert, CheckInAnswers, RoomState, Visit, Vitals } from '../shared/types.ts';

// Replace only the external SDK call and configuration boundary; exercise real adapters.
const transport = vi.hoisted(() => ({ generate: vi.fn(), config: {} as Record<string, string> }));
vi.mock('@google/genai', async importOriginal => ({ ...await importOriginal<typeof import('@google/genai')>(), GoogleGenAI: class {
  models = { generateContent: transport.generate };
} }));
vi.mock('../server/env.ts', () => ({ providerVariables: () => transport.config }));

const answers: CheckInAnswers = { reason: 'Chest feels tight', reasonChips: ['chest pain'], onset: 'today', trend: 'worse', followUp: null, via: 'form' };
const visit: Visit = { id: 'visit-a', queueNo: 3, name: 'Ama', createdAt: 1_000, faceEnrolled: true, answers, summary: null, status: 'waiting', calledAt: null, room: null };
const alert: Alert = {
  id: 'alert-a', visitId: visit.id, level: 'red', reasons: ['Head down for 5 seconds'],
  facts: { name: 'Ama', queueNo: 3, chiefComplaint: 'chest pain', answers, hrBpm: 118, baselineHr: 82, rrBpm: null, baselineRr: null, hrReason: 'baseline-delta', rrReason: null, postureEvents: [{ kind: 'headDrop', seconds: 5 }], waitedMin: 4 },
  openedAt: 1_000, updatedAt: 1_000, status: 'open', acknowledgedAt: null, checkedAt: null, explanation: null, audio: null, replayFrames: 0, cameraId: 'A',
};
const validExplanation = { bubble: 'Ama reported chest tightness. Camera estimate: heart rate 82 to 118; head down for 5 seconds. Please check on Ama.', speech: 'Ama, number 3, may need a check. Head down for 5 seconds.' };
async function providers() { return import('../server/providers/index.ts'); }
function reply(value: unknown) { transport.generate.mockResolvedValue({ text: JSON.stringify(value) }); }
function state(): RoomState {
  return { serverNow: 241_000, visits: [structuredClone(visit)], vitals: {}, alerts: [structuredClone(alert)], cameras: {}, nowCalling: null, handoffs: {}, references: [], providers: { gemini: true, elevenlabs: false, agent: false } };
}

beforeEach(() => {
  vi.resetModules(); vi.useRealTimers(); transport.generate.mockReset();
  transport.config = { GEMINI_API_KEY: 'fake-test-key', GEMINI_MODEL: 'gemini-test-flash' };
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('P6 grounded Gemini jobs', () => {
  it('accepts a grounded alert and requests structured JSON from the configured model', async () => {
    reply(validExplanation);
    expect(await (await providers()).explainAlert(alert)).toEqual({ ...validExplanation, source: 'gemini' });
    expect(transport.generate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-test-flash', config: expect.objectContaining({ responseMimeType: 'application/json', responseSchema: expect.any(Object) }) }));
  });

  it.each([
    { ...validExplanation, bubble: 'Ama has a camera estimate of 999 bpm.' },
    { ...validExplanation, speech: 'Ama may have a heart attack.' },
    { ...validExplanation, speech: 'Ama may need emergency help.' },
    { ...validExplanation, bubble: 'Someone may need a check.' },
    { ...validExplanation, bubble: `Ama ${'resting '.repeat(46)}` },
    { ...validExplanation, speech: 'Ama may need a check: one hundred and fifty bpm.' },
  ])('falls back on unsupported numbers, diagnoses, missing names or excessive length: %j', async output => {
    reply(output);
    expect(await (await providers()).explainAlert(alert)).toMatchObject({ source: 'template', bubble: expect.stringContaining('Ama'), speech: expect.stringContaining('may need a check') });
  });

  it('summarizes without changing original answers and rejects unknown complaint categories', async () => {
    const original = structuredClone(visit);
    reply({ chiefComplaint: 'chest pain', summary: 'Ama reports chest tightness today, getting worse.' });
    expect(await (await providers()).summarize(visit)).toEqual({ chiefComplaint: 'chest pain', text: 'Ama reports chest tightness today, getting worse.', source: 'gemini' });
    expect(visit).toEqual(original);
    reply({ chiefComplaint: 'myocardial infarction', summary: 'Ama reports chest tightness.' });
    expect(await (await providers()).summarize({ ...visit, id: 'other' })).toMatchObject({ chiefComplaint: 'chest pain', source: 'template' });
  });

  it('returns a per-complaint follow-up with no key and omits snapshot vision', async () => {
    transport.config = {};
    const p = await providers();
    expect(await p.followUpQuestion(answers)).toMatchObject({ question: expect.stringMatching(/arm|jaw|back/i), source: 'template' });
    expect(await p.describeSnapshot(alert, new Uint8Array([255, 216]))).toBeNull();
    expect(transport.generate).not.toHaveBeenCalled();
  });

  it('validates follow-up questions and rejects advice', async () => {
    const p = await providers();
    reply({ question: 'Does the tightness spread to your arm, jaw, or back?' });
    expect(await p.followUpQuestion(answers)).toMatchObject({ source: 'gemini' });
    reply({ question: 'You should take medicine now?' });
    expect(await p.followUpQuestion({ ...answers, trend: 'same' })).toMatchObject({ source: 'template' });
  });

  it('coalesces simultaneous identical calls and caches the result', async () => {
    reply(validExplanation);
    const p = await providers();
    const results = await Promise.all([p.explainAlert(alert), p.explainAlert(structuredClone(alert))]);
    expect(results[0]).toMatchObject({ source: 'gemini' });
    expect(results[1]).toEqual(results[0]);
    expect(await p.explainAlert(alert)).toEqual(results[0]);
    expect(transport.generate).toHaveBeenCalledTimes(1);
    await p.explainAlert({ ...alert, level: 'amber' });
    expect(transport.generate).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 429 and caches the template fallback', async () => {
    transport.generate.mockRejectedValue({ status: 429 });
    const p = await providers();
    expect(await p.explainAlert(alert)).toMatchObject({ source: 'template' });
    await p.explainAlert(alert);
    expect(transport.generate).toHaveBeenCalledTimes(1);
  });

  it('retries a 503 once, then accepts the valid result', async () => {
    transport.generate.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({ text: JSON.stringify(validExplanation) });
    expect(await (await providers()).explainAlert(alert)).toMatchObject({ source: 'gemini' });
    expect(transport.generate).toHaveBeenCalledTimes(2);
  });

  it('bounds a hung transport to five seconds including the one retry', async () => {
    vi.useFakeTimers();
    transport.generate.mockImplementation(() => new Promise(() => {}));
    const work = (await providers()).explainAlert(alert);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await work).toMatchObject({ source: 'template' });
    expect(transport.generate).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry malformed JSON and never logs patient text or transport errors', async () => {
    transport.generate.mockResolvedValue({ text: 'not JSON' });
    expect(await (await providers()).explainAlert(alert)).toMatchObject({ source: 'template' });
    expect(transport.generate).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(expect.stringMatching(/^provider explainAlert fallback \d+$/));
  });

  it('grounds a handoff in one patient and preserves unavailable camera readings', async () => {
    reply({ text: 'Situation: Ama may need a check. Background: chest tightness today. Assessment: camera heart rate 118; breathing unavailable. Request: please check on Ama.' });
    const p = await providers();
    const note = await p.handoffNote(visit, undefined, [alert, { ...alert, visitId: 'unrelated', facts: { ...alert.facts, name: 'Other patient' } }]);
    expect(note).toMatchObject({ visitId: visit.id, source: 'gemini' });
    expect(JSON.stringify(transport.generate.mock.calls[0])).not.toContain('Other patient');
    transport.config = {};
    const fallback = await p.handoffNote({ ...visit, id: 'new' }, undefined, []);
    expect(fallback).toMatchObject({ source: 'template', text: expect.stringContaining('unavailable') });
  });

  it('strips descriptors and pulse data from Ask and reuses unchanged room facts', async () => {
    const room = state();
    const extra = room as RoomState & { descriptors: number[] };
    extra.descriptors = [0.123456789];
    reply({ answer: 'Ama reported chest tightness. Head down for 5 seconds. Please check on Ama.' });
    const p = await providers();
    expect(await p.ask('What happened with Ama?', extra)).toMatchObject({ source: 'gemini' });
    expect(JSON.stringify(transport.generate.mock.calls[0])).not.toContain('descriptor');
    room.serverNow += 100;
    expect(await p.ask('What happened with Ama?', room)).toMatchObject({ source: 'gemini' });
    expect(transport.generate).toHaveBeenCalledTimes(1);
  });

  it('lists only the named patient in the Ask fallback', async () => {
    transport.config = {};
    const room = state(); room.visits.push({ ...visit, id: 'visit-b', name: 'Ben', answers: { ...answers, reason: 'Headache' } });
    const result = await (await providers()).ask('What happened with Ama?', room);
    expect(result.source).toBe('template'); expect(result.answer).toContain('Ama'); expect(result.answer).toContain('5'); expect(result.answer).not.toContain('Ben');
  });
});
