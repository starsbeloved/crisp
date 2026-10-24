export const CHANNELS = {
  accel_x: 'm/s2', accel_y: 'm/s2', accel_z: 'm/s2',
  accel_total_x: 'm/s2', accel_total_y: 'm/s2', accel_total_z: 'm/s2',
  rotation_alpha: 'deg/s', rotation_beta: 'deg/s', rotation_gamma: 'deg/s',
  light_lux: 'lux', temperature_c: 'degC', humidity_pct: '%', voc_index: 'index',
} as const;
export type Channel = keyof typeof CHANNELS;
export type Provenance = 'live_phone' | 'live_hardware' | 'dataset_replay' | 'synthetic';
export type ReplaySource = {
  dataset: string; version: string; participant: string; originalAtMs: number; speed: number;
};
export type SampleInput = {
  schemaVersion: 1; deviceId: string; bootId: string; seq: number;
  sourceMonotonicMs: number; channel: Channel; value: number | null;
  unit: string; quality: 'good' | 'unavailable' | 'error'; provenance: Provenance;
  replay?: ReplaySource;
};
export type Sample = SampleInput & {
  id: string; sessionId: string; alignedAtMs: number; receivedAtMs: number;
  clockUncertaintyMs: number | null; alignmentMethod: 'receipt_anchor';
};
export type CaptureRequest = {
  requestId: string; method: 'manual' | 'automatic'; requestedDurationMs?: number;
  label?: string; note?: string; placement?: string; estimatedOnsetAtMs?: number;
};
export type ChannelCoverage = { usableBins: number; expectedBins: number; fraction: number };
export type SavedEvent = {
  id: string; sessionId: string; requestId: string; method: 'manual' | 'automatic';
  markedAtMs: number; estimatedOnsetAtMs: number | null;
  requestedStartMs: number; requestedDurationMs: number; endMs: number;
  actualStartMs: number | null; actualEndMs: number | null; actualDurationMs: number;
  label: string; note: string; placement: string; samples: Sample[];
  coverage: Partial<Record<Channel, ChannelCoverage>>; provenances: Provenance[];
};
export type IngestResult = { accepted: number; duplicates: number; expired: number };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }

export function validateSample(input: unknown): SampleInput {
  if (!record(input) || input.schemaVersion !== 1) throw new Error('Invalid schemaVersion');
  const deviceId = identifier(input.deviceId, 'deviceId');
  const bootId = identifier(input.bootId, 'bootId');
  if (!Number.isSafeInteger(input.seq) || (input.seq as number) < 0) throw new Error('Invalid seq');
  if (!finite(input.sourceMonotonicMs) || input.sourceMonotonicMs < 0) throw new Error('Invalid sourceMonotonicMs');
  if (typeof input.channel !== 'string' || !Object.hasOwn(CHANNELS, input.channel)) throw new Error('Invalid channel');
  const channel = input.channel as Channel;
  if (input.unit !== CHANNELS[channel]) throw new Error('Invalid unit for channel');
  if (!['good', 'unavailable', 'error'].includes(input.quality as string)) throw new Error('Invalid quality');
  if (input.quality === 'good' ? !finite(input.value) : input.value !== null) throw new Error('Invalid value for quality');
  if (!['live_phone', 'live_hardware', 'dataset_replay', 'synthetic'].includes(input.provenance as string)) {
    throw new Error('Invalid provenance');
  }
  let replay: ReplaySource | undefined;
  if (input.provenance === 'dataset_replay') {
    const r = input.replay;
    if (!record(r) || !finite(r.originalAtMs) || !finite(r.speed) || r.speed <= 0
      || !['dataset', 'version', 'participant'].every(k => typeof r[k] === 'string' && r[k].length > 0 && r[k].length <= 160)) {
      throw new Error('Invalid replay source');
    }
    replay = { dataset: r.dataset as string, version: r.version as string, participant: r.participant as string,
      originalAtMs: r.originalAtMs, speed: r.speed };
  } else if (input.replay !== undefined) throw new Error('Unexpected replay source');
  return { schemaVersion: 1, deviceId, bootId, seq: input.seq as number,
    sourceMonotonicMs: input.sourceMonotonicMs, channel, value: input.value as number | null,
    unit: input.unit as string, quality: input.quality as SampleInput['quality'],
    provenance: input.provenance as Provenance, ...(replay ? { replay } : {}) };
}

export function validateCapture(input: unknown): CaptureRequest {
  if (!record(input)) throw new Error('Invalid capture request');
  const requestId = identifier(input.requestId, 'requestId');
  if (!['manual', 'automatic'].includes(input.method as string)) throw new Error('Invalid capture method');
  const duration = input.requestedDurationMs ?? 600_000;
  if (!Number.isSafeInteger(duration) || (duration as number) < 1000 || (duration as number) > 600_000) {
    throw new Error('Invalid requestedDurationMs');
  }
  for (const field of ['label', 'note', 'placement']) {
    if (input[field] !== undefined && (typeof input[field] !== 'string' || (input[field] as string).length > 2000)) {
      throw new Error(`Invalid ${field}`);
    }
  }
  if (input.estimatedOnsetAtMs !== undefined && (!finite(input.estimatedOnsetAtMs) || input.estimatedOnsetAtMs < 0)) {
    throw new Error('Invalid estimatedOnsetAtMs');
  }
  return { requestId, method: input.method as CaptureRequest['method'], requestedDurationMs: duration as number,
    label: input.label as string | undefined, note: input.note as string | undefined,
    placement: input.placement as string | undefined, estimatedOnsetAtMs: input.estimatedOnsetAtMs as number | undefined };
}
