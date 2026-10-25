import type { Quality } from '../../../shared/types.ts';
import type { SignalReading } from './index.ts';

/** Display metadata only. Never send this cached value as an observation. */
export interface HeartRateDisplay {
  bpm: number | null;
  quality: Quality;
  ageSeconds: number | null;
  retained: boolean;
  label: string;
}

export function createHeartRateDisplay() {
  let lastGood: { bpm: number; at: number } | null = null;
  let quality: Quality = 'none', pending: { usable: boolean; since: number } | null = null;
  let lastRead = -Infinity;
  return {
    update(bpm: number | null, currentQuality: Quality, at: number, now: number): HeartRateDisplay {
      const usable = bpm !== null && Number.isFinite(bpm) && (currentQuality === 'fair' || currentQuality === 'good') &&
        Number.isFinite(at) && at <= now && now - at <= 1000;
      if (Number.isFinite(now) && now >= lastRead) {
        if (usable && (!lastGood || at >= lastGood.at)) lastGood = { bpm, at };
        const wasUsable = quality === 'good' || quality === 'fair';
        // Initial acquisition already needs ten seconds of signal; subsequent drop/recovery needs three.
        if (quality === 'none' && usable) { quality = currentQuality; pending = null; }
        else if (usable === wasUsable) { quality = usable ? currentQuality : quality; pending = null; }
        else {
          if (!pending || pending.usable !== usable) pending = { usable, since: now };
          if (now - pending.since >= 3000) { quality = usable ? currentQuality : 'low'; pending = null; }
        }
        if (quality === 'none' && currentQuality === 'low') quality = 'low';
        lastRead = now;
      }
      const age = lastGood ? now - lastGood.at : Infinity;
      const cached = lastGood && Number.isFinite(age) && age >= 0 && age <= 30_000 ? lastGood : null;
      const retained = !!cached && (!usable || quality === 'low');
      const ageSeconds = cached ? Math.floor(age / 1000) : null;
      return { bpm: cached?.bpm ?? null, quality, ageSeconds, retained,
        label: cached ? `${Math.round(cached.bpm)} bpm · ${retained ? `last good reading · ${ageSeconds} s ago` : currentQuality}` :
          quality === 'none' ? 'measuring…' : 'Low signal' };
    },
    reset() { lastGood = null; quality = 'none'; pending = null; lastRead = -Infinity; },
  };
}

/** P13b/P8 can use this label without changing the observation/alert path. */
export function signalDisplayLabel(reading: SignalReading): string {
  const hr = reading.hrDisplay?.label ?? (reading.hrBpm !== null && ['fair', 'good'].includes(reading.hrQuality)
    ? `${Math.round(reading.hrBpm)} bpm · ${reading.hrQuality}` : reading.hrQuality === 'low' ? 'Low signal' : 'measuring…');
  const breathing = reading.rrBpm !== null && ['fair', 'good'].includes(reading.rrQuality)
    ? `${Math.round(reading.rrBpm)}/min · ${reading.rrQuality}` : 'not measured';
  return `♥ ${hr} · Breathing: ${breathing}`;
}
