import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { identifier, validateCapture, validateSample } from '../../../packages/contracts/src/index.ts';
import type { Channel, ChannelCoverage, IngestResult, Sample, SavedEvent } from '../../../packages/contracts/src/index.ts';

type Clock = { offset: number; seq: number; sourceMs: number; provenance: string; sourceIdentity: string };
type LiveState = { startedAtMs: number; samples: Sample[]; clocks: Map<string, Clock> };

export class EchoEngine {
  private db: DatabaseSync;
  private now: () => number;
  private live = new Map<string, LiveState>();

  constructor(path: string, now: () => number = Date.now) {
    this.now = now;
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, secret_hash TEXT);
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, request_id TEXT NOT NULL,
        marked_at_ms INTEGER NOT NULL, body TEXT NOT NULL,
        UNIQUE(session_id, request_id)
      );
    `);
  }

  createSession(id: string, secretHash: string | null = null) {
    identifier(id, 'session');
    this.db.prepare('INSERT INTO sessions (id, secret_hash) VALUES (?, ?)').run(id, secretHash);
  }

  authenticate(id: string, secretHash: string): boolean {
    return Boolean(this.db.prepare('SELECT id FROM sessions WHERE id = ? AND secret_hash = ?').get(id, secretHash));
  }

  private state(id: string): LiveState {
    if (!this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(id)) throw new Error('Unknown session');
    if (!this.live.has(id)) this.live.set(id, { startedAtMs: this.now(), samples: [], clocks: new Map() });
    const state = this.live.get(id)!;
    const cutoff = this.now() - 600_000;
    state.samples = state.samples.filter(s => s.alignedAtMs >= cutoff);
    return state;
  }

  ingestSamples(sessionId: string, input: unknown): IngestResult {
    if (!Array.isArray(input) || input.length > 1000) throw new Error('Invalid samples batch (maximum 1000)');
    const incoming = input.map(validateSample);
    const state = this.state(sessionId);
    const clocks = new Map([...state.clocks].map(([key, clock]) => [key, { ...clock }]));
    const now = this.now();
    const accepted: Sample[] = [];
    let duplicates = 0, expired = 0;
    for (const sample of incoming) {
      const key = JSON.stringify([sample.deviceId, sample.bootId]);
      const sourceIdentity = JSON.stringify(sample.replay ? [sample.replay.dataset, sample.replay.version, sample.replay.participant, sample.replay.speed] : []);
      let clock = clocks.get(key);
      if (!clock) {
        const latest = Math.max(...incoming.filter(s => s.deviceId === sample.deviceId && s.bootId === sample.bootId).map(s => s.sourceMonotonicMs));
        clock = { offset: now - latest, seq: -1, sourceMs: -1, provenance: sample.provenance, sourceIdentity };
        clocks.set(key, clock);
      }
      if (clock.provenance !== sample.provenance || clock.sourceIdentity !== sourceIdentity) throw new Error('Source identity changed; start a new bootId');
      if (sample.seq <= clock.seq) { duplicates++; continue; }
      if (sample.sourceMonotonicMs < clock.sourceMs) throw new Error('Source clock reversed; start a new bootId');
      const alignedAtMs = sample.sourceMonotonicMs + clock.offset;
      if (alignedAtMs > now + 2000) throw new Error('Source clock is ahead of receipt time');
      clock.seq = sample.seq; clock.sourceMs = sample.sourceMonotonicMs;
      if (alignedAtMs < now - 600_000) { expired++; continue; }
      accepted.push({ ...sample, id: randomUUID(), sessionId, alignedAtMs, receivedAtMs: now,
        clockUncertaintyMs: null, alignmentMethod: 'receipt_anchor' });
    }
    if (state.samples.length + accepted.length > 200_000) throw new Error('Session sample capacity reached');
    state.samples.push(...accepted);
    state.samples.sort((a, b) => a.alignedAtMs - b.alignedAtMs);
    state.clocks = clocks;
    return { accepted: accepted.length, duplicates, expired };
  }

  getLive(sessionId: string) {
    const state = this.state(sessionId);
    return structuredClone({ startedAtMs: state.startedAtMs, serverNowMs: this.now(), samples: state.samples });
  }

  captureEvent(sessionId: string, input: unknown): SavedEvent {
    const request = validateCapture(input);
    const state = this.state(sessionId);
    const existing = this.db.prepare('SELECT body FROM events WHERE session_id = ? AND request_id = ?').get(sessionId, request.requestId);
    if (existing) return JSON.parse(existing.body as string);
    const now = this.now();
    if (request.estimatedOnsetAtMs !== undefined && request.estimatedOnsetAtMs > now) throw new Error('Onset cannot be after marking');
    const duration = request.requestedDurationMs!;
    const start = now - duration;
    const samples = state.samples.filter(s => s.alignedAtMs >= start && s.alignedAtMs <= now);
    const coverage: Partial<Record<Channel, ChannelCoverage>> = {};
    const bins = new Map<Channel, Set<number>>();
    const expectedBins = Math.ceil(duration / 1000);
    for (const s of samples) {
      if (!bins.has(s.channel)) bins.set(s.channel, new Set());
      if (s.quality === 'good') bins.get(s.channel)!.add(Math.min(expectedBins - 1, Math.floor((s.alignedAtMs - start) / 1000)));
    }
    for (const [channel, occupied] of bins) {
      coverage[channel] = { usableBins: occupied.size, expectedBins, fraction: occupied.size / expectedBins };
    }
    const event: SavedEvent = {
      id: randomUUID(), sessionId, requestId: request.requestId, method: request.method,
      markedAtMs: now, estimatedOnsetAtMs: request.estimatedOnsetAtMs ?? null,
      requestedStartMs: start, requestedDurationMs: duration, endMs: now,
      actualStartMs: samples[0]?.alignedAtMs ?? null, actualEndMs: samples.at(-1)?.alignedAtMs ?? null,
      actualDurationMs: samples.length ? samples.at(-1)!.alignedAtMs - samples[0].alignedAtMs : 0,
      label: request.label ?? '', note: request.note ?? '', placement: request.placement ?? 'unspecified',
      samples, coverage, provenances: [...new Set(samples.map(s => s.provenance))],
    };
    const body = JSON.stringify(event);
    this.db.prepare('INSERT INTO events (id, session_id, request_id, marked_at_ms, body) VALUES (?, ?, ?, ?, ?)')
      .run(event.id, sessionId, request.requestId, now, body);
    return JSON.parse(body);
  }

  getEvent(sessionId: string, eventId: string): SavedEvent {
    this.state(sessionId);
    const row = this.db.prepare('SELECT body FROM events WHERE session_id = ? AND id = ?').get(sessionId, eventId);
    if (!row) throw new Error('Event not found in session');
    return JSON.parse(row.body as string);
  }

  listEvents(sessionId: string) {
    this.state(sessionId);
    return this.db.prepare('SELECT body FROM events WHERE session_id = ? ORDER BY marked_at_ms DESC, rowid DESC LIMIT 100').all(sessionId)
      .map(row => { const { samples, ...summary } = JSON.parse(row.body as string) as SavedEvent; return { ...summary, sampleCount: samples.length }; });
  }

  close() { this.db.close(); }
}
