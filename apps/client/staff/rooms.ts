/** Shared by staff, exam and server paths; no browser or server dependencies. */
export function normalizeRoom(room: string): string {
  const value = room.trim().replace(/^room\s*/i, '').trim().toLowerCase();
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const number = words.indexOf(value);
  if (number >= 0) return String(number);
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? String(Number(value)) : value;
}
export function roomLabel(room: string): string { return `Room ${normalizeRoom(room)}`; }
