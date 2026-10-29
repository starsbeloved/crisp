import type { RoomState, Visit } from '../shared/types.ts';

function patientWords(visit: Visit): string {
  const answer = visit.answers.reason.trim() || visit.answers.reasonChips.join(', ') || 'No complaint recorded';
  const followUp = visit.answers.followUp ? ` Follow-up: ${visit.answers.followUp.question} ${visit.answers.followUp.answer || 'No answer recorded'}.` : '';
  return `${answer}.${followUp}`;
}

function roomEvents(visit: Visit, state: RoomState): string {
  const alerts = state.alerts.filter(alert => alert.visitId === visit.id);
  if (!alerts.length) return 'No request recorded.';
  return alerts.map(alert => `${alert.level} request: ${alert.reasons.join('; ') || 'recorded camera observations'}; staff status ${alert.status}`).join(' | ');
}

export function doctorBriefPrompt(visit: Visit, state: RoomState): string {
  return [
    `Write exactly three short lines for the clinician before seeing ${visit.name}.`,
    'Use only the recorded facts below. Repeat the patient’s words without interpreting them.',
    `Today’s words: ${patientWords(visit)}`,
    `Waiting-room timeline: ${roomEvents(visit, state)}`,
    'Line 3 must say: Suggested next step: a human check. Do not diagnose, rank urgency, or give treatment advice.',
  ].join('\n');
}

export function doctorBriefTemplate(visit: Visit, state: RoomState): string {
  return [
    `Today: ${patientWords(visit)}`,
    `Waiting room: ${roomEvents(visit, state)}`,
    'Suggested next step: a human check',
  ].join('\n');
}
