import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BUBBLE_PATHS, createFlow, buildBubblePaths, findBubbleExit, sampleBubblePath, MOLD_WALL, IMPINGEMENT_Y, BUBBLE_CUTOFF_Y } from '../src/scripts/casting-flow.ts';
import { surfaceHeight } from '../src/scripts/casting-fluid.ts';

test('mirrored jets leave 15 degrees downward and never enter a deep return loop', () => {
  assert.equal(BUBBLE_PATHS.length, 6);
  const paths = buildBubblePaths(), point = new THREE.Vector3();
  BUBBLE_PATHS.forEach((path, i) => {
    const side = i < 3 ? -1 : 1;
    assert.ok((path[1][0] - path[0][0]) * side > 0);
    const angle = Math.atan2(path[0][1] - path[1][1], Math.abs(path[1][0] - path[0][0]));
    assert.ok(Math.abs(angle - Math.PI / 12) < 1e-10);
    for (let t = 0; t <= 1; t += .001) {
      sampleBubblePath(paths[i], t, point);
      assert.ok(point.y > BUBBLE_CUTOFF_Y, `bubble returned below cutoff: ${point.y}`);
      if (i % 3 === 1 && point.y >= 6.2) {
        assert.ok(Math.abs(point.x) > 1.43 && Math.abs(point.x) < 1.54, 'rising bubbles must hug the wall');
      }
    }
  });
  for (let i = 0; i < 3; i++) BUBBLE_PATHS[i].forEach((point, j) => {
    assert.equal(point[0], -BUBBLE_PATHS[i + 3][j][0]);
    assert.deepEqual(point.slice(1), BUBBLE_PATHS[i + 3][j].slice(1));
  });
});

test('lower paths hit the wall below impingement; only the near-wall upper path reaches the meniscus', () => {
  const paths = buildBubblePaths(), point = new THREE.Vector3();
  const heightAt = (x, z, t) => 6.83 + surfaceHeight(x, z, t, 1.59, .465);
  for (const birth of [0, 3.6, 17, 99]) for (const radius of [.017, .031]) paths.forEach((path, i) => {
    const duration = i % 3 === 1 ? 4.8 : 3.6;
    const exit = findBubbleExit(path, radius, heightAt, birth, duration);
    assert.equal(exit.surface, i % 3 === 1, `wrong boundary for path ${i}`);
    assert.ok(exit.phase > 0 && exit.phase < 1);
    if (!exit.surface) {
      assert.ok(exit.y < IMPINGEMENT_Y && exit.y - radius > BUBBLE_CUTOFF_Y);
    } else assert.ok(Math.abs(exit.x) > 1.43);
    for (let t = 0; t < exit.phase - .0001; t += .002) {
      sampleBubblePath(path, t, point);
      assert.ok(Math.abs(point.x) + radius < MOLD_WALL);
      assert.ok(point.y + radius < heightAt(point.x, point.z, birth + t * duration));
    }
    const gap = exit.surface ? exit.y + radius - heightAt(exit.x, exit.z, birth + exit.phase * duration) : Math.abs(exit.x) + radius - MOLD_WALL;
    assert.ok(Math.abs(gap) < .00002);
  });
});

test('descending bubbles cling then shrink and disappear at the wall, without a surface pop', () => {
  const parent = new THREE.Group(), flow = createFlow(parent);
  const [bubbles, rings] = parent.children[0].children;
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  const previous = [];
  let sawHold = false, sawShrink = false, sawDelete = false, sawPop = false;
  for (let t = 0; t < 14; t += .02) {
    flow.update(t, true);
    for (let i = 0; i < bubbles.count; i++) {
      bubbles.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
      const alive = scale.x > .00001;
      const atWall = alive && Math.abs(Math.abs(position.x) + scale.x - MOLD_WALL) < 1e-6;
      const prev = previous[i];
      if (alive) {
        assert.ok(Math.abs(position.x) + scale.x <= MOLD_WALL + 1e-6);
        assert.ok(position.y - scale.y > BUBBLE_CUTOFF_Y);
      }
      if (atWall && prev?.atWall) {
        assert.ok(Math.abs(position.y - prev.y) < 1e-6, 'captured bubble must stop descending');
        sawHold ||= Math.abs(scale.x - prev.radius) < 1e-8;
        sawShrink ||= scale.x < prev.radius - 1e-6;
      }
      sawDelete ||= !!prev?.atWall && !alive;
      previous[i] = { atWall, y: position.y, radius: scale.x };
      rings.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
      if (Math.floor(i / 16) % 3 !== 1) assert.equal(scale.x, 0, 'wall capture must not pop at the meniscus');
      else if (scale.x > 0) { sawPop = true; assert.ok(Math.abs(position.y - 6.838) < 1e-5 && Math.abs(position.x) > 1.43); }
    }
  }
  assert.ok(sawHold && sawShrink && sawDelete && sawPop); flow.dispose();
});

test('bubbles use absolute elapsed time, remain finite, hide and dispose cleanly', () => {
  const parent = new THREE.Group(), flow = createFlow(parent);
  const group = parent.children[0], mesh = group.children[0];
  flow.update(8, true);
  const first = mesh.instanceMatrix.array.slice();
  flow.update(9, true); assert.notDeepEqual(mesh.instanceMatrix.array, first);
  flow.update(8, true); assert.deepEqual(mesh.instanceMatrix.array, first);
  assert.ok(first.every(Number.isFinite));
  flow.update(10, false); assert.equal(group.visible, false);
  flow.dispose(); assert.equal(parent.children.length, 0);
});
