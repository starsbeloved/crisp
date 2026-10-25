import type { CheckInAnswers, Onset, Trend } from '../../../shared/types.ts';
import type { CheckInController } from '../controller-types.ts';
import { detailsError, normalizeSpokenDate } from '../details.ts';
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
  let requested: { key: string; prompt: FollowUpPrompt; answered: boolean } | null = null;
  let followUpCount = 0;
  const complaintKey = (c: CheckInController) => JSON.stringify([c.answers.reason, c.answers.reasonChips, c.answers.onset, c.answers.trend]);
  function controller() { const c = getController(); c.setVia('voice'); return c; }
  const tools = {
    async set_name(p: { name: string }) {
      const name = typeof p?.name === 'string' ? p.name.trim().slice(0, 120) : '';
      if (!name) return 'Please ask for a name.';
      const c = controller(); c.setName(name); c.goTo('name'); return `name saved: ${name}. Ask: What's your date of birth? Then: And a phone number we can reach you on? Save with set_patient_details using the date as spoken; null if declined.`;
    },
    async set_patient_details(p: { dateOfBirth?: string | null; phone?: string | null }) {
      if (!p || (p.dateOfBirth !== undefined && p.dateOfBirth !== null && typeof p.dateOfBirth !== 'string') || (p.phone !== undefined && p.phone !== null && typeof p.phone !== 'string')) return 'Please confirm the date of birth and phone number.';
      const c = controller();
      const patch: Partial<CheckInAnswers> = {};
      if (p.dateOfBirth !== undefined) {
        const spoken = p.dateOfBirth?.trim();
        patch.dateOfBirth = spoken ? normalizeSpokenDate(spoken) : null;
        if (spoken && !patch.dateOfBirth) return 'Please say your date of birth with the month name, for example June fifteenth, 1994, or skip it. Next: confirm the date of birth or save null if declined.';
      }
      if (p.phone !== undefined) patch.phone = p.phone?.trim() || null;
      const error = detailsError({ ...c.answers, ...patch });
      if (error) return error.includes('phone') ? 'Please repeat your phone number one digit at a time, or skip it. Next: confirm the phone number or save null if declined.' : 'Please repeat your date of birth with the month name, or skip it. Next: confirm the date of birth or save null if declined.';
      c.setAnswers(patch);
      return 'patient details saved. Next: ask permission for the face scan and call start_face_scan, or use Continue to skip.';
    },
    async start_face_scan() {
      const c = controller(); c.goTo('face');
      try {
        const result = await c.startFaceScan();
        if (result.ok) { scanFailures = 0; return "saved. Tell the patient: Hold still for a moment — I’m checking your pulse. Then hold still for a short pulse check. Wait for the on-screen pulse step to finish or be skipped before asking what brings them in."; }
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
      return 'answers saved in the patient’s words. Call get_follow_up_question for one specific follow-up.';
    },
    async get_follow_up_question() {
      const c = controller();
      if (!c.answers.reason.trim() && !c.answers.reasonChips.length) return 'Next: ask what brings them in and call save_answers first.';
      if (requested?.key === complaintKey(c) && requested.answered) return 'The follow-up is saved. Next: wrap up and call finish_check_in.';
      c.goTo('followup');
      const key = complaintKey(c);
      if (requested?.key === key) { c.setFollowUpPrompt(requested.prompt); return requested.prompt.question; }
      if (followUpCount >= 2) return 'Follow-up limit reached. Next: wrap up and call finish_check_in.';
      const prompt = await loadFollowUp({ ...c.answers, via: 'voice' }, fetcher);
      if (key !== complaintKey(getController())) return 'Answers changed. Next: call get_follow_up_question again.';
      followUpCount += 1;
      requested = { key, prompt, answered: false };
      c.setFollowUpPrompt(prompt);
      return prompt.question;
    },
    async save_follow_up(p: { question: string; answer: string }) {
      if (typeof p?.question !== 'string' || typeof p.answer !== 'string' || !p.question.trim() || !p.answer.trim()) return 'Please ask and record the follow-up answer.';
      const c = controller();
      if (!requested || requested.key !== complaintKey(c)) return 'Call get_follow_up_question before saving a follow-up.';
      if (p.question.trim() !== requested.prompt.question) return 'Please ask the returned question from get_follow_up_question and save that exact question.';
      c.setFollowUp(requested.prompt.question, p.answer.trim().slice(0, 4000));
      requested.answered = true;
      return 'follow-up saved';
    },
    async finish_check_in(): Promise<string> {
      if (completed) return completed;
      if (finishing) return finishing;
      const c = controller();
      if (!c.name.trim()) return 'Please ask for a name before finishing.';
      if (!c.answers.reason.trim()) return 'Please ask what brings the patient in before finishing.';
      if (followUpCount < 2 && (!requested || requested.key !== complaintKey(c))) return 'Call get_follow_up_question, ask its returned question, then save_follow_up (or skip if the patient declines) before finishing.';
      finishing = c.finish().then(result => { completed = `Queue number ${result.queueNo}. Please take a seat — Crisp will call you.`; return completed; })
        .catch(() => 'Check-in could not be saved. Please try again or use the form.')
        .finally(() => { finishing = null; });
      return finishing;
    },
  };
  const next = {
    set_name: 'ask date of birth and phone, then call set_patient_details; use null for declined details.',
    set_patient_details: 'confirm the date of birth and phone, or save null for declined details.',
    start_face_scan: 'if saved, wait for the on-screen pulse check to finish or be skipped, then ask what brings them in. If scanning failed, use Continue to skip.',
    save_answers: 'call get_follow_up_question for one natural follow-up; do not ask a list of required questions.',
    get_follow_up_question: 'ask the returned question, then call save_follow_up; if declined, call finish_check_in.',
    save_follow_up: 'call finish_check_in.',
    finish_check_in: 'if a queue number was returned, take a seat; otherwise follow the instruction above and retry, or use Continue.',
  };
  return Object.fromEntries(Object.entries(tools).map(([name, tool]) => [name, async (...args: unknown[]) => {
    const message = await (tool as (...args: unknown[]) => Promise<string>)(...args);
    return message.includes('Next:') ? message : `${message} Next: ${next[name as keyof typeof next]}`;
  }])) as typeof tools;
}
