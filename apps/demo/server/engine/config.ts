/** Filming preset, not a validated clinical rule. P8 must wire these into engine/index.ts.
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
