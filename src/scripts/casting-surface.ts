import * as THREE from 'three';
import { createSlosh, stepSlosh, surfaceHeight } from './casting-fluid.ts';

/** Small, bounded surface motion for the explanatory cutaway. */
export function createSteelSurface(parent: THREE.Group, width: number, depth: number, level: number, thickness: number, material: THREE.MeshStandardMaterial) {
  const slosh = createSlosh();
  const geometry = new THREE.BoxGeometry(width, thickness, depth, 64, 1, 12);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  positions.setUsage(THREE.DynamicDrawUsage);
  const base = Float32Array.from(positions.array);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'steel-surface';
  mesh.position.y = level - thickness / 2;
  mesh.receiveShadow = true;
  parent.add(mesh);
  const heightAt = (x: number, z: number, seconds: number) => level + surfaceHeight(x, z, seconds, width / 2, depth / 2, slosh);
  return {
    mesh, slosh, heightAt,
    update(seconds: number, dt: number) {
      stepSlosh(slosh, dt);
      for (let i = 0; i < positions.count; i++) {
        if (base[i * 3 + 1] > 0) positions.setY(i, thickness / 2 + heightAt(base[i * 3], base[i * 3 + 2], seconds) - level);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      // Include the maximum permitted displacement in raycast/culling bounds.
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    },
  };
}

/** A fixed particle pool: sparse, short ballistic flecks, with no frame allocations. */
export function createSurfaceSparks(parent: THREE.Group, surfaces: ReturnType<typeof createSteelSurface>[]) {
  const count = 36;
  const geometry = new THREE.SphereGeometry(1, 5, 3);
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'surface-sparks';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  parent.add(mesh);
  const dummy = new THREE.Object3D(), color = new THREE.Color(), velocity = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const random = (n: number) => { const f = Math.sin(n * 127.1 + 31.7) * 43758.5453; return f - Math.floor(f); };
  return {
    update(seconds: number, visible: boolean) {
      mesh.visible = visible;
      if (!visible) return;
      for (let i = 0; i < count; i++) {
        const surface = surfaces[i % surfaces.length];
        const period = 2.7 + random(i + 1) * 2;
        const clock = seconds + random(i + 8) * period;
        const cycle = Math.floor(clock / period), age = clock % period;
        const seed = i * 13 + cycle * 83;
        const lifetime = .42 + random(seed + 4) * .25;
        const { width, depth } = surface.mesh.geometry.parameters;
        const x = (random(seed + 9) - .5) * width * .88;
        const z = (random(seed + 3) - .5) * depth * .8;
        const vx = (random(seed + 6) - .5) * .5, vz = (random(seed + 7) - .5) * .28;
        const vy = .55 + random(seed + 2) * .7;
        const y0 = surface.heightAt(x, z, seconds - age);
        const y = y0 + vy * age - 1.5 * age * age;
        const alive = age < lifetime && y >= surface.heightAt(x + vx * age, z + vz * age, seconds);
        dummy.position.set(x + vx * age, y + .015, z + vz * age);
        velocity.set(vx, vy - 3 * age, vz).normalize();
        dummy.quaternion.setFromUnitVectors(up, velocity);
        const fade = alive ? Math.pow(1 - age / lifetime, .65) : 0;
        dummy.scale.set(.009 * fade, (.028 + random(i) * .025) * fade, .009 * fade);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        color.setRGB(1, .38 + fade * .45, .08 + fade * .4).multiplyScalar(fade);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
