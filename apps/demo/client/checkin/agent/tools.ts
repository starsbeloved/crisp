import type { CheckInAnswers, Onset, Trend } from '../../../shared/types.ts';
import type { CheckInController } from '../controller-types.ts';

const FALLBACK_QUESTION = 'Is there anything else you would like the nurse to know?';
function onsetChip(value: string): Onset | null {
  const text = value.trim().toLowerCase();
  if (['<1h', 'less than an hour', 'under an hour', 'just now', 'within the last hour'].includes(text)) return '<1h';
  if (['today', 'this morning', 'since this morning', 'this afternoon', 'tonight'].includes(text)) return 'today';
  if (['1-3d', 'yesterday', 'since yesterday', 'two days', 'three days', '2 days', '3 days'].includes(text)) return '1-3d';
  if (['longer', 'a week', 'weeks', 'months', 'more than three days'].includes(text)) return 'longer';
  return null;
}
function trendChip(value: string): Trend | null {
  const text = value.trim().toLowerCase();
  if (['worse', 'getting worse', 'worsening'].includes(text)) return 'worse';
  if (['same', 'staying the same', 'unchanged', 'no change'].includes(text)) return 'same';
  if (['better', 'getting better', 'improving'].includes(text)) return 'better';
  return null;
}

/** Read the current controller on every call; the form and agent share the same values. */
export function createCheckInTools(getController: () => CheckInController, fetcher: typeof fetch = fetch) {
  let scanFailures = 0;
  let completed: string | null = null;
  let finishing: Promise<string> | null = null;
  function controller() { const c = getController(); c.setVia('voice'); return c; }
  return {
    async set_name(p: { name: string }) {
      const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 120) : '';
      if (!name) return 'Please ask for a name.';
      const c = controller(); c.setName(name); c.goTo('name'); return `name saved: ${name}`;
    },
    async start_face_scan() {
      const c = controller(); c.goTo('face');
      try {
        const result = await c.startFaceScan();
        if (result.ok) { scanFailures = 0; return 'saved'; }
        scanFailures += 1;
        if (scanFailures >= 2) c.skipFace();
        return result.reason || 'Face scan unavailable. Please use the form to skip.';
      } catch { return 'Face scan unavailable. Please use the form to skip.'; }
    },
    async save_answers(p: { reason: string; onset?: string; trend?: string }) {
      if (typeof p?.reason !== 'string' || !p.reason.trim()) return 'Please ask what brings the patient in.';
      const patch: Partial<CheckInAnswers> = { reason: p.reason.trim().slice(0, 4000), via: 'voice' };
      if (p.onset !== undefined) patch.onset = typeof p.onset === 'string' ? onsetChip(p.onset) : null;
      if (p.trend !== undefined) patch.trend = typeof p.trend === 'string' ? trendChip(p.trend) : null;
      const c = controller(); c.setAnswers(patch); c.goTo('questions');
      return 'answers saved';
    },
    async get_follow_up_question() {
      const c = controller(); c.goTo('followup');
      try {
        const response = await fetcher('/api/checkin/follow-up', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ answers: { ...c.answers, via: 'voice' } }), signal: AbortSignal.timeout(6500),
        });
        if (!response.ok) return FALLBACK_QUESTION;
        const data = await response.json();
        return typeof data.question === 'string' && data.question.trim() ? data.question : FALLBACK_QUESTION;
      } catch { return FALLBACK_QUESTION; }
    },
    async save_follow_up(p: { question: string; answer: string }) {
      if (typeof p?.question !== 'string' || typeof p.answer !== 'string' || !p.question.trim() || !p.answer.trim()) return 'Please ask and record the follow-up answer.';
      controller().setFollowUp(p.question.trim().slice(0, 4000), p.answer.trim().slice(0, 4000));
      return 'follow-up saved';
    },
    async finish_check_in(): Promise<string> {
      if (completed) return completed;
      if (finishing) return finishing;
      const c = controller();
      if (!c.name.trim()) return 'Please ask for a name before finishing.';
      if (!c.answers.reason.trim()) return 'Please ask what brings the patient in before finishing.';
      finishing = c.finish().then(result => { completed = `queue number ${result.queueNo}`; return completed; })
        .catch(() => 'Check-in could not be saved. Please try again or use the form.')
        .finally(() => { finishing = null; });
      return finishing;
    },
  };
}
