import type { CheckInAnswers, ProviderSource } from '../../shared/types.ts';
import { complaintQuestion, specificQuestion } from './followup-policy.ts';

export interface FollowUpPrompt { question: string; source: ProviderSource; why: string }
export const fallbackQuestion = 'What are you feeling that brought you in today?';

export async function loadFollowUp(answers: CheckInAnswers, fetcher: typeof fetch = fetch): Promise<FollowUpPrompt> {
  const reason = answers.reason.trim() || answers.reasonChips.join(', ');
  const why = reason ? `Because you mentioned “${reason}”.` : 'To understand what brought you in today.';
  const fallback: FollowUpPrompt = { question: complaintQuestion(answers), source: 'template', why };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 6500);
  try {
    const response = await fetcher('/api/checkin/follow-up', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers }), signal: abort.signal,
    });
    if (!response.ok) return fallback;
    const data = await response.json();
    if (typeof data?.question !== 'string' || !specificQuestion(data.question.trim(), answers) || !['gemini', 'template'].includes(data.source)) return fallback;
    return { question: data.question.trim(), source: data.source, why };
  } catch { return fallback; }
  finally { clearTimeout(timer); }
}
