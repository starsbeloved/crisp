import { describe, expect, it, vi } from 'vitest';
import { loadFollowUp } from '../followup.ts';
import type { CheckInAnswers } from '../../../shared/types.ts';
const answers: CheckInAnswers = { reason: 'chest tightness since this morning', reasonChips: [], onset: 'today', trend: 'worse', followUp: null, via: 'form' };

describe('follow-up provenance', () => {
  it('keeps the server question and source and explains the input without interpreting it', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ question: 'When did the tightness start?', source: 'gemini' })));
    const prompt = await loadFollowUp(answers, fetcher);
    expect(prompt).toEqual({ question: 'When did the tightness start?', source: 'gemini', why: 'Because you mentioned “chest tightness since this morning”.' });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ answers });
  });
  it('labels provider templates and offline or malformed responses honestly', async () => {
    for (const response of [new Response('{}', { status: 503 }), new Response('{"question":""}'), new Response('{"question":"Anything else?","source":"unknown"}')]) {
      const prompt = await loadFollowUp(answers, vi.fn().mockResolvedValue(response));
      expect(prompt.source).toBe('template');
      expect(prompt.question).toContain('nurse');
    }
    const offline = await loadFollowUp(answers, vi.fn().mockRejectedValue(new Error('offline')));
    expect(offline.source).toBe('template');
    const template = await loadFollowUp(answers, vi.fn().mockResolvedValue(new Response('{"question":"Where does it hurt?","source":"template"}')));
    expect(template).toMatchObject({ question: 'Where does it hurt?', source: 'template' });
  });
  it('uses selected complaint chips when no free text was supplied', async () => {
    const prompt = await loadFollowUp({ ...answers, reason: '', reasonChips: ['headache'] }, vi.fn().mockRejectedValue(new Error('offline')));
    expect(prompt.why).toBe('Because you mentioned “headache”.');
  });
});
