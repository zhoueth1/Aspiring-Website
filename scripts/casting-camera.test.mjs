import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCastingFrame } from '../src/scripts/casting-camera.ts';

const aspects = [.4, .75, 1, 1.8, 2.5];

test('camera preserves the overview and final framing on portrait and landscape', () => {
  for (const aspect of aspects) {
    assert.deepEqual(getCastingFrame(0, aspect), { reveal: 0, pullout: 0, halfHeight: Math.max(5.9, 4.3 / aspect), pivotY: 6.7, pivotZ: 0 });
    const final = getCastingFrame(1, aspect);
    assert.equal(final.reveal, 1); assert.equal(final.pullout, 1);
    assert.ok(Math.abs(final.halfHeight - Math.max(7.9, 8.5 / aspect)) < 1e-12);
    assert.ok(Math.abs(final.pivotY - 4.6) < 1e-12); assert.equal(final.pivotZ, 3.3);
  }
});

test('no scroll position causes a framing jump; the pullback stays gradual', () => {
  for (const aspect of aspects) {
    let previous = getCastingFrame(0, aspect);
    for (let i = 1; i <= 10000; i++) {
      const progress = i / 10000, frame = getCastingFrame(progress, aspect);
      assert.ok(Object.values(frame).every(Number.isFinite));
      assert.ok(Math.abs(frame.halfHeight / previous.halfHeight - 1) < .001, `zoom jumped at ${progress}, aspect ${aspect}`);
      assert.ok(Math.abs(frame.pivotY - previous.pivotY) < .002);
      assert.ok(Math.abs(frame.pivotZ - previous.pivotZ) < .002);
      if (progress >= .36) assert.ok(frame.halfHeight >= previous.halfHeight - 1e-12);
      previous = frame;
    }
  }
});

test('reduced motion is fully composed; reversing scroll returns to the same frame', () => {
  for (const aspect of aspects) {
    const samples = [0, .2, .36, .53, .7, .95, 1];
    const forward = samples.map(p => getCastingFrame(p, aspect));
    for (let i = samples.length - 1; i >= 0; i--) {
      assert.deepEqual(getCastingFrame(samples[i], aspect), forward[i]);
      assert.deepEqual(getCastingFrame(samples[i], aspect, true), getCastingFrame(1, aspect, true));
    }
  }
});
