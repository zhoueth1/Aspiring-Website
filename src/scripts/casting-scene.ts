import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFlow } from './casting-flow';
import { createNozzle } from './casting-nozzle';
import { createSteelSurface, createSurfaceSparks } from './casting-surface';
import { disturbSlosh } from './casting-fluid';
import { getCastingFrame } from './casting-camera';

/** Seeded surface detail keeps the steel consistent between visits. */
function surfaceTexture(kind: 'steel' | 'hot' | 'grate' | 'logo') {
  const canvas = document.createElement('canvas');
  canvas.width = kind === 'logo' ? 1024 : 512;
  canvas.height = kind === 'logo' ? 384 : 512;
  const ctx = canvas.getContext('2d')!;
  let seed = 1847;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  if (kind === 'logo') {
    ctx.fillStyle = '#35170f';
    ctx.beginPath(); ctx.moveTo(72, 270); ctx.lineTo(172, 80); ctx.lineTo(202, 80);
    ctx.lineTo(292, 270); ctx.lineTo(226, 270); ctx.lineTo(185, 174); ctx.lineTo(139, 270); ctx.fill();
    ctx.font = '900 94px Arial'; ctx.fillText('ASPIRE', 326, 198);
    ctx.font = '600 48px Arial'; ctx.fillText('L A B S', 332, 264);
  } else if (kind === 'grate') {
    ctx.fillStyle = '#202a2d'; ctx.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 24) for (let y = 0; y < 512; y += 12) {
      ctx.fillStyle = '#070c0e'; ctx.fillRect(x + 3, y + 3, 18, 7);
      ctx.fillStyle = '#768184'; ctx.fillRect(x, y, 2, 12);
    }
  } else {
    ctx.fillStyle = kind === 'hot' ? '#fc692c' : '#596366';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 13000; i++) {
      const value = Math.floor(25 + random() * (kind === 'hot' ? 95 : 145));
      ctx.fillStyle = kind === 'hot'
        ? `rgba(${value + 22},${value * .75},${value * .6},${.12 + random() * .48})`
        : `rgba(${value},${value + 5},${value + 7},${random() * .4})`;
      ctx.fillRect(random() * 512, random() * 512, 1 + random() * 16, 1 + random() * 4);
    }
    for (let i = 0; i < 90; i++) {
      const x = random() * 512, y = random() * 512;
      ctx.strokeStyle = kind === 'hot' ? 'rgba(255,179,76,.4)' : 'rgba(190,199,194,.14)';
      ctx.lineWidth = .4 + random(); ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + random() * 90, y + random() * 4); ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (kind !== 'logo') { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 2); }
  texture.anisotropy = 4;
  return texture;
}

