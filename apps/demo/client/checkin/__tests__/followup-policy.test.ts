import { expect, it } from 'vitest';
import type { CheckInAnswers } from '../../../shared/types.ts';
import { complaintQuestion, specificQuestion } from '../followup-policy.ts';
const answers = (reason: string): CheckInAnswers => ({ reason, reasonChips: [], onset: null, trend: null, followUp: null, via: 'form' });
it.each([
  ['chest pain', /chest|arm|jaw/], ['trouble breathing', /breathe|breathing/],
  ['dizziness or fainting', /dizziness|faint/], ['headache', /headache/], ['fever', /temperature/],
  ['stomach pain', /belly/], ['injury', /injury/], ['nausea', /fluids/], ['allergic reaction', /exposed/],
])('uses a specific fallback for the %s chip', (chip, expected) => {
  const a = { ...answers(''), reasonChips: [chip] };
  expect(complaintQuestion(a)).toMatch(expected);
  expect(specificQuestion(complaintQuestion(a), a)).toBe(true);
});
it('does not turn nausea into abdominal pain or pressure into chest discomfort', () => {
  expect(complaintQuestion(answers('I feel sick to my stomach'))).toMatch(/fluids/);
  expect(complaintQuestion(answers('There is pressure in my ears'))).not.toMatch(/chest|arm|jaw/);
});
it('quotes an unfamiliar complaint and avoids repeating a known headache onset', () => {
  const a = answers('My ears keep ringing');
  expect(complaintQuestion(a)).toContain('My ears keep ringing');
  expect(specificQuestion(complaintQuestion(a), a)).toBe(true);
  expect(complaintQuestion({ ...answers('Headache'), onset: 'today' })).toMatch(/Where.*head/);
});
