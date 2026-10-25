import type { CheckInAnswers, ProviderSource } from '../../shared/types.ts';

export interface FollowUpPrompt { question: string; source: ProviderSource; why: string }
export const fallbackQuestion = 'Is there anything else you would like the nurse to know?';

export async function loadFollowUp(answers: CheckInAnswers, fetcher: typeof fetch = fetch): Promise<FollowUpPrompt> {
  const reason = answers.reason.trim() || answers.reasonChips.join(', ');
  const why = reason ? `Because you mentioned “${reason}”.` : 'To give you space to share anything else with the nurse.';
  const fallback: FollowUpPrompt = { question: fallbackQuestion, source: 'template', why };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 6500);
  try {
    const response = await fetcher('/api/checkin/follow-up', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers }), signal: abort.signal,
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    if (typeof data?.question !== 'string' || !data.question.trim() || !['gemini', 'template'].includes(data.source)) return fallback;
    return { question: data.question.trim(), source: data.source, why };
  } catch { return fallback; }
  finally { clearTimeout(timer); }
}