function buildCaster() {
  const root = new THREE.Group();
  const structure = new THREE.Group(); root.add(structure);
  const steelMap = surfaceTexture('steel'), hotMap = surfaceTexture('hot');
  const grateMap = surfaceTexture('grate'), logoMap = surfaceTexture('logo');
  const materials = {
    steel: new THREE.MeshStandardMaterial({ color: '#627174', map: steelMap, metalness: .8, roughness: .65 }),
    dark: new THREE.MeshStandardMaterial({ color: '#242e32', map: steelMap, metalness: .75, roughness: .72 }),
    edge: new THREE.MeshStandardMaterial({ color: '#9da9aa', metalness: .85, roughness: .38 }),
    copper: new THREE.MeshStandardMaterial({ color: '#b96b38', map: steelMap, metalness: .75, roughness: .49 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#cda02c', metalness: .5, roughness: .6 }),
    refractory: new THREE.MeshStandardMaterial({ color: '#62584c', map: steelMap, roughness: .96 }),
    grate: new THREE.MeshStandardMaterial({ color: '#778084', map: grateMap, metalness: .7, roughness: .7 }),
    hot: new THREE.MeshStandardMaterial({ color: '#ff8b32', emissive: '#ff4b0b', emissiveIntensity: 1.6, roughness: .65 }),
    scale: new THREE.MeshStandardMaterial({ map: hotMap, emissiveMap: hotMap, emissive: '#ff6324', emissiveIntensity: .85, roughness: .88, metalness: .25 }),
    pool: new THREE.MeshStandardMaterial({ color: '#ff6a12', emissive: '#ff5008', emissiveIntensity: 1.8, roughness: .4 }),
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, group = structure) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const rod = (a: number[], b: number[], r: number, mat: THREE.Material, group = structure, segments = 8) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, delta.length(), segments), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.position.copy(start.add(end).multiplyScalar(.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    group.add(mesh); return mesh;
  };
  const beam = (x: number, y: number, z: number, h: number) => {
    box(x, y, z, .18, h, .28, materials.dark);
    box(x, y, z + .17, .42, h, .07, materials.steel);
    box(x, y, z - .17, .42, h, .07, materials.steel);
    box(x, y - h / 2, z, .65, .12, .65, materials.edge);
    for (const dx of [-.23, .23]) for (const dz of [-.23, .23])
      rod([x + dx, y - h / 2 + .06, z + dz], [x + dx, y - h / 2 + .13, z + dz], .045, materials.dark, structure, 6);
  };
  const railing = (a: number[], b: number[], height = .82) => {
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    for (const y of [height, height * .48]) rod([a[0], a[1] + y, a[2]], [b[0], b[1] + y, b[2]], .035, materials.yellow);
    const n = Math.max(1, Math.ceil(length / .9));
    for (let i = 0; i <= n; i++) {
      const x = THREE.MathUtils.lerp(a[0], b[0], i / n), z = THREE.MathUtils.lerp(a[2], b[2], i / n);
      rod([x, a[1], z], [x, a[1] + height, z], .035, materials.yellow);
    }
    rod(a, b, .045, materials.yellow);
  };

  // Tundish: open front section, refractory lining, reinforcing bands and lifting lugs.
  box(0, 8.18, 0, 5.5, .3, 2.1, materials.dark);
  box(0, 8.38, 0, 5.04, .17, 1.7, materials.refractory);
  box(0, 8.92, -.94, 5.5, 1.4, .2, materials.steel);
  for (const side of [-1, 1]) {
    box(side * 2.62, 8.9, 0, .26, 1.5, 2.1, materials.steel);
    box(side * 2.4, 8.92, 0, .17, 1.28, 1.73, materials.refractory);
    rod([side * 2.9, 8.2, -.7], [side * 2.9, 9.6, -.7], .1, materials.edge);
    box(side * 2.9, 9.55, -.7, .5, .12, .3, materials.yellow);
  }
  for (const x of [-2, -1, 0, 1, 2]) box(x, 8.93, -1.08, .1, 1.5, .09, materials.edge);
  const tundishFront = box(0, 8.94, 1, 5.5, 1.4, .15, materials.steel.clone(), root);
  (tundishFront.material as THREE.MeshStandardMaterial).transparent = true;
  // Treat the tundish as a constant-level reservoir; no ladle inflow is shown.
  const tundishFloor = 8.38 + .17 / 2, tundishRim = 8.92 + 1.28 / 2;
  const steelDepth = (tundishRim - tundishFloor) * 2 / 3;
  const tundishSurface = createSteelSurface(root, 4.65, 1.65, tundishFloor + steelDepth, steelDepth, materials.pool);
  const pool = tundishSurface.mesh;
  for (const x of [-2.95, 2.95]) {
    beam(x, 4.1, -.75, 8.15);
    box(x, 7.82, 0, .5, .3, 2.5, materials.steel);
  }
  box(0, 7.87, -.75, 6.3, .32, .34, materials.steel);
  rod([-2.8, 3.5, -.75], [2.8, 7.8, -.75], .065, materials.dark);
  rod([2.8, 3.5, -.75], [-2.8, 7.8, -.75], .065, materials.dark);

  // SEN and mold are cut away toward the viewer to expose both rolls on each side.
  createNozzle(root);
  for (const side of [-1, 1]) {
    box(side * 1.84, 5.45, 0, .27, 3.1, 1.1, materials.copper);
    box(side * 2.06, 5.45, 0, .16, 3.25, 1.3, materials.steel);
    for (let y = 4.1; y < 6.9; y += .38) {
      box(side * 2.16, y, .7, .16, .11, .12, materials.edge);
      rod([side * 2.24, y, .1], [side * 2.42, y, .1], .055, materials.copper);
    }
    rod([side * 2.4, 4, -.5], [side * 2.4, 7.1, -.5], .09, materials.edge);
    rod([side * 2.4, 7.1, -.5], [side * 3.3, 7.1, -.5], .09, materials.edge);
  }
  box(0, 5.45, -.51, 3.55, 3.1, .12, materials.copper);
  const meltMaterial = new THREE.MeshStandardMaterial({ color: '#ce3908', emissive: '#f4470a', emissiveIntensity: .65, transparent: true, opacity: .38, depthWrite: false, roughness: .7 });
  const melt = box(0, 5.4, -.27, 3.4, 2.85, .28, meltMaterial, root);
  const moldSurface = createSteelSurface(root, 3.18, .93, 6.83, .045, materials.hot);
  const sparks = createSurfaceSparks(root, [tundishSurface, moldSurface]);
  for (const x of [-1.64, 1.64]) box(x, 5.4, .06, .1, 2.85, .82, materials.scale);
  for (const y of [3.86, 6.98]) box(0, y, -.63, 4.6, .17, 1.5, materials.dark);

  // Cast strand: a rectangular cross section follows the bending segment into the table.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 4.02, 0), new THREE.Vector3(0, 3.05, .06),
    new THREE.Vector3(0, 1.64, .8), new THREE.Vector3(0, .94, 2.4), new THREE.Vector3(0, .94, 4.65),
  ]);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const ringCount = 80;
  for (let i = 0; i <= ringCount; i++) {
    const t = i / ringCount, point = path.getPoint(t), tangent = path.getTangent(t);
    const normal = new THREE.Vector3(0, tangent.z, -tangent.y).normalize().multiplyScalar(.15);
    for (const [x, sign] of [[-1.5, 1], [1.5, 1], [1.5, -1], [-1.5, -1]]) {
      positions.push(x, point.y + normal.y * sign, point.z + normal.z * sign);
      uvs.push(x / 3 + .5, t * 3);
    }
    if (i < ringCount) for (let j = 0; j < 4; j++) {
      const a = i * 4 + j, b = i * 4 + (j + 1) % 4;
      indices.push(a, b, b + 4, a, b + 4, a + 4);
    }
  }
  const strandGeo = new THREE.BufferGeometry();
  strandGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  strandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  strandGeo.setIndex(indices); strandGeo.computeVertexNormals();
  const strandMat = materials.scale.clone(); strandMat.side = THREE.DoubleSide;
  const strand = new THREE.Mesh(strandGeo, strandMat); strand.castShadow = true; root.add(strand);

  const rollers: THREE.Mesh[] = [];
  for (let i = 0; i < 13; i++) {
    const t = (i + .3) / 13, p = path.getPoint(t), tangent = path.getTangent(t);
    const normal = new THREE.Vector3(0, tangent.z, -tangent.y).normalize();
    for (const side of [-1, 1]) {
      const y = p.y + normal.y * .43 * side, z = p.z + normal.z * .43 * side;
      const roller = rod([-1.82, y, z], [1.82, y, z], .22, materials.steel, root, 20);
      rollers.push(roller);
      for (const x of [-1.87, 1.87]) {
        box(x, y, z, .21, .46, .45, materials.dark);
        rod([x - .14, y, z], [x + .14, y, z], .1, materials.edge);
      }
    }
    for (const x of [-2.1, 2.1]) {
      box(x, p.y, p.z, .18, .32, .75, materials.steel);
      if (i % 3 === 0) rod([x, p.y, p.z], [x, .1, p.z], .09, materials.dark);
    }
  }

  // Roller table, drive motors, bearings, foundation and inspection walkways.
  for (let z = 4.6; z <= 11.4; z += .62) {
    const roller = rod([-1.9, .56, z], [1.9, .56, z], .23, materials.steel, root, 24);
    rollers.push(roller);
    for (const x of [-1.98, 1.98]) box(x, .56, z, .26, .45, .48, materials.dark);
    rod([2.1, .56, z], [2.43, .56, z], .15, materials.edge);
    box(2.55, .56, z, .35, .31, .29, materials.dark);
    if (Math.round((z - 4.6) / .62) % 2 === 0) {
      for (const x of [-1.9, 1.9]) beam(x, .17, z, .34);
      for (let x = -1.4; x < 1.6; x += .45) rod([x, .56, z - .02], [x + .055, .56, z - .02], .238, materials.edge, structure, 16);
    }
  }
  for (const x of [-2, 2]) box(x, .27, 7.9, .22, .3, 7.8, materials.steel);
  for (const x of [-3.05, 3.05]) {
    box(x, .24, 6.1, 1.05, .14, 11, materials.grate);
    railing([x + Math.sign(x) * .52, .3, 1], [x + Math.sign(x) * .52, .3, 11.6]);
    for (let z = 1; z < 11.6; z += 1.5) box(x, .1, z, .75, .23, .16, materials.dark);
  }
  // Elevated service decks and access stair, with real guardrails and kick plates.
  for (const x of [-3.3, 3.3]) {
    box(x, 7.65, 0, 1.4, .14, 3, materials.grate);
    railing([x + Math.sign(x) * .7, 7.75, -1.5], [x + Math.sign(x) * .7, 7.75, 1.5]);
    railing([x - .65, 7.75, -1.5], [x + .65, 7.75, -1.5]);
    beam(x, 3.8, -1.3, 7.6);
  }
  for (let i = 0; i < 19; i++) box(-3.35, .4 + i * .385, 7.25 - i * .35, 1.05, .1, .35, materials.grate);
  for (const x of [-3.92, -2.78]) {
    rod([x, 1.2, 7.25], [x, 8.15, .95], .04, materials.yellow);
    rod([x, .4, 7.25], [x, 7.45, .85], .08, materials.steel);
    for (let i = 0; i < 19; i += 3) rod([x, .4 + i * .385, 7.25 - i * .35], [x, 1.2 + i * .385, 7.25 - i * .35], .035, materials.yellow);
  }
  // Pipework, flanged connections and cooling headers.
  for (const side of [-1, 1]) {
    rod([side * 2.55, .5, -.85], [side * 2.55, 6.7, -.85], .12, materials.edge);
    for (const y of [1.2, 3.5, 5.7]) {
      rod([side * 2.55, y - .05, -.85], [side * 2.55, y + .05, -.85], .2, materials.dark);
      rod([side * 2.55, y, -.85], [side * 1.9, y, -.45], .06, materials.edge);
    }
  }
  box(3.32, 1.15, 9.5, .55, 1.1, .4, materials.steel);
  for (let i = 0; i < 3; i++) box(3.32 + (i - 1) * .13, 1.33, 9.715, .055, .055, .02, i === 0 ? materials.hot : materials.yellow);

  const slab = new THREE.Group(); root.add(slab);
  const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(3, .31, 4.8), [materials.hot, materials.hot, materials.scale, materials.hot, materials.hot, materials.hot]);
  slabMesh.castShadow = true;
  slab.add(slabMesh);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.5, .94), new THREE.MeshBasicMaterial({ map: logoMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  logo.rotation.x = -Math.PI / 2;
  logo.position.set(0, .163, .65); slab.add(logo);
  const slabLight = new THREE.PointLight('#ff5318', 35, 8, 2); slabLight.position.set(0, 1.2, 6); root.add(slabLight);
  const moldLight = new THREE.PointLight('#ff6824', 22, 6, 2); moldLight.position.set(0, 6.4, 1.6); root.add(moldLight);
  const flow = createFlow(root, moldSurface.heightAt);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 14), new THREE.MeshStandardMaterial({ color: '#192023', roughness: .95, metalness: .15 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -.12, 5.3); floor.receiveShadow = true; root.add(floor);
  const hazeCanvas = document.createElement('canvas'); hazeCanvas.width = hazeCanvas.height = 128;
  const hazeContext = hazeCanvas.getContext('2d')!;
  const hazeGradient = hazeContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  hazeGradient.addColorStop(0, 'rgba(205,215,214,.35)');
  hazeGradient.addColorStop(.35, 'rgba(170,186,185,.18)'); hazeGradient.addColorStop(1, 'rgba(170,186,185,0)');
  hazeContext.fillStyle = hazeGradient; hazeContext.fillRect(0, 0, 128, 128);
  const hazeTexture = new THREE.CanvasTexture(hazeCanvas);
  const steam = new THREE.Group(); root.add(steam);
  for (let i = 0; i < 18; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTexture, transparent: true, opacity: .3, depthWrite: false, color: '#c4d3d4' }));
    steam.add(sprite);
  }

  // Batch stationary details by material: hundreds of bolts/rails, a handful of draws.
  structure.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  structure.traverse(object => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const list = buckets.get(object.material) ?? []; list.push(geometry); buckets.set(object.material, list);
      object.geometry.dispose();
    }
  });
  structure.clear();
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    if (merged) { const mesh = new THREE.Mesh(merged, material); mesh.castShadow = mesh.receiveShadow = true; structure.add(mesh); }
    geometries.forEach(g => g.dispose());
  }
  return { root, rollers, flow, slab, pool, tundishSurface, moldSurface, sparks, melt, tundishFront, steam, textures: [steelMap, hotMap, grateMap, logoMap, hazeTexture] };
}

