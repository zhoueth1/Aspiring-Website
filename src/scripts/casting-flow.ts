import * as THREE from 'three';
import { SEN_PORT_ANGLE, SEN_PORT_X, SEN_PORT_Y } from './casting-nozzle.ts';

// Illustrative bubble transport, not a CFD or argon transport calculation.
const jetY = (x: number) => SEN_PORT_Y - (x - SEN_PORT_X) * Math.tan(SEN_PORT_ANGLE);
export const MOLD_WALL = 1.59; // Inner surface of the solidifying narrow-face shell.
export const IMPINGEMENT_Y = jetY(MOLD_WALL);
export const BUBBLE_CUTOFF_Y = IMPINGEMENT_Y - .34;
export const WALL_STICK_SECONDS = .24;
export const WALL_FADE_SECONDS = .18;

// Descending branches terminate just below impingement; no deep return loop.
// The rising branch turns upward alongside the wall, without drifting inward.
export const BUBBLE_PATHS = [-1, 1].flatMap(side => [
  [[SEN_PORT_X, SEN_PORT_Y], [.85, jetY(.85)], [1.43, jetY(1.43)], [1.51, IMPINGEMENT_Y - .04], [1.72, IMPINGEMENT_Y - .18]],
  [[SEN_PORT_X, SEN_PORT_Y], [.85, jetY(.85)], [1.43, jetY(1.43)], [1.49, 6.04], [1.49, 6.4], [1.49, 6.96]],
  [[SEN_PORT_X, SEN_PORT_Y], [.85, jetY(.85)], [1.43, jetY(1.43)], [1.50, IMPINGEMENT_Y - .12], [1.51, BUBBLE_CUTOFF_Y + .09], [1.72, BUBBLE_CUTOFF_Y + .06]],
].map(points => points.map(([x, y]) => [x * side, y, .08] as [number, number, number])));

type HeightAt = (x: number, z: number, seconds: number) => number;
type Exit = { phase: number; x: number; y: number; z: number; surface: boolean };
const samples = 256;

export function sampleBubblePath(path: Float32Array, phase: number, point: THREE.Vector3) {
  const cursor = THREE.MathUtils.clamp(phase, 0, 1) * samples;
  const a = Math.min(samples - 1, Math.floor(cursor)) * 3, mix = cursor - a / 3;
  point.set(THREE.MathUtils.lerp(path[a], path[a + 3], mix), THREE.MathUtils.lerp(path[a + 1], path[a + 4], mix), THREE.MathUtils.lerp(path[a + 2], path[a + 5], mix));
  return point;
}

export function buildBubblePaths() {
  return BUBBLE_PATHS.map(points => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
    const data = new Float32Array((samples + 1) * 3), point = new THREE.Vector3();
    for (let i = 0; i <= samples; i++) { curve.getPointAt(i / samples, point); point.toArray(data, i * 3); }
    return data;
  });
}

/** Swept first contact at birth-relative time, cached for the entire bubble life. */
export function findBubbleExit(path: Float32Array, radius: number, heightAt: HeightAt, birth: number, duration: number): Exit {
  const p = new THREE.Vector3();
  const contact = (t: number) => {
    sampleBubblePath(path, t, p);
    return Math.abs(p.x) + radius >= MOLD_WALL || p.y + radius >= heightAt(p.x, p.z, birth + t * duration);
  };
  for (let i = 1; i <= samples; i++) if (contact(i / samples)) {
    let low = (i - 1) / samples, high = i / samples;
    for (let j = 0; j < 12; j++) { const mid = (low + high) / 2; if (contact(mid)) high = mid; else low = mid; }
    contact(high);
    return { phase: high, x: p.x, y: p.y, z: p.z, surface: Math.abs(p.x) + radius < MOLD_WALL };
  }
  sampleBubblePath(path, 1, p);
  return { phase: 1, x: p.x, y: p.y, z: p.z, surface: false };
}

