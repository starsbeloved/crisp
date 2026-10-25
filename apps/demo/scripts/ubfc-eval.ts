/** Offline CSV evaluator only; does not download data or send anything over the network. */
import { readFileSync } from 'node:fs';
import { createSignalTracker } from '../client/camera/signals/index.ts';

function main() {
  const [path, ...flags] = process.argv.slice(2);
  if (!path || flags.some(x => x !== '--seconds')) {
    throw new Error('Usage: node scripts/ubfc-eval.ts samples.csv [--seconds]\nCSV: t,r,g,b,refBpm; t defaults to milliseconds; RGB is 0–255.');
  }
  const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const tracker = createSignalTracker(), errors: number[] = [];
  let previous = -Infinity, lastRead = -Infinity, rows = 0, estimates = 0;
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line].trim();
    if (!text) continue;
    if (rows === 0 && /^t\s*,/i.test(text)) continue;
    const fields = text.split(',').map(s => s.trim());
    const [rawT, r, g, b] = fields.slice(0, 4).map(Number);
    const ref = fields[4] === '' ? null : Number(fields[4]);
    const t = rawT * (flags.includes('--seconds') ? 1000 : 1);
    if (fields.length !== 5 || fields.slice(0, 4).some(x => x === '') ||
      ![t, r, g, b].every(Number.isFinite) || t <= previous ||
      [r, g, b].some(x => x < 0 || x > 255) || ref !== null && (!Number.isFinite(ref) || ref <= 0)) {
      throw new Error(`Invalid CSV at line ${line + 1}: expected increasing t, RGB in 0–255 and positive refBpm (or blank).`);
    }
    previous = t; rows++;
    tracker.pushFace({ t, rgb: [r, g, b], brightness: (r + g + b) / 3, faceWidthPx: 150 });
    if (t - lastRead < 1000) continue;
    const reading = tracker.read(t);
    lastRead = t;
    if (reading.hrBpm !== null) {
      estimates++;
      if (ref !== null) errors.push(Math.abs(reading.hrBpm - ref));
    }
  }
  if (!rows) throw new Error('CSV contains no samples.');
  console.log('OFFLINE CSV EVALUATION — estimates, not a clinical validation');
  console.log(`Samples: ${rows}; usable estimates: ${estimates}`);
  console.log(`Compared: ${errors.length} readings`);
  console.log(errors.length ? `MAE: ${(errors.reduce((sum, x) => sum + x, 0) / errors.length).toFixed(2)} bpm` : 'MAE: unavailable (no usable estimate/reference pairs)');
  console.log('CSV assumes an adequate face ROI and light; cannot assess face motion or pose quality.');
}

try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : 'CSV evaluation failed.');
  process.exitCode = 1;
}
