# ASPIRE Labs

An Astro site with a scroll-driven Three.js continuous casting model. GSAP controls the narrative and normalized scroll progress; the **casting assembly rotates**, while the orthographic camera retains its orientation.

## Local development

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Astro. Scroll through the process or use the four chapter buttons. **Pause motion** stops bubbles, steam, surface movement, and roll rotation; the scroll-linked sequence remains navigable.

## Checks

```powershell
npm.cmd run build
node node_modules/typescript/bin/tsc --noEmit
node --test scripts/casting-flow.test.mjs scripts/casting-fluid.test.mjs scripts/casting-camera.test.mjs
```

The geometry tests use Node's native TypeScript support (Node 22.18+). They check near-wall bubble rise, capture and deletion below impingement, bounded sloshing, continuous camera framing, deterministic particle updates, and disposal. They do not verify WebGL rendering.

## Scene

- `src/scripts/casting-scene.ts`: procedural industrial geometry, worn steel/oxide textures, branding, lighting, steam, model rotation, and slab withdrawal.
- `src/scripts/casting-flow.ts`: instanced bubbles on mirrored jets, wall capture below impingement, and near-wall rise to the meniscus.
- `src/pages/index.astro`: accessible chapter content and retained team data.
- `src/styles/global.css`: desktop/mobile layout and reduced-motion treatment.

The model uses an open mold section so the flow is visible. The tundish is a constant-level, two-thirds-full reservoir. Bubbles cling and disappear at the narrow walls below jet impingement, or rise beside the wall to the meniscus; it is not a CFD simulation, a gas-buoyancy model, or a dimensioned engineering design. Background reading: [ISIJ International — Design of a Submerged Entry Nozzle for Thin Slab Molds Operating at High Casting Speeds](https://www.jstage.jst.go.jp/article/isijinternational/52/9/52_1607/_article).

Reduced-motion preference selects a stationary isometric model with ambient motion initially paused. A text diagram and all chapter controls remain available when WebGL is unavailable. Existing team names, biographies, and placeholder social links are retained from the original prototype.

Textures and the ASPIRE LABS slab wordmark are generated locally; there are no external model, image, or font requests. The particle system uses instancing, and stationary machinery is merged by material to limit draw calls.
