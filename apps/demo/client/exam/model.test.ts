import { describe, expect, it } from 'vitest';
import type { DetectedFace } from '../lib/face.ts';
import type { Visit } from '../../shared/types.ts';
import { ageFromDob, cameraEstimate, examVisits, parseExamCommand, recognizeArrival, resolveExamName } from './model.ts';
const visit = (id: string, extra: Partial<Visit> = {}): Visit => ({ id, name: id, queueNo: 1, createdAt: 1000, status: 'called', calledAt: 2000, room: 'Room 1', faceEnrolled: true, summary: null, answers: { reason: '', reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' }, ...extra });
const face = (descriptor: number[]): DetectedFace => ({ box: { x: 0, y: 0, w: 180, h: 200 }, score: 0.95, descriptor, landmarks: [] });
describe('exam selection and honest presentation', () => {
  it('selects only called patients for this room, newest first', () => {
    const visits = [visit('old'), visit('new', { room: '1', calledAt: 3000 }), visit('other', { room: '2' }), visit('waiting', { status: 'waiting' })];
    expect(examVisits(visits, '1').map(item => item.id)).toEqual(['new', 'old']);
  });
  it('matches names exactly and refuses duplicate names', () => {
    expect(resolveExamName([visit('Ama')], 'Am')).toBeNull();
    expect(resolveExamName([visit('Ama'), visit('Ama')], 'Ama')).toBeNull();
    expect(resolveExamName([visit('Ama')], ' ama ')?.id).toBe('Ama');
  });
  it('calculates calendar age and rejects impossible and future birthdays', () => {
    const now = new Date('2026-06-14T12:00:00Z');
    expect(ageFromDob('1994-06-15', now)).toBe(31);
    expect(ageFromDob('1994-06-14', now)).toBe(32);
    for (const dob of [null, '1994-02-30', '2027-01-01', '2001-02-29', 'not a date']) expect(ageFromDob(dob, now)).toBeNull();
    expect(ageFromDob('2000-02-29', now)).toBe(26);
  });
  it('never displays low-quality, missing, nonfinite or stale camera numbers', () => {
    expect(cameraEstimate(79, 'good', false, 'bpm')).toBe('79 bpm');
    expect(cameraEstimate(199, 'low', false, 'bpm')).toBe('Low signal');
    expect(cameraEstimate(199, 'good', true, 'bpm')).toBe('Not current');
    expect(cameraEstimate(null, 'none', false, 'bpm')).toBe('Not measured');
    expect(cameraEstimate(NaN, 'good', false, 'bpm')).toBe('Not measured');
  });
  it('recognizes only one clear, unambiguous face belonging to a called patient in this room', () => {
    const visits = [visit('Ama'), visit('Ben')];
    const gallery = [{ visitId: 'Ama', name: 'Ama', descriptor: [0, 0] }, { visitId: 'Ben', name: 'Ben', descriptor: [1, 1] }];
    expect(recognizeArrival([face([0.01, 0])], gallery, visits, '1')).toBe('Ama');
    expect(recognizeArrival([face([0, 0]), face([1, 1])], gallery, visits, '1')).toBeNull();
    expect(recognizeArrival([face([0, 0])], gallery, visits, '2')).toBeNull();
    expect(recognizeArrival([face([0.01, 0])], [...gallery, { visitId: 'Ben', name: 'Ben', descriptor: [0.02, 0] }], visits, '1')).toBeNull();
    expect(recognizeArrival([face([9, 9])], gallery, visits, '1')).toBeNull();
    expect(recognizeArrival([{ ...face([0, 0]), score: 0.5 }], gallery, visits, '1')).toBeNull();
  });
  it('requires a wake phrase and parses only retrieval commands', () => {
    expect(parseExamCommand("Hey Crisp, pull up Ama's chart")).toEqual({ kind: 'chart', name: 'Ama' });
    expect(parseExamCommand('Hey Chris pull up Ben’s chart.')).toEqual({ kind: 'chart', name: 'Ben' });
    expect(parseExamCommand('Hey Crispy, any allergies?')).toEqual({ kind: 'allergies' });
    expect(parseExamCommand('any allergies?')).toBeNull();
    expect(parseExamCommand('Hey Crisp, recommend treatment')).toEqual({ kind: 'unsupported' });
  });
});
