import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlosh, disturbSlosh, stepSlosh, surfaceHeight } from '../src/scripts/casting-fluid.ts';

test('natural meniscus is repeatable, slowly changing and bounded over the vessel', () => {
  let changed = false;
  for (let t = 0; t < 20; t += .37) for (let x = -2.325; x <= 2.325; x += .2) for (let z = -.825; z <= .825; z += .2) {
    const h = surfaceHeight(x, z, t, 2.325, .825);
    assert.equal(h, surfaceHeight(x, z, t, 2.325, .825));
    assert.ok(Math.abs(h) <= .031);
    const next = surfaceHeight(x, z, t + 1 / 60, 2.325, .825);
    assert.ok(Math.abs(next - h) < .001, 'surface must not flicker');
    changed ||= next !== h;
  }
  assert.ok(changed);
});

test('cursor impulses are directional, bounded, pauseable and settle', () => {
  const a = createSlosh(), b = createSlosh();
  disturbSlosh(a, 1, -.5); disturbSlosh(b, -1, .5);
  const frozen = { ...a }; stepSlosh(a, 0); assert.deepEqual(a, frozen);
  stepSlosh(a, 1 / 60); stepSlosh(b, 1 / 60);
  assert.ok(a.x > 0 && a.z < 0);
  assert.equal(a.x, -b.x); assert.equal(a.z, -b.z);
  for (let i = 0; i < 1200; i++) stepSlosh(a, 1 / 60);
  for (const value of Object.values(a)) assert.ok(Math.abs(value) < 1e-5);
  for (let i = 0; i < 3600; i++) {
    disturbSlosh(b, 100 * Math.sin(i), 100 * Math.cos(i));
    assert.ok(Math.abs(b.vx) <= .15 && Math.abs(b.vz) <= .15);
    stepSlosh(b, 1 / 60);
    assert.ok(Object.values(b).every(Number.isFinite));
    assert.ok(Math.abs(b.x) <= .045 && Math.abs(b.z) <= .045);
    assert.ok(Math.abs(surfaceHeight(2.325, .825, i / 60, 2.325, .825, b)) <= .121);
  }
  const before = { ...b };
  disturbSlosh(b, NaN, Infinity); stepSlosh(b, NaN); stepSlosh(b, -1);
  assert.deepEqual(b, before);
});
