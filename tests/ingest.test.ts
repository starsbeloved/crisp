import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EchoEngine } from '../server/src/events/engine.ts';
import { validateSample } from '../packages/contracts/src/index.ts';

export function sample(overrides = {}) {
  return {
    schemaVersion: 1, deviceId: 'test-phone', bootId: 'boot-1', seq: 0,
    sourceMonotonicMs: 0, channel: 'accel_total_x', value: 1,
    unit: 'm/s2', quality: 'good', provenance: 'live_phone', ...overrides,
  };
}

test('ingest rejects nonfinite values and a channel with the wrong unit', () => {
  assert.throws(() => validateSample(sample({ value: Infinity })), /value/);
  assert.throws(() => validateSample(sample({ unit: 'g' })), /unit/);
  assert.throws(() => validateSample(sample({ value: null })), /value/);
  assert.equal(validateSample(sample({ value: null, quality: 'unavailable' })).value, null);
});

test('ingest requires original source information for dataset replay', () => {
  assert.throws(() => validateSample(sample({ provenance: 'dataset_replay' })), /replay/);
});

test('ingest isolates sessions and deduplicates retried observations', () => {
  const engine = new EchoEngine(':memory:', () => 1_000_000);
  try {
    engine.createSession('a'); engine.createSession('b');
    assert.equal(engine.ingestSamples('a', [sample()]).accepted, 1);
    assert.equal(engine.ingestSamples('a', [sample()]).duplicates, 1);
    assert.equal(engine.getLive('a').samples.length, 1);
    assert.equal(engine.getLive('b').samples.length, 0);
    assert.throws(() => engine.getLive('unknown'), /session/);
  } finally { engine.close(); }
});

test('ingest aligns a batch to receipt and rejects clock reversal without poisoning a valid retry', () => {
  let now = 1_000_000;
  const engine = new EchoEngine(':memory:', () => now);
  try {
    engine.createSession('a');
    engine.ingestSamples('a', [sample(), sample({ seq: 1, sourceMonotonicMs: 1000 })]);
    assert.deepEqual(engine.getLive('a').samples.map(s => s.alignedAtMs), [999_000, 1_000_000]);
    now += 1000;
    assert.throws(() => engine.ingestSamples('a', [sample({ seq: 2, sourceMonotonicMs: 500 })]), /clock/);
    assert.equal(engine.ingestSamples('a', [sample({ seq: 2, sourceMonotonicMs: 2000 })]).accepted, 1);
  } finally { engine.close(); }
});

test('ingest validates the whole batch before accepting any observations', () => {
  const engine = new EchoEngine(':memory:', () => 1_000_000);
  try {
    engine.createSession('a');
    assert.throws(() => engine.ingestSamples('a', [sample(), sample({ seq: 1, value: 'bad' })]), /value/);
    assert.equal(engine.getLive('a').samples.length, 0);
    assert.equal(engine.ingestSamples('a', [sample()]).accepted, 1);
  } finally { engine.close(); }
});
