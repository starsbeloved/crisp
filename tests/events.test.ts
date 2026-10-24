import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EchoEngine } from '../server/src/events/engine.ts';

const reading = (seq: number, ms: number, value = 1) => ({
  schemaVersion: 1, deviceId: 'phone', bootId: 'one', seq,
  sourceMonotonicMs: ms, channel: 'accel_total_x', value, unit: 'm/s2',
  quality: 'good', provenance: 'live_phone',
});

test('events preserve earlier samples, label short history and stay immutable after later input', () => {
  let now = 1_000_000;
  const engine = new EchoEngine(':memory:', () => now);
  try {
    engine.createSession('a');
    engine.ingestSamples('a', [reading(0, 0)]);
    now += 10_000;
    engine.ingestSamples('a', [reading(1, 10_000, 4)]);
    const event = engine.captureEvent('a', { requestId: 'mark-1', method: 'manual', label: 'headache' });
    assert.equal(event.samples.length, 2);
    assert.equal(event.actualDurationMs, 10_000);
    assert.equal(event.requestedDurationMs, 600_000);
    assert.equal(event.coverage.accel_total_x.usableBins, 2);
    assert.ok(event.coverage.accel_total_x.fraction < 0.01);
    now += 1000;
    engine.ingestSamples('a', [reading(2, 11_000, 9)]);
    event.samples[0].value = 999;
    assert.deepEqual(engine.getEvent('a', event.id).samples.map(s => s.value), [1, 4]);
    assert.equal(engine.getLive('a').samples.length, 3);
    assert.throws(() => engine.getEvent('b', event.id), /session/);
  } finally { engine.close(); }
});

test('events expire unsaved samples at the ten-minute boundary and show empty coverage honestly', () => {
  let now = 1_000_000;
  const engine = new EchoEngine(':memory:', () => now);
  try {
    engine.createSession('a'); engine.ingestSamples('a', [reading(0, 0)]);
    now += 600_001;
    assert.equal(engine.getLive('a').samples.length, 0);
    const event = engine.captureEvent('a', { requestId: 'empty', method: 'manual' });
    assert.equal(event.actualStartMs, null);
    assert.equal(event.actualDurationMs, 0);
    assert.deepEqual(event.coverage, {});
  } finally { engine.close(); }
});

test('events survive restart and idempotent retries return the original event', () => {
  const directory = mkdtempSync(join(tmpdir(), 'echo-event-test-'));
  const path = join(directory, 'events.sqlite');
  let engine = new EchoEngine(path, () => 1_000_000);
  engine.createSession('a'); engine.ingestSamples('a', [reading(0, 0)]);
  const saved = engine.captureEvent('a', { requestId: 'retry', method: 'manual' });
  engine.close();
  engine = new EchoEngine(path, () => 2_000_000);
  try {
    assert.equal(engine.getLive('a').samples.length, 0);
    assert.equal(engine.captureEvent('a', { requestId: 'retry', method: 'manual' }).id, saved.id);
    assert.equal(engine.listEvents('a').length, 1);
    assert.equal(engine.getEvent('a', saved.id).samples.length, 1);
  } finally { engine.close(); }
});
