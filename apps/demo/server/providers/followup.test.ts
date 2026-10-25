import { afterEach, expect, it, vi } from 'vitest';
import type { CheckInAnswers } from '../../shared/types.ts';
import { followUpQuestion } from './index.ts';

const sdk = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@google/genai', async original => ({ ...await original<typeof import('@google/genai')>(), GoogleGenAI: class { models = { generateContent: sdk.generate }; } }));
vi.mock('./config.ts', () => ({ providerConfig: () => ({ GEMINI_API_KEY: 'synthetic-test-key' }) }));
afterEach(() => vi.clearAllMocks());
const answers: CheckInAnswers = { reason: 'My ankle hurts after I twisted it', reasonChips: [], onset: null, trend: null, followUp: null, via: 'voice' };

it.each(['Is there anything else the nurse would like to know?', 'How are you feeling?', 'What other symptoms do you have?', 'Where is your headache?', 'Where does it hurt? When did it start?'])('rejects generic, unrelated or multiple questions: %s', async question => {
  sdk.generate.mockResolvedValue({ text: JSON.stringify({ question }) });
  const result = await followUpQuestion({ ...answers, reason: `${answers.reason} (${question.length})` });
  expect(result.source).toBe('template');
  expect(result.question).toMatch(/ankle|injury|weight/i);
});

it('accepts a specific question with few-shot examples supplied to Gemini', async () => {
  sdk.generate.mockResolvedValue({ text: JSON.stringify({ question: 'Can you put weight on that ankle?' }) });
  expect(await followUpQuestion({ ...answers, reason: 'I twisted my ankle stepping off a curb' })).toEqual({ question: 'Can you put weight on that ankle?', source: 'gemini' });
  expect(JSON.parse(sdk.generate.mock.calls[0][0].contents).task).toMatch(/pressure|sharp/);
});
