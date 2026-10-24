import { describe, expect, it } from 'vitest';
import { answersSchema, ingestSchema, measurementInputSchema, measurementSchema, poseInputSchema, roomSnapshotSchema } from '../shared/schemas.ts';
import * as fixtures from '../shared/fixtures.ts';

export const phoneFixture = {
  schemaVersion: 1, id: 'phone_1', sourceId: 'phone_demo', runId: 'run_1', seq: 1,
  syncId: 'sync_1', streamId: 'phone', channel: 'pulse', method: 'phone-camera-contact-ppg',
  trackId: null, visitId: 'visit_1', identityEpoch: null, captureId: 'capture_1',
  sourceStartAtMs: 1000, sourceEndAtMs: 31000, alignedStartAtMs: 2000, alignedEndAtMs: 32000,
  receivedAtMs: 32001, quality: 'usable', value: 72, unit: 'bpm', provenance: 'live_phone',
  reason: null, metrics: { sampleCount: 900 },
};
const { alignedStartAtMs, alignedEndAtMs, receivedAtMs, ...input } = phoneFixture;

it('rejects legacy temperature-bearing room payloads instead of silently reviving retired data', () => {
  expect(roomSnapshotSchema.safeParse({ ...fixtures.emptyRoom, schemaVersion: 1 }).success).toBe(false);
  expect(roomSnapshotSchema.safeParse({ ...fixtures.emptyRoom, scenarios: [{ visitId: 'visit_1', scenarioId: 'old', valueC: 38, provenance: 'synthetic', scenarioAtMs: 100, active: true }] }).success).toBe(false);
});

describe('measurement boundaries', () => {
  it('accepts a correctly paired contact pulse', () => expect(measurementSchema.parse(phoneFixture)).toEqual(phoneFixture));
  it.each([
    { value: Infinity }, { value: NaN }, { value: null }, { unit: 'breaths/min' },
    { method: 'camera-pos' }, { provenance: 'live_camera' }, { captureId: null },
    { trackId: 'track_1' }, { sourceEndAtMs: 0 }, { alignedEndAtMs: 0 },
    { sourceStartAtMs: -1 }, { metrics: { cadence: Infinity } }, { id: 'bad id' },
    { quality: 'unavailable', value: 72 },
  ])('rejects invalid measurement %j', patch => expect(measurementSchema.safeParse({ ...phoneFixture, ...patch }).success).toBe(false));
  it('requires camera streams to have a track/epoch and no capture', () => {
    const camera = { ...phoneFixture, streamId: 'rppg', method: 'camera-pos', provenance: 'live_camera', trackId: 'track_1', identityEpoch: 'epoch_1', captureId: null };
    expect(measurementSchema.safeParse(camera).success).toBe(true);
    expect(measurementSchema.safeParse({ ...camera, identityEpoch: null }).success).toBe(false);
  });
  it('accepts unavailable/null and rejects server-owned fields at ingress', () => {
    expect(measurementInputSchema.safeParse({ ...input, quality: 'unavailable', value: null }).success).toBe(true);
    for (const field of ['alignedStartAtMs', 'alignedEndAtMs', 'receivedAtMs']) {
      expect(measurementInputSchema.safeParse({ ...input, [field]: 100 }).success).toBe(false);
    }
  });
  it('rejects more than 100 ingest rows and conflicting IDs/stream sequences', () => {
    expect(ingestSchema.safeParse({ measurements: Array.from({ length: 101 }, (_, i) => ({ ...input, id: `m_${i}`, seq: i })), poses: [] }).success).toBe(false);
    expect(ingestSchema.safeParse({ measurements: [input, { ...input, value: 80 }], poses: [] }).success).toBe(false);
    expect(ingestSchema.safeParse({ measurements: [input, { ...input, id: 'other', value: 80 }], poses: [] }).success).toBe(false);
    expect(ingestSchema.safeParse({ measurements: [input, { ...input }], poses: [] }).success).toBe(true);
  });
});
it('rejects oversized original answers without silently truncating', () => {
  expect(answersSchema.safeParse({ reason: 'x'.repeat(501), onset: 'today', onsetNote: '', course: 'same' }).success).toBe(false);
  expect(answersSchema.safeParse({ reason: 'x', onset: 'today', onsetNote: 'x'.repeat(201), course: 'same' }).success).toBe(false);
});
it('accepts every named synthetic snapshot, including always-visible pose/reference states', () => {
  const names = ['emptyRoom','collectingRoom','usableRoom','uncertainIdentityRoom','openRequestRoom','providerFailureRoom','staleCameraRoom','twoVisitsRoom','postureWithoutRequestRoom','checkedRearmingRoom','movedPatientRoom'] as const;
  for (const name of names) {
    const room = fixtures[name];
    expect(roomSnapshotSchema.parse(room)).toEqual(room);
    expect(room.measurements.every(m => m.provenance === 'synthetic')).toBe(true);
    expect(room.poses.every(p => p.provenance === 'synthetic')).toBe(true);
  }
  const pose = fixtures.postureWithoutRequestRoom.poses[0];
  const { alignedAtMs, receivedAtMs, ...poseInput } = pose;
  expect(poseInputSchema.safeParse({ ...poseInput, alignedAtMs: 5 }).success).toBe(false);
});
