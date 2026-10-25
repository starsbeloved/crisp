const forbidden = /diagnos|heart attack|stroke|cardiac|emergency|sepsis|you have/i;
const wordNumbers: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
};
const numberWords = new RegExp(`\\b(?:${Object.keys(wordNumbers).join('|')})(?:[ -]+(?:and[ -]+)?(?:${Object.keys(wordNumbers).join('|')}))*\\b`, 'gi');

function numbers(text: string): string[] {
  const digits = (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(value => String(Number(value)));
  for (const phrase of text.match(numberWords) ?? []) {
    let total = 0, group = 0;
    for (const word of phrase.toLowerCase().split(/[ -]+/)) {
      if (word === 'and') continue;
      const value = wordNumbers[word];
      if (value === 100) group = (group || 1) * value;
      else if (value === 1000) { total += (group || 1) * value; group = 0; }
      else group += value;
    }
    digits.push(String(total + group));
  }
  return digits;
}

function factNumbers(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'number' && Number.isFinite(value)) found.add(String(value));
  else if (typeof value === 'string') for (const number of numbers(value)) found.add(number);
  else if (Array.isArray(value)) for (const item of value) factNumbers(item, found);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) factNumbers(item, found);
  return found;
}

export function wordCount(text: string): number { return text.trim().split(/\s+/).filter(Boolean).length; }
export function shorten(text: string, max: number): string { return text.trim().split(/\s+/).slice(0, max).join(' '); }

export function grounded(text: string, facts: unknown, maxWords: number, names: string[] = []): boolean {
  if (!text.trim() || wordCount(text) > maxWords || forbidden.test(text)) return false;
  const lower = text.toLocaleLowerCase();
  if (names.some(name => !lower.includes(name.toLocaleLowerCase()))) return false;
  const allowed = factNumbers(facts);
  return numbers(text).every(number => allowed.has(number));
}
