import type { CheckInAnswers } from '../../shared/types.ts';

// Pure policy shared by the server and kiosk so timeout/malformed replies stay specific too.
const topics = [
  { match: /chest/i, words: /chest|tight|pressure|sharp|arm|jaw|back|hurt|pain/i, question: 'Does the chest discomfort spread to your arm, jaw, or back?' },
  { match: /breath|breathing/i, words: /breath|rest|walk/i, question: 'Is it hard to breathe even when you are resting?' },
  { match: /dizz|faint|lightheaded/i, words: /dizz|faint|lightheaded|stand|spin/i, question: 'Does the dizziness feel like spinning or like you might faint?' },
  { match: /headache|head hurts|head pain/i, words: /head|sudden|gradual/i, question: 'Did the headache start suddenly or build up gradually?', knownOnset: 'Where in your head does the headache hurt most?' },
  { match: /fever|temperature/i, words: /fever|temperature|chill/i, question: 'Have you measured your temperature since the fever started?' },
  { match: /nausea|vomit|sick to my stomach/i, words: /nausea|vomit|fluid|drink|sick/i, question: 'Have you been able to keep fluids down with the nausea?' },
  { match: /stomach|belly|abdom/i, words: /stomach|belly|abdom|hurt|pain/i, question: 'Where in your belly does it hurt most?' },
  { match: /ankle/i, words: /ankle|weight|walk|swell/i, question: 'Can you put weight on that ankle?' },
  { match: /injur|twist|fell|fall|sprain|cut|hurt my/i, words: /injur|happen|hurt|swell|bleed|weight/i, question: 'How did the injury happen?' },
  { match: /tightness|feels? tight/i, words: /tight|pressure|sharp|pain/i, question: 'Does that tightness feel like pressure or a sharp pain?' },
  { match: /allerg|rash|itch/i, words: /allerg|rash|itch|expos|started/i, question: 'What were you exposed to before the reaction started?' },
];
function reasonText(answers: CheckInAnswers) { return answers.reason.trim() || answers.reasonChips.join(', '); }
function topicFor(answers: CheckInAnswers) { return topics.find(topic => topic.match.test(reasonText(answers))); }

export function complaintQuestion(answers: CheckInAnswers): string {
  const topic = topicFor(answers);
  if (topic?.knownOnset && answers.onset) return topic.knownOnset;
  if (topic) return topic.question;
  const words = reasonText(answers).replace(/[^\p{L}\p{N}\s'-]/gu, '').split(/\s+/).slice(0, 6).join(' ');
  return words ? `When you say “${words}”, what does that feel like?` : 'What are you feeling that brought you in today?';
}

export function specificQuestion(question: string, answers: CheckInAnswers): boolean {
  if (question.split(/\s+/).length > 20 || !question.endsWith('?') || question.match(/\?/g)?.length !== 1) return false;
  if (/\b(nurse|doctor|staff|clinician|anything else|something else|other symptoms?|more information|more details|tell me more|how (are|do) you feel|how can i help|you should|you must|take|try|recommend|call|go to)\b/i.test(question)) return false;
  const topic = topicFor(answers);
  if (topic) return topic.words.test(question);
  const stop = new Set(['this', 'that', 'have', 'been', 'feel', 'feels', 'feeling', 'with', 'since', 'after', 'what', 'when', 'very', 'just', 'some', 'something', 'today', 'getting', 'started', 'really', 'dont', 'know']);
  return reasonText(answers).toLowerCase().match(/[\p{L}]+/gu)?.some(word => word.length > 3 && !stop.has(word) && question.toLowerCase().includes(word)) ?? false;
}
