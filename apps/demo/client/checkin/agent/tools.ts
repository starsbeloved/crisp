import type { CheckInAnswers, Onset, Trend } from '../../../shared/types.ts';
import type { CheckInController } from '../controller-types.ts';
import { detailsError } from '../details.ts';
import { loadFollowUp, type FollowUpPrompt } from '../followup.ts';

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
  let requested: { key: string; prompt: FollowUpPrompt } | null = null;
  const complaintKey = (c: CheckInController) => JSON.stringify([c.answers.reason, c.answers.reasonChips, c.answers.onset, c.answers.trend]);
  function controller() { const c = getController(); c.setVia('voice'); return c; }
  return {
    async set_name(p: { name: string }) {
      const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 120) : '';
      if (!name) return 'Please ask for a name.';
      const c = controller(); c.setName(name); c.goTo('name'); return `name saved: ${name}. Ask: What's your date of birth? Then: And a phone number we can reach you on? Save with set_patient_details (YYYY-MM-DD; null if declined).`;
    },
    async set_patient_details(p: { dateOfBirth?: string | null; phone?: string | null }) {
      if (!p || (p.dateOfBirth !== undefined && p.dateOfBirth !== null && typeof p.dateOfBirth !== 'string') || (p.phone !== undefined && p.phone !== null && typeof p.phone !== 'string')) return 'Please confirm the date of birth and phone number.';
      const c = controller();
      const patch: Partial<CheckInAnswers> = {};
      if (p.dateOfBirth !== undefined) patch.dateOfBirth = p.dateOfBirth?.trim() || null;
      if (p.phone !== undefined) patch.phone = p.phone?.trim() || null;
      const error = detailsError({ ...c.answers, ...patch });
      if (error) return error;
      c.setAnswers(patch);
      return 'patient details saved. Next, ask permission for the face scan.';
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
      return 'answers saved. Once all three answers are confirmed, call get_follow_up_question and ask its returned question.';
    },
    async get_follow_up_question() {
      const c = controller(); c.goTo('followup');
      if ((!c.answers.reason.trim() && !c.answers.reasonChips.length) || !c.answers.onset || !c.answers.trend) return 'Please ask all three questions and call save_answers before get_follow_up_question.';
      const key = complaintKey(c);
      if (requested?.key === key) { c.setFollowUpPrompt(requested.prompt); return requested.prompt.question; }
      const prompt = await loadFollowUp({ ...c.answers, via: 'voice' }, fetcher);
      if (key !== complaintKey(getController())) return 'Answers changed. Call get_follow_up_question again.';
      requested = { key, prompt };
      c.setFollowUpPrompt(prompt);
      return prompt.question;
    },
    async save_follow_up(p: { question: string; answer: string }) {
      if (typeof p?.question !== 'string' || typeof p.answer !== 'string' || !p.question.trim() || !p.answer.trim()) return 'Please ask and record the follow-up answer.';
      const c = controller();
      if (!requested || requested.key !== complaintKey(c)) return 'Call get_follow_up_question before saving a follow-up.';
      if (p.question.trim() !== requested.prompt.question) return 'Please ask the returned question from get_follow_up_question and save that exact question.';
      c.setFollowUp(requested.prompt.question, p.answer.trim().slice(0, 4000));
      return 'follow-up saved';
    },
    async finish_check_in(): Promise<string> {
      if (completed) return completed;
      if (finishing) return finishing;
      const c = controller();
      if (!c.name.trim()) return 'Please ask for a name before finishing.';
      if (!c.answers.reason.trim()) return 'Please ask what brings the patient in before finishing.';
      if (!requested || requested.key !== complaintKey(c)) return 'Call get_follow_up_question, ask its returned question, then save_follow_up (or skip if the patient declines) before finishing.';
      finishing = c.finish().then(result => { completed = `queue number ${result.queueNo}`; return completed; })
        .catch(() => 'Check-in could not be saved. Please try again or use the form.')
        .finally(() => { finishing = null; });
      return finishing;
    },
  };
}
