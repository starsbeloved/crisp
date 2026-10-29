import type { CheckInAnswers } from '../../shared/types.ts';

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function detailsError(answers: Pick<CheckInAnswers, 'dateOfBirth' | 'phone'>, today = localToday()): string {
  const dob = answers.dateOfBirth;
  if (dob) {
    const parsed = new Date(`${dob}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dob || dob > today || dob < '1900-01-01') {
      return 'Please check your date of birth (YYYY-MM-DD), or leave it blank for staff to help.';
    }
  }
  const phone = answers.phone?.trim();
  if (phone && (!/^\+?[\d ().-]+$/.test(phone) || phone.length > 40 || phone.replace(/\D/g, '').length < 7 || phone.replace(/\D/g, '').length > 15)) {
    return 'Please check your phone number, or leave it blank for staff to help.';
  }
  return '';
}

/** Accept spoken month names and numeric dates only when their order is unambiguous. */
export function normalizeSpokenDate(value: string, today = localToday()): string | null {
  let text = value.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/,/g, '').replace(/\s+/g, ' ');
  const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty first', 'twenty second', 'twenty third', 'twenty fourth', 'twenty fifth', 'twenty sixth', 'twenty seventh', 'twenty eighth', 'twenty ninth', 'thirtieth', 'thirty first'];
  for (let day = ordinals.length; day >= 1; day--) {
    const ordinal = ordinals[day - 1].replace(/ /g, '[ -]');
    text = text.replace(new RegExp(`\\b${ordinal}\\b`, 'g'), String(day));
  }
  let date = text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const named = text.match(/^(?:([a-z]+) (\d{1,2})|(\d{1,2}) (?:of )?([a-z]+)) (\d{4})$/);
    const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
    let year: number, month: number, day: number;
    if (named) {
      month = months.indexOf(named[1] || named[4]) + 1;
      day = Number(named[2] || named[3]); year = Number(named[5]);
    } else if (numeric) {
      const first = Number(numeric[1]), second = Number(numeric[2]);
      if (first <= 12 && second <= 12 && first !== second) return null;
      [day, month] = first > 12 || first === second ? [first, second] : [second, first];
      year = Number(numeric[3]);
      if (numeric[3].length === 2) {
        const currentYear = Number(today.slice(0, 4));
        year += Math.floor(currentYear / 100) * 100;
        if (year > currentYear) year -= 100;
      }
    } else return null;
    date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return detailsError({ dateOfBirth: date }, today) ? null : date;
}
