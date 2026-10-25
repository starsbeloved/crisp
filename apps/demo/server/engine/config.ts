/** Filming preset used by engine/index.ts, not a validated clinical rule.
 * A fall flag is immediate; camera observations arrive ~1 Hz and retain it for 1.5 s.
 * Slump alone requests amber; existing fusion with current fair/good vitals can upgrade red.
 */
export const ENGINE_THRESHOLDS = {
  headDropSec: 3,
  slumpSec: 8,
  stillSec: 30,
  abnormalMs: 20_000,
  evidenceGapMs: 3000,
} as const;
