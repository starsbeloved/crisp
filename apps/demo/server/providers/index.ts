import type { Alert, CheckInAnswers, Handoff, ProviderSource, RoomState, Visit, Vitals } from '../../shared/types.ts';

export async function summarize(visit: Visit): Promise<Visit['summary']> {
  return { chiefComplaint: visit.answers.reason || 'Not provided', text: visit.answers.reason || 'No reason given.', source: 'template' };
}

export async function explainAlert(alert: Alert): Promise<Alert['explanation']> {
  const message = `${alert.facts.name} may need a check.`;
  return { bubble: message, speech: message, source: 'template' };
}

export async function speak(_text: string, _voice: 'alert' | 'crisp'): Promise<Uint8Array | null> {
  return null;
}

export async function handoffNote(visit: Visit, _vitals: Vitals | undefined, _alerts: Alert[]): Promise<Handoff> {
  return { visitId: visit.id, text: `${visit.name}: ${visit.answers.reason || 'No reason given.'}`, source: 'template', createdAt: Date.now() };
}

export async function followUpQuestion(_answers: CheckInAnswers): Promise<{ question: string; source: ProviderSource }> {
  return { question: 'Is there anything else you would like the nurse to know?', source: 'template' };
}

/** Opt-in: describe observed posture in one alert frame. Null means unavailable (route answers 501). */
export async function describeSnapshot(_alert: Alert, _jpeg: Uint8Array): Promise<{ description: string; source: ProviderSource } | null> {
  return null;
}

export async function ask(_question: string, _state: RoomState): Promise<{ answer: string; source: ProviderSource }> {
  return { answer: 'Please review the recorded check-in and camera estimates, then check on the person if needed.', source: 'template' };
}
