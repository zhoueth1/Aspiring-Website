import * as THREE from 'three';

export const SEN_PORT_ANGLE = Math.PI / 12;
export const SEN_PORT_X = .29;
export const SEN_PORT_Y = 6.15;

/** Bifurcated refractory SEN, rounded rectangular ports and a closed well bottom.
 * Visual proportions follow Cho et al., AISTech 2016, Fig. 2 / Table 1:
 * https://ccc.illinois.edu/PDF%20Files/Publications/2016_Papers/16_CHO-SM_Nozzle_Port_Angle_Effect_AISTech_reprint%20post.pdf
 * Port roofs and floors descend 15 degrees from horizontal, not the shaft.
 */
export function createNozzle(parent: THREE.Group) {
  const group = new THREE.Group(); group.name = 'submerged-entry-nozzle'; parent.add(group);
  const refractory = new THREE.MeshStandardMaterial({ color: '#9b8c75', roughness: .94 });
  const inner = new THREE.MeshStandardMaterial({ color: '#41352b', roughness: 1, side: THREE.DoubleSide });
  const band = new THREE.MeshStandardMaterial({ color: '#c1ae8d', roughness: .88 });
  const lathe = (profile: number[][], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 48), material);
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  // Hollow bore, thick mounting collar, straight shank and slag-line sleeve.
  lathe([[.16, 6.35], [.16, 8.3], [.34, 8.3], [.34, 8.11], [.24, 8.05], [.225, 7.18], [.255, 7.08], [.255, 6.55], [.29, 6.36]], refractory);
  lathe([[.257, 6.62], [.267, 6.62], [.267, 7.02], [.257, 7.02]], band);
  // Construct the lower barrel around real openings, including recessed tunnel walls.
  const outerR = .29, innerR = .16, halfHeight = .105, halfWidth = .145, corner = .045;
  const slope = Math.tan(SEN_PORT_ANGLE);
  const ringCount = 96;
  const positions: number[] = [], indices: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    const n = positions.length / 3; positions.push(...a, ...b, ...c, ...d); indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const point = (theta: number, r: number, y: number) => [Math.cos(theta) * r, y, Math.sin(theta) * r];
  const opening = (theta: number, r: number, sign: number) => {
    const z = Math.sin(theta) * outerR;
    const round = Math.max(0, Math.abs(z) - (halfWidth - corner));
    const h = halfHeight - corner + Math.sqrt(Math.max(0, corner * corner - round * round));
    return SEN_PORT_Y - slope * (Math.abs(Math.cos(theta) * r) - SEN_PORT_X) + sign * h;
  };
  for (let i = 0; i < ringCount; i++) {
    const a = i / ringCount * Math.PI * 2, b = (i + 1) / ringCount * Math.PI * 2;
    const open = Math.abs(Math.sin((a + b) / 2) * outerR) < halfWidth;
    for (const r of [outerR, innerR]) {
      if (open) {
        quad(point(a, r, 5.91), point(b, r, 5.91), point(b, r, opening(b, r, -1)), point(a, r, opening(a, r, -1)));
        quad(point(a, r, opening(a, r, 1)), point(b, r, opening(b, r, 1)), point(b, r, 6.36), point(a, r, 6.36));
      } else quad(point(a, r, 5.91), point(b, r, 5.91), point(b, r, 6.36), point(a, r, 6.36));
    }
    if (open) for (const s of [-1, 1]) {
      quad(point(a, innerR, opening(a, innerR, s)), point(b, innerR, opening(b, innerR, s)), point(b, outerR, opening(b, outerR, s)), point(a, outerR, opening(a, outerR, s)));
    }
    const nextOpen = Math.abs(Math.sin(b + Math.PI / ringCount) * outerR) < halfWidth;
    if (open !== nextOpen) quad(point(b, innerR, opening(b, innerR, -1)), point(b, outerR, opening(b, outerR, -1)), point(b, outerR, opening(b, outerR, 1)), point(b, innerR, opening(b, innerR, 1)));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const headMaterial = refractory.clone(); headMaterial.side = THREE.DoubleSide;
  const head = new THREE.Mesh(geometry, headMaterial); head.castShadow = head.receiveShadow = true; group.add(head);
  lathe([[0, 5.88], [.22, 5.88], [.29, 5.95], [.29, 6.01], [.16, 6.01], [.12, 5.98], [0, 5.98]], inner);
  return group;
}