export function createFlow(parent: THREE.Group, heightAt: HeightAt = () => 6.83) {
  const group = new THREE.Group(); parent.add(group);
  const paths = buildBubblePaths(), perPath = 16, count = paths.length * perPath;
  const geometry = new THREE.SphereGeometry(1, 8, 6);
  const material = new THREE.MeshStandardMaterial({ color: '#fff2c5', emissive: '#ffcf8d', emissiveIntensity: .6, roughness: .25, metalness: .15 });
  const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = 'mold-bubbles';
  const ringGeo = new THREE.TorusGeometry(1, .08, 4, 20);
  const popMaterial = new THREE.MeshBasicMaterial({ color: '#ffda99', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const rings = new THREE.InstancedMesh(ringGeo, popMaterial, count); rings.name = 'meniscus-pops';
  const drops = new THREE.InstancedMesh(geometry, popMaterial, count * 3);
  for (const object of [mesh, rings, drops]) { object.instanceMatrix.setUsage(THREE.DynamicDrawUsage); object.frustumCulled = false; group.add(object); }
  const dummy = new THREE.Object3D(), point = new THREE.Vector3(), color = new THREE.Color();
  const cache: { cycle: number; exit: Exit }[] = [];
  return {
    update(seconds: number, visible: boolean) {
      group.visible = visible;
      if (!visible) return;
      for (let index = 0; index < count; index++) {
        const pathIndex = Math.floor(index / perPath), i = index % perPath;
        const seed = ((i * 73 + pathIndex * 31) % 101) / 101;
        const radius = .017 + seed * .014;
        const duration = (pathIndex % 3 === 0 ? 3.1 : pathIndex % 3 === 1 ? 4.8 : 3.6) * (.88 + seed * .24);
        const period = duration + .65, offset = i / perPath * period;
        const cycle = Math.floor((seconds + offset) / period), birth = cycle * period - offset;
        const age = seconds - birth;
        if (!cache[index] || cache[index].cycle !== cycle) cache[index] = { cycle, exit: findBubbleExit(paths[pathIndex], radius, heightAt, birth, duration) };
        const exit = cache[index].exit, death = exit.phase * duration, alive = age < death;
        sampleBubblePath(paths[pathIndex], Math.min(age / duration, exit.phase), point);
        const wallAge = age - death;
        const attached = !exit.surface && wallAge >= 0 && wallAge < WALL_STICK_SECONDS + WALL_FADE_SECONDS;
        const wallScale = attached ? 1 - Math.max(0, wallAge - WALL_STICK_SECONDS) / WALL_FADE_SECONDS : 0;
        // Stop at first contact, briefly cling, then shrink into the narrow face.
        // No descending bubble continues around the lower recirculation roll.
        if (attached) point.set(Math.sign(exit.x) * (MOLD_WALL - radius * wallScale), exit.y, exit.z);
        dummy.position.copy(point); dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(radius * (alive ? Math.min(1, age / .12) : wallScale));
        dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
        const popAge = age - death, pop = exit.surface && popAge >= 0 && popAge < .32;
        const fade = pop ? 1 - popAge / .32 : 0;
        const surfaceY = heightAt(exit.x, exit.z, seconds);
        dummy.position.set(exit.x, surfaceY + .008, exit.z);
        dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.setScalar(pop ? radius + popAge * .2 : 0);
        dummy.updateMatrix(); rings.setMatrixAt(index, dummy.matrix);
        color.setRGB(fade, fade, fade); rings.setColorAt(index, color);
        for (let j = 0; j < 3; j++) {
          const angle = j * Math.PI * 2 / 3 + seed * 6;
          dummy.position.set(exit.x + Math.cos(angle) * popAge * .12, surfaceY + .015 + popAge * .4 - popAge * popAge * 1.1, exit.z + Math.sin(angle) * popAge * .12);
          dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(pop ? .009 * fade : 0);
          dummy.updateMatrix(); drops.setMatrixAt(index * 3 + j, dummy.matrix);
        }
      }
      for (const object of [mesh, rings, drops]) object.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    },
    dispose() { parent.remove(group); geometry.dispose(); ringGeo.dispose(); material.dispose(); popMaterial.dispose(); },
  };
}
