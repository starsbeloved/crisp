import { randomUUID } from 'node:crypto';
import type { Alert, AlertFacts, Observation, Quality, RoomState, Visit, Vitals } from '../../shared/types.ts';

export interface EngineResult { opened: Alert[]; updated: Alert[] }

// Local adapter: keep samples beside the vitals in the existing room store. This
// also survives RoomStore persistence without changing the frozen shared types.
interface EngineMemory {
  firstSeenAt: number;
  hrSamples: number[]; rrSamples: number[];
  hrSampleAt: number | null; rrSampleAt: number | null;
  hrRun: AbnormalRun | null; rrRun: AbnormalRun | null;
}
interface AbnormalRun { reason: NonNullable<AlertFacts['hrReason']>; since: number; lastAt: number }
type EngineVitals = Vitals & { _engine?: EngineMemory };
const qualityRank = { none: 0, low: 1, fair: 2, good: 3 };

function memory(vitals: EngineVitals, now: number): EngineMemory {
  return vitals._engine ??= { firstSeenAt: now, hrSamples: [], rrSamples: [], hrSampleAt: null, rrSampleAt: null,
    hrRun: null, rrRun: null };
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function collectBaseline(vitals: EngineVitals, now: number): void {
  const data = memory(vitals, now);
  for (const signal of ['hr', 'rr'] as const) {
    const samples = signal === 'hr' ? data.hrSamples : data.rrSamples;
    const value = signal === 'hr' ? vitals.hrBpm : vitals.rrBpm;
    const quality = signal === 'hr' ? vitals.hrQuality : vitals.rrQuality;
    const sampleAt = signal === 'hr' ? data.hrSampleAt : data.rrSampleAt;
    if (quality !== 'good' || value === null || !Number.isFinite(value) ||
      (sampleAt !== null && now - sampleAt < 1000) ||
      (now - data.firstSeenAt > 60_000 && samples.length >= 10)) continue;
    samples.push(value);
    if (signal === 'hr') {
      data.hrSampleAt = now;
      if (samples.length >= 10) vitals.baselineHr = median(samples);
    } else {
      data.rrSampleAt = now;
      if (samples.length >= 10) vitals.baselineRr = median(samples);
    }
  }
}

function usable(value: number | null, quality: Quality): value is number {
  return value !== null && Number.isFinite(value) && qualityRank[quality] >= qualityRank.fair;
}

function hrReason(vitals: Vitals): AlertFacts['hrReason'] {
  if (!usable(vitals.hrBpm, vitals.hrQuality)) return null;
  if (vitals.hrBpm >= 111) return 'news2-high';
  if (vitals.hrBpm <= 50) return 'news2-low';
  return vitals.baselineHr !== null && Math.abs(vitals.hrBpm - vitals.baselineHr) >= 20 ? 'baseline-delta' : null;
}

function rrReason(vitals: Vitals): AlertFacts['rrReason'] {
  if (!usable(vitals.rrBpm, vitals.rrQuality)) return null;
  return vitals.rrBpm >= 25 ? 'news2-high' : vitals.rrBpm <= 8 ? 'news2-low' : null;
}

function sustain(previous: AbnormalRun | null, reason: AlertFacts['hrReason'], available: boolean, now: number): AbnormalRun | null {
  if (reason === null) return !available && previous && now - previous.lastAt <= 3000 ? previous : null;
  return previous && previous.reason === reason && now - previous.lastAt <= 3000 ?
    { ...previous, lastAt: now } : { reason, since: now, lastAt: now };
}

function evaluate(vitals: EngineVitals, now: number): { hr: AlertFacts['hrReason']; rr: AlertFacts['rrReason'] } {
  const data = memory(vitals, now), heart = hrReason(vitals), breathing = rrReason(vitals);
  data.hrRun = sustain(data.hrRun, heart, usable(vitals.hrBpm, vitals.hrQuality), now);
  data.rrRun = sustain(data.rrRun, breathing, usable(vitals.rrBpm, vitals.rrQuality), now);
  const hr = heart && data.hrRun && now - data.hrRun.since >= 20_000 ? heart : null;
  const rr = breathing && data.rrRun && now - data.rrRun.since >= 20_000 ? breathing : null;
  const pose = vitals.posture;
  const resting = pose && (pose.slumpSec >= 10 || pose.stillSec >= 30);
  vitals.level = pose?.fallSuspected || (pose?.headDropSec ?? 0) >= 5 || (resting && (hr || rr)) ? 'red' :
    resting || hr || rr ? 'amber' : 'none';
  return { hr, rr };
}

function evidence(visit: Visit, vitals: EngineVitals, hr: AlertFacts['hrReason'], rr: AlertFacts['rrReason'], now: number):
  { facts: AlertFacts; reasons: string[] } {
  const reasons: string[] = [], postureEvents: AlertFacts['postureEvents'] = [];
  const data = memory(vitals, now), pose = vitals.posture;
  if (hr) reasons.push(`Heart rate ${vitals.hrBpm} bpm${vitals.baselineHr === null ? '' : ` (baseline ${vitals.baselineHr})`} for ${Math.floor((now - data.hrRun!.since) / 1000)} s`);
  if (rr) reasons.push(`Breathing rate ${vitals.rrBpm}/min${vitals.baselineRr === null ? '' : ` (baseline ${vitals.baselineRr})`} for ${Math.floor((now - data.rrRun!.since) / 1000)} s`);
  const resting = !hrReason(vitals) && !rrReason(vitals) && usable(vitals.hrBpm, vitals.hrQuality) && usable(vitals.rrBpm, vitals.rrQuality);
  const restHint = resting ? '; heart rate normal — may be resting' : '';
  if (pose?.fallSuspected) { postureEvents.push({ kind: 'fall', seconds: 0 }); reasons.push('Fall-like movement detected'); }
  if ((pose?.headDropSec ?? 0) >= 5) {
    postureEvents.push({ kind: 'headDrop', seconds: pose!.headDropSec }); reasons.push(`Head below shoulders ${pose!.headDropSec} s`);
  }
  if ((pose?.slumpSec ?? 0) >= 10) {
    postureEvents.push({ kind: 'slump', seconds: pose!.slumpSec }); reasons.push(`Slumped forward ${pose!.slumpSec} s${restHint}`);
  }
  if ((pose?.stillSec ?? 0) >= 30) {
    postureEvents.push({ kind: 'still', seconds: pose!.stillSec }); reasons.push(`Still for ${pose!.stillSec} s${restHint}`);
  }
  if (postureEvents.length) {
    if (!usable(vitals.hrBpm, vitals.hrQuality)) reasons.push(`Heart rate unavailable (${vitals.hrQuality === 'low' ? 'low signal' : 'measuring…'})`);
    if (!usable(vitals.rrBpm, vitals.rrQuality)) reasons.push(`Breathing rate unavailable (${vitals.rrQuality === 'low' ? 'low signal' : 'measuring…'})`);
  }
  return { reasons, facts: {
    name: visit.name, queueNo: visit.queueNo, chiefComplaint: visit.summary?.chiefComplaint ?? null,
    answers: structuredClone(visit.answers), hrBpm: vitals.hrBpm, baselineHr: vitals.baselineHr,
    rrBpm: vitals.rrBpm, baselineRr: vitals.baselineRr, hrReason: hr, rrReason: rr,
    postureEvents, waitedMin: Math.max(0, Math.floor((now - visit.createdAt) / 60_000)),
  } };
}

export function ingest(state: RoomState, observations: Observation[], now: number): EngineResult {
  const result: EngineResult = { opened: [], updated: [] };
  const selected = new Map<string, Observation>();
  for (const obs of observations) {
    if (!obs.visitId || !state.visits.some(visit => visit.id === obs.visitId && visit.status === 'waiting')) continue;
    const best = selected.get(obs.visitId);
    if (!best || qualityRank[obs.hrQuality] > qualityRank[best.hrQuality] ||
      (obs.hrQuality === best.hrQuality && obs.at > best.at)) selected.set(obs.visitId, obs);
  }
  for (const [visitId, obs] of selected) {
    const previous = state.vitals[visitId] as EngineVitals | undefined;
    const history = (previous?.history ?? []).filter(item => item.t >= now - 600_000);
    if (!history.length || now - history[history.length - 1].t >= 1000) {
      history.push({ t: now, hr: obs.hrBpm, rr: obs.rrBpm });
    }
    const vitals: EngineVitals = {
      visitId, lastSeenAt: obs.at, cameraId: obs.cameraId, box: obs.box,
      hrBpm: obs.hrBpm, hrQuality: obs.hrQuality, rrBpm: obs.rrBpm, rrQuality: obs.rrQuality,
      baselineHr: previous?.baselineHr ?? null, baselineRr: previous?.baselineRr ?? null,
      posture: obs.posture, hint: obs.hint, source: obs.source, pulseTrace: obs.pulseTrace,
      level: 'none', history, _engine: previous?._engine,
    };
    collectBaseline(vitals, now);
    state.vitals[visitId] = vitals;
    const checkedAt = state.alerts.filter(alert => alert.visitId === visitId && alert.status === 'checked')
      .reduce((latest, alert) => Math.max(latest, alert.checkedAt ?? -Infinity), -Infinity);
    if (now - checkedAt < 60_000) continue;
    const { hr, rr } = evaluate(vitals, now);
    if (vitals.level === 'none') continue;
    const visit = state.visits.find(item => item.id === visitId)!;
    const { facts, reasons } = evidence(visit, vitals, hr, rr, now);
    const existing = state.alerts.find(alert => alert.visitId === visitId && alert.status !== 'checked');
    if (!existing) {
      const alert: Alert = { id: randomUUID(), visitId, level: vitals.level, reasons, facts,
        openedAt: now, updatedAt: now, status: 'open', acknowledgedAt: null, checkedAt: null,
        explanation: null, audio: null, replayFrames: 0, cameraId: vitals.cameraId };
      state.alerts.push(alert);
      result.opened.push(alert);
    } else if (existing.level === 'amber' && vitals.level === 'red') {
      existing.level = 'red';
      existing.updatedAt = now;
      existing.reasons = [...new Set([...existing.reasons, ...reasons])];
      existing.facts = facts;
      existing.cameraId = vitals.cameraId;
      existing.explanation = null;
      existing.audio = null;
      result.updated.push(existing);
    }
  }
  return result;
}

export function onChecked(state: RoomState, alert: Alert, now: number): void {
  alert.status = 'checked';
  alert.checkedAt = now;
  alert.updatedAt = now;
  const vitals = state.vitals[alert.visitId] as EngineVitals | undefined;
  if (vitals) {
    vitals.baselineHr = null;
    vitals.baselineRr = null;
    vitals.level = 'none';
    vitals.posture = null;
    vitals._engine = undefined;
  }
}
