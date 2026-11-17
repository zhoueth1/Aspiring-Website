// Illustrative motion, not CFD. Fixed phases prevent frame-to-frame noise flicker.
export type SloshState = { x: number; z: number; vx: number; vz: number };
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const createSlosh = (): SloshState => ({ x: 0, z: 0, vx: 0, vz: 0 });

export function disturbSlosh(state: SloshState, dx: number, dz: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return;
  state.vx = clamp(state.vx + clamp(dx, -.3, .3) * .24, -.15, .15);
  state.vz = clamp(state.vz + clamp(dz, -.3, .3) * .24, -.15, .15);
}

export function stepSlosh(state: SloshState, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, .05);
  state.vx += (-14 * state.x - 5 * state.vx) * dt;
  state.vz += (-14 * state.z - 5 * state.vz) * dt;
  state.x = clamp(state.x + state.vx * dt, -.045, .045);
  state.z = clamp(state.z + state.vz * dt, -.045, .045);
}

export function surfaceHeight(x: number, z: number, seconds: number, halfWidth: number, halfDepth: number, slosh?: SloshState) {
  const nx = clamp(x / halfWidth, -1, 1), nz = clamp(z / halfDepth, -1, 1);
  const edge = .012 * Math.pow(Math.max(Math.abs(nx), Math.abs(nz)), 16);
  const wave = .008 * Math.sin(x * 3.1 + seconds * 1.35 + .73)
    + .005 * Math.sin(x * 6.7 - z * 3.4 - seconds * 1.83 + 2.19)
    + .003 * Math.sin(x * 11.3 + z * 7.2 + seconds * 2.43 + 5.07);
  return edge + wave + (slosh ? nx * clamp(slosh.x, -.045, .045) + nz * clamp(slosh.z, -.045, .045) : 0);
}
