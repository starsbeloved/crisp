import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/ubfc-eval.ts', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'crisp-p3-eval-'));

function run(csv: string, ...args: string[]) {
  const path = join(directory, `samples-${Math.random().toString(36).slice(2)}.csv`);
  writeFileSync(path, csv);
  return spawnSync(process.execPath, [script, path, ...args], { encoding: 'utf8' });
}

describe('P3 CSV evaluation CLI', () => {
  it.each([false, true])('reports an honest MAE for synthetic reference data (seconds=%s)', seconds => {
    const lines = ['t,r,g,b,refBpm'];
    for (let t = 0; t <= 16_000; t += 40) {
      const p = Math.sin(2 * Math.PI * 1.2 * t / 1000);
      lines.push([seconds ? t / 1000 : t, 120 + 0.35 * p, 100 + 1.2 * p, 80 + 0.1 * p, 72].join(','));
    }
    const result = run(lines.join('\n'), ...(seconds ? ['--seconds'] : []));
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/MAE: 0\.\d+ bpm/);
    expect(result.stdout).toMatch(/Compared: [1-9]\d* readings/);
  });

  it('does not report zero error when there are no usable readings', () => {
    const csv = Array.from({ length: 401 }, (_, i) => `${i * 40},120,100,80,72`).join('\n');
    const result = run(`t,r,g,b,refBpm\n${csv}`);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('MAE: unavailable');
    expect(result.stdout).toContain('Compared: 0 readings');
  });

  it('rejects malformed rows with a useful line number', () => {
    const result = run('t,r,g,b,refBpm\n0,120,100,80,72\n40,not-a-number,100,80,72');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/line 3/i);
  });
});
