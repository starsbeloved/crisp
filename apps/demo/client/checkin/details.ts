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