export function initCastingExperience() {
  const track = document.querySelector<HTMLElement>('.scroll-track')!;
  const viewport = document.querySelector<HTMLElement>('#casting-viewport')!;
  const canvas = document.querySelector<HTMLCanvasElement>('#casting-canvas')!;
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.story-panel'));
  const chapters = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-jump]'));
  const toggle = document.querySelector<HTMLButtonElement>('.motion-toggle')!;
  const meter = document.querySelector<HTMLElement>('.scroll-meter__bar')!;
  const viewLabel = document.querySelector('#scene-view-label')!;
  const detail = document.querySelector('#scene-detail')!;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = media.matches, progress = 0, activeChapter = -1, disposed = false;
  let renderer: THREE.WebGLRenderer | undefined;
  const cleanup: (() => void)[] = [];
  const on = (target: EventTarget, type: string, handler: EventListener) => {
    target.addEventListener(type, handler); cleanup.push(() => target.removeEventListener(type, handler));
  };
  const updateButton = () => {
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.textContent = paused ? 'Play motion ▷' : 'Pause motion Ⅱ';
  };
  updateButton();
  on(toggle, 'click', () => { paused = !paused; updateButton(); });
  chapters.forEach(button => on(button, 'click', () => {
    const target = track.offsetTop + (track.offsetHeight - window.innerHeight) * Number(button.dataset.jump);
    window.scrollTo({ top: target, behavior: media.matches ? 'instant' : 'smooth' });
  }));
  const showChapter = (p: number) => {
    meter.style.transform = `scaleX(${p})`;
    const index = p < .17 ? 0 : p < .48 ? 1 : p < .76 ? 2 : 3;
    if (index === activeChapter) return;
    activeChapter = index;
    panels.forEach((panel, i) => {
      const active = i === index;
      panel.setAttribute('aria-hidden', String(!active)); panel.inert = !active;
      gsap.to(panel, { autoAlpha: active ? 1 : 0, y: active ? 0 : -12, duration: media.matches ? 0 : .35, overwrite: true });
    });
    chapters.forEach((button, i) => i === index ? button.setAttribute('aria-current', 'step') : button.removeAttribute('aria-current'));
    viewLabel.textContent = ['00 / FRONT ELEVATION', '01 / MOLD SECTION', '02 / STRAND WITHDRAWAL', '03 / ISOMETRIC ASSEMBLY'][index];
    detail.textContent = ['TUNDISH → SUBMERGED ENTRY NOZZLE', 'BUBBLE CAPTURE / NEAR-WALL RISE', 'SECONDARY COOLING → BENDING SEGMENTS', 'HOT SLAB / ASPIRE LABS'][index];
  };
  gsap.registerPlugin(ScrollTrigger);
  const state = { progress: 0 };
  const timeline = gsap.to(state, {
    progress: 1, ease: 'none',
    scrollTrigger: { trigger: track, start: 'top top', end: 'bottom bottom', scrub: media.matches ? true : 1.15 },
    onUpdate: () => { progress = state.progress; showChapter(progress); },
  });
  showChapter(0);
  cleanup.push(() => { timeline.scrollTrigger?.kill(); timeline.kill(); gsap.killTweensOf(panels); });

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-7, 7, 7, -7, .1, 120);
    // The camera orientation stays fixed; the assembly itself rotates into isometric.
    camera.position.set(0, 0, 40); camera.lookAt(0, 0, 0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(); const environment = pmrem.fromScene(room, .04);
    scene.environment = environment.texture; scene.environmentIntensity = .75; room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight('#e2f2ff', '#1c1009', 2.1));
    const key = new THREE.DirectionalLight('#fff1d9', 4); key.position.set(-5, 12, 14); scene.add(key);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.001;
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .5, far: 60 });
    key.shadow.camera.updateProjectionMatrix();
    const rim = new THREE.DirectionalLight('#a3cce1', 3); rim.position.set(6, 8, -5); scene.add(rim);
    const caster = buildCaster(); scene.add(caster.root);
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const lastHit = new THREE.Vector3();
    let overSteel = false;
    const clearPointer = () => { overSteel = false; canvas.classList.remove('is-stirring'); };
    on(canvas, 'pointermove', ((event: PointerEvent) => {
      if (event.pointerType === 'touch' || paused || media.matches || !inView || document.hidden) { clearPointer(); return; }
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      caster.root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(caster.pool, false)[0];
      // The opaque front wall in the final assembly occludes the liquid.
      const frontHit = raycaster.intersectObject(caster.tundishFront, false)[0];
      const blocked = frontHit && hit && frontHit.distance < hit.distance && (caster.tundishFront.material as THREE.MeshStandardMaterial).opacity > .65;
      if (!hit || blocked) { clearPointer(); return; }
      const point = caster.root.worldToLocal(hit.point);
      if (overSteel) disturbSlosh(caster.tundishSurface.slosh, point.x - lastHit.x, point.z - lastHit.z);
      lastHit.copy(point); overSteel = true; canvas.classList.add('is-stirring');
    }) as EventListener);
    on(canvas, 'pointerleave', clearPointer);
    on(canvas, 'pointercancel', clearPointer);
    on(window, 'blur', clearPointer);
    on(window, 'scroll', clearPointer);
    on(toggle, 'click', clearPointer);
    on(media, 'change', clearPointer);
    cleanup.push(clearPointer);
    // Model-space pivot is followed by translation, never by camera orbit.
    const pivot = new THREE.Vector3(), rotatedPivot = new THREE.Vector3();
    let width = 1, height = 1, inView = true, lastTime = 0, seconds = 0;
    const resize = () => {
      clearPointer();
      width = viewport.clientWidth; height = viewport.clientHeight;
      renderer!.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize); observer.observe(viewport); resize();
    const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; }, { rootMargin: '100px' });
    intersection.observe(track);
    const render = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - lastTime) / 1000, .05); lastTime = now;
      if (!inView || document.hidden) return;
      if (!paused) seconds += dt;
      const p = progress;
      const aspect = width / height;
      const { reveal, pullout, halfHeight, pivotY, pivotZ } = getCastingFrame(p, aspect, media.matches);
      // Front view → mold close-up → full isometric caster, with reversible extraction.
      caster.root.rotation.set(reveal * .43, reveal * .66, 0, 'YXZ');
      pivot.set(0, pivotY, pivotZ);
      rotatedPivot.copy(pivot).applyEuler(caster.root.rotation);
      caster.root.position.copy(rotatedPivot).negate();
      // Continuous portrait/landscape framing avoids a step during the pullback.
      camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
      camera.top = halfHeight; camera.bottom = -halfHeight; camera.updateProjectionMatrix();
      const length = .015 + pullout * .985;
      caster.slab.scale.z = length;
      caster.slab.position.set(0, .96, 4.65 + 2.4 * length);
      caster.slab.visible = media.matches || p > .7;
      (caster.tundishFront.material as THREE.MeshStandardMaterial).opacity = .08 + reveal * .92;
      caster.tundishSurface.update(seconds, paused ? 0 : dt);
      caster.moldSurface.update(seconds, paused ? 0 : dt);
      caster.sparks.update(seconds, !media.matches);
      caster.flow.update(seconds, p > .1 && p < .79);
      for (const roller of caster.rollers) if (!paused) roller.rotateY(-dt * .5);
      caster.steam.visible = p > .43 || media.matches;
      caster.steam.children.forEach((object, i) => {
        const rise = (seconds * .13 + i * .137) % 1;
        object.position.set(Math.sin(i * 7.1) * 1.6, 1.4 + rise * 2.1, 1.5 + (i % 6) * .9);
        object.scale.setScalar(.6 + rise * 1.6);
        (object as THREE.Sprite).material.opacity = Math.sin(rise * Math.PI) * .25;
      });
      renderer!.render(scene, camera);
      viewport.dataset.rendered = 'true';
    };
    renderer.setAnimationLoop(render);
    viewport.classList.add('scene-ready');
    on(media, 'change', () => { paused = media.matches; updateButton(); ScrollTrigger.refresh(); });
    on(canvas, 'webglcontextlost', ((event: Event) => {
      event.preventDefault(); renderer?.setAnimationLoop(null); viewport.classList.remove('scene-ready');
      const message = document.querySelector('.fallback-message');
      if (message) message.textContent = 'The 3D view was interrupted. Reload to restore it, or continue through the process below.';
    }) as EventListener);
    cleanup.push(() => {
      observer.disconnect(); intersection.disconnect(); renderer?.setAnimationLoop(null);
      caster.flow.dispose(); environment.dispose();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Sprite) materials.add(object.material);
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
        }
      });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      caster.textures.forEach(t => t.dispose()); renderer?.dispose();
    });
  } catch (error) {
    renderer?.dispose();
    const message = document.querySelector('.fallback-message');
    if (message) message.textContent = 'The 3D view needs WebGL. You can still explore each process chapter and meet the team.';
    toggle.hidden = true;
    console.warn('Casting view unavailable:', error);
  }
  const dispose = () => { if (disposed) return; disposed = true; cleanup.forEach(fn => fn()); };
  on(window, 'pagehide', ((event: PageTransitionEvent) => { if (!event.persisted) dispose(); }) as EventListener);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
