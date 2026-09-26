// Lanyard preview in 3D: a strap hanging straight down to a swivel snap hook,
// the hook through the slot of a blank badge whose top only shows — the rest runs
// off the bottom of the view. Everything turns together around the strap, like
// the business card: drag to turn, a flick settles on a side (the logo outside,
// the pattern inside), a sway at rest. A rig on the shared card scene
// (business-card-3d.ts): the scene's card is the badge. Plain three.js, no React
// Three Fiber (its JSX types break Fluid's). Scene units are centimeters.
// Loaded on demand by lanyard-preview.tsx, with three.js.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { withBase } from "@/lib/base-path";
import { CARD_SLOT, STRAP_WIDTH_MM, lanyardDesigns, type LanyardDesign } from "@/lib/lanyard";
import type { CardRig, RigContext } from "./business-card-3d";
import { stepSpin } from "./business-card-spin";

export interface LanyardRig extends CardRig {
  setDesign: (design: LanyardDesign) => void;
}

const FOV = 30;
/** The scale: a 500 px tall view holds this much, cm — the badge below its top
 *  edge (the slot, none of the printed face; it sits in the preview's bottom
 *  fade) and the strap above the hook's ring. Any stage height keeps it: the badge stays at the bottom, a taller
 *  stage shows more strap. */
const VIEW = { badge: 3.2, strap: 19 };
const FULL_STAGE = 500;
/** The strap is one loop through the hook's ring, as in the Figma renders: the
 *  front strand comes down, wraps under the ring's top bar and goes back up
 *  behind — so the front shows the outside (the logo), the back strand its
 *  inside (the pattern). Where each strand is at the top of the view, cm across
 *  and back from the ring. */
const STRAND_TOPS = { front: { x: 0.95, z: 0.1 }, back: { x: -1.15, z: -0.5 } };
/** Strap thickness, cm: woven polyester, about 0.8 mm. */
const STRAP_THICKNESS = 0.08;
/** The ring's top bar in the model (a flat oval wire), from HOOK_TOP: its
 *  center a little higher, its half height and half depth — in model units. */
const BAR = { y: 0.0027, halfHeight: 0.0057, halfDepth: 0.0147 };
/** Strap width, cm. */
const STRAP_WIDTH = STRAP_WIDTH_MM / 10;
/** Strap texture: 5896 × 256 px (the Figma artwork exported at 4×), the
 *  width across the strap. */
const TEXTURE_ASPECT = 1474 / 64;

// Hardware: a swivel snap hook, a 3D model (clip and clamp, loaded on demand),
// in dark polished metal with its own softbox reflections.
const METAL = { color: "#5c5e63", metalness: 1, roughness: 0.27 };

/** Reflections for the metal: bright strips on black, like studio softboxes
 *  (drei's Lightformers in Vercel's badge) — the soft room light alone leaves
 *  polished metal flat grey. */
function metalEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const lights = new THREE.Scene();
  lights.background = new THREE.Color("#060606");
  const strip = (intensity: number, x: number, y: number, z: number, rz: number, w: number, h: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    m.rotateZ(rz);
    lights.add(m);
  };
  strip(2, 0, -1, 5, Math.PI / 3, 100, 0.1);
  strip(3, -1, -1, 1, Math.PI / 3, 100, 0.1);
  strip(3, 1, 1, 1, Math.PI / 3, 100, 0.1);
  strip(10, -10, 0, 14, Math.PI / 3, 100, 10);
  strip(1.5, 0, 8, 0, 0, 12, 12);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(lights, 0.02).texture;
  pmrem.dispose();
  lights.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return env;
}

/** Woven polyester: fine ribs along the strap and a finer cross weave, as a
 *  bump map. */
function weave(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 16;
  const g = c.getContext("2d")!;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const v = 0.55 + 0.3 * Math.sin((y / c.height) * Math.PI * 2) + 0.12 * Math.sin((x / c.width) * Math.PI * 2);
      const b = Math.round(Math.max(0, Math.min(1, v)) * 255);
      g.fillStyle = `rgb(${b},${b},${b})`;
      g.fillRect(x, y, 1, 1);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function texture(url: string, tiled: boolean): THREE.Texture {
  const t = new THREE.TextureLoader().load(withBase(url));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  if (tiled) t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Strap artwork from the Figma file: the logo outside (a strip that repeats
 *  along the strap), the pattern inside (one tile of the pattern's grid). */
const TEXTURES: Record<LanyardDesign, { front: string; inner: string }> = {
  light: { front: "/lanyard/strap-front-light.png", inner: "/lanyard/strap-pattern-light.png" },
  dark: { front: "/lanyard/strap-front-dark.png", inner: "/lanyard/strap-pattern-dark.png" },
};

/** The inside pattern as the Figma symbol builds it: the tile ("Project Logo
 *  1", 219.28 × 125.51) in a grid turned 45° across the 1474 × 64 strip (the
 *  grid frame's transform in the symbol). Mapping the strap into that grid, the
 *  pattern runs on without seams over any length. */
const PATTERN = {
  strip: 64,
  tile: { width: 219.28196716308594, height: 125.50543212890625 },
  grid: {
    a: 0.7071019411087036, b: -0.7071019411087036, tx: 507.13604736328125,
    c: 0.7071115970611572, d: 0.7071115970611572, ty: -1906.8492431640625,
  },
};

/** Tile UV of a point of the strip, in the symbol's pixels (x along, y down). */
function patternUv(x: number, y: number): [number, number] {
  const { a, b, c, d, tx, ty } = PATTERN.grid;
  const det = a * d - b * c;
  const px = x - tx;
  const py = y - ty;
  const gx = (d * px - b * py) / det;
  const gy = (-c * px + a * py) / det;
  // The tile image's top row is v = 1
  return [gx / PATTERN.tile.width, 1 - gy / PATTERN.tile.height];
}

/** The snap hook model (public/lanyard/snap-hook.glb: the clip — ring and
 *  swivel — and the clamp — the hook), in its own units where the badge it was
 *  made for is 1 tall. The hook's lower arc rests at HOOK_REST, the strap
 *  meets the ring's top bar at HOOK_TOP. */
const HOOK_MODEL = "/lanyard/snap-hook.glb";
const HOOK_REST = 0.944;
const HOOK_TOP = 1.221;
/** Model units → cm: the hook about 41 mm long. */
const HOOK_SCALE = 14;
/** The ring widened along its bar for the strap, as hooks for wide straps are:
 *  at HOOK_SCALE its opening is about 16 mm; this takes it to the strap's width
 *  plus 1 mm, the hook's length unchanged. */
const RING_STRETCH = (STRAP_WIDTH_MM + 1) / 16;
/** The model comes turned about 20° around the vertical (its ring's long axis at
 *  −20° from x, the hook at 70°); turned back, the ring lies in the strap's
 *  plane along the fold and the hook runs square to the badge. */
const HOOK_YAW = THREE.MathUtils.degToRad(-19.9);

export function createLanyardRig(
  ctx: RigContext,
  opts: { design: LanyardDesign },
): LanyardRig {
  const { scene, camera, card, spec } = ctx;
  const W = spec.widthMm / 10;
  const H = spec.heightMm / 10;
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(d: T) => {
    disposables.push(d);
    return d;
  };

  // ─── The snap hook through the badge's slot ────────────────────────────────
  const hardware = new THREE.Group();
  card.add(hardware);
  const metalEnv = keep(metalEnvironment(ctx.renderer));
  const metal = keep(new THREE.MeshStandardMaterial({ ...METAL, envMap: metalEnv }));
  /** The slot's top edge, from the badge's center: the hook's arc rests on it. */
  const slotTop = H / 2 - CARD_SLOT.y / 10;
  // The model loads after the scene; its place is known up front
  // Outer group: the scale, with the stretch along the bar (the card's x);
  // inner group: the model turned square — the stretch applies after the turn
  const hook = new THREE.Group();
  hook.scale.set(HOOK_SCALE * RING_STRETCH, HOOK_SCALE, HOOK_SCALE);
  hook.position.y = slotTop - HOOK_REST * HOOK_SCALE;
  const turned = new THREE.Group();
  turned.rotation.y = HOOK_YAW;
  hook.add(turned);
  hardware.add(hook);
  let disposed = false;
  void new GLTFLoader().loadAsync(withBase(HOOK_MODEL)).then(
    (gltf) => {
      if (disposed) return;
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        (o.material as THREE.Material).dispose();
        o.material = metal;
        keep(o.geometry);
      });
      turned.add(gltf.scene);
    },
    () => {},
  );
  /** From the badge's center to where the strap meets the ring, cm. */
  const attach = hook.position.y + HOOK_TOP * HOOK_SCALE;
  /** The ring: everything turns around the vertical through it. */
  const pivot = new THREE.Vector3(0, attach, 0);

  // ─── Framing: the strap above the ring, the badge's top below ──────────────
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const bottom = H / 2 - VIEW.badge;
  const top = attach + VIEW.strap;
  const frame = () => {
    const { width, height } = ctx.size();
    const aspect = width / height;
    // One scale for both stage heights: the hook and the badge stay the same
    // size at the bottom, the strap gets what's left above. The badge's width
    // fits too, on a narrow stage.
    const cmPerPx = (top - bottom) / FULL_STAGE;
    const distance = Math.max((height * cmPerPx) / (2 * tan), (W * 1.25) / (2 * tan * aspect));
    const viewHeight = 2 * distance * tan;
    // The badge's piece stays at the bottom whatever the stage shape
    camera.position.set(0, bottom + viewHeight / 2, distance);
    camera.rotation.set(0, 0, 0);
  };
  frame();

  // ─── The strap: straight up from the ring, past the top of the view ────────
  const bump = keep(weave());
  bump.repeat.set(STRAP_WIDTH * TEXTURE_ASPECT * 6, 10);
  const fabric = (side: THREE.Side) =>
    keep(
      new THREE.MeshPhysicalMaterial({
        roughness: 0.82,
        // A soft sheen at grazing angles; strong, it greys the dark strap
        sheen: 0.3,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color("#ffffff"),
        bumpMap: bump,
        bumpScale: 1,
        side,
      }),
    );
  const outside = fabric(THREE.FrontSide);
  // Its own surface too, not the outside's back: a back face would show the
  // artwork mirrored
  const inside = fabric(THREE.FrontSide);
  // The edges: plain fabric in the strap's ground color
  const edgeMaterial = keep(new THREE.MeshStandardMaterial({ roughness: 0.85 }));
  // Both designs load up front: switching doesn't flash a blank strap
  const maps = Object.fromEntries(
    lanyardDesigns.map((d) => [
      d.id,
      { front: keep(texture(TEXTURES[d.id].front, false)), inner: keep(texture(TEXTURES[d.id].inner, true)) },
    ]),
  ) as Record<LanyardDesign, { front: THREE.Texture; inner: THREE.Texture }>;
  const setDesign = (design: LanyardDesign) => {
    outside.map = maps[design].front;
    inside.map = maps[design].inner;
    outside.needsUpdate = inside.needsUpdate = true;
    edgeMaterial.color.set(lanyardDesigns.find((d) => d.id === design)!.ground);
  };
  setDesign(opts.design);

  // One band along a path: down the back strand, around under the ring's top
  // bar, up the front strand — past the top of the view both ways. Going up the
  // front, the outside (cross(side, tangent)) faces the viewer; after the turn
  // it faces away, and the inside shows. The band has a thickness: an outside
  // and an inside surface, each with its own texture layout (the artwork reads
  // right from either side), and two edges.
  const length = VIEW.strap + 12;
  const k = length / VIEW.strap;
  const bar = {
    y: BAR.y * HOOK_SCALE,
    // Around the wire, clear of it by half the strap's thickness
    ry: BAR.halfHeight * HOOK_SCALE + STRAP_THICKNESS / 2,
    rz: BAR.halfDepth * HOOK_SCALE + STRAP_THICKNESS / 2,
  };
  const path: THREE.Vector3[] = [];
  const straight = (from: THREE.Vector3, to: THREE.Vector3, n: number) => {
    for (let i = 0; i < n; i++) path.push(from.clone().lerp(to, i / n));
  };
  const backTop = new THREE.Vector3(STRAND_TOPS.back.x * k, length, STRAND_TOPS.back.z * k);
  const frontTop = new THREE.Vector3(STRAND_TOPS.front.x * k, length, STRAND_TOPS.front.z * k);
  straight(backTop, new THREE.Vector3(0, bar.y, -bar.rz), 40);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI;
    path.push(new THREE.Vector3(0, bar.y - bar.ry * Math.sin(a), -bar.rz * Math.cos(a)));
  }
  straight(new THREE.Vector3(0, bar.y, bar.rz), frontTop, 40);
  path.push(frontTop.clone());

  const strap = new THREE.Group();
  strap.position.copy(pivot);
  const across = new THREE.Vector3(1, 0, 0);
  const outer: number[] = [];
  const inner: number[] = [];
  const outsideUv: number[] = [];
  const insideUv: number[] = [];
  const quads = (index: number[], a: number, b: number, reverse: boolean) =>
    index.push(...(reverse ? [a, b, a + 1, a + 1, b, b + 1] : [a, a + 1, b, a + 1, b + 1, b]));
  let along = 0;
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const normal = new THREE.Vector3();
  path.forEach((p, i) => {
    if (i) along += p.distanceTo(path[i - 1]);
    tangent.subVectors(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]).normalize();
    // The band's width along the bar, square to the path
    side.copy(across).addScaledVector(tangent, -across.dot(tangent)).normalize();
    normal.crossVectors(side, tangent);
    const w = STRAP_WIDTH / 2;
    const t = STRAP_THICKNESS / 2;
    for (const [list, off] of [[outer, t], [inner, -t]] as const)
      list.push(
        p.x - side.x * w + normal.x * off, p.y - side.y * w + normal.y * off, p.z - side.z * w + normal.z * off,
        p.x + side.x * w + normal.x * off, p.y + side.y * w + normal.y * off, p.z + side.z * w + normal.z * off,
      );
    // The artwork turned a quarter left: its top (v = 1) on the viewer's left
    const u = along / (STRAP_WIDTH * TEXTURE_ASPECT);
    outsideUv.push(u, 1, u, 0);
    // Inside: the same strip layout (v 0 at −side, 1 at +side), mapped into the
    // pattern's grid — x along the strip, y down across it, in symbol pixels
    const x = (along / STRAP_WIDTH) * PATTERN.strip;
    insideUv.push(...patternUv(x, PATTERN.strip), ...patternUv(x, 0));
  });
  const n = path.length;
  const outsideIndex: number[] = [];
  const insideIndex: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    quads(outsideIndex, i * 2, (i + 1) * 2, false);
    quads(insideIndex, i * 2, (i + 1) * 2, true);
  }
  const surface = (positions: number[], uv: number[] | null, index: number[], material: THREE.Material) => {
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (uv) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    strap.add(new THREE.Mesh(geometry, material));
  };
  surface(outer, outsideUv, outsideIndex, outside);
  surface(inner, insideUv, insideIndex, inside);
  // The edges: strips joining the outside and the inside along each side
  for (const e of [0, 1]) {
    const positions: number[] = [];
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      positions.push(...outer.slice((i * 2 + e) * 3, (i * 2 + e) * 3 + 3));
      positions.push(...inner.slice((i * 2 + e) * 3, (i * 2 + e) * 3 + 3));
      if (i) quads(index, (i - 1) * 2, i * 2, e === 0);
    }
    surface(positions, null, index, edgeMaterial);
  }
  scene.add(strap);

  // ─── Turning: the badge and the strap together, around the ring ────────────
  const hang = new THREE.Vector3();
  return {
    update(delta, now) {
      frame();
      const s = ctx.spin;
      stepSpin(s, delta, now, ctx.reducedMotion());
      strap.rotation.y = s.yaw;
      card.rotation.set(s.pitch, s.yaw, 0);
      // The ring stays at the pivot: the badge hangs below it
      hang.set(0, -attach, 0).applyEuler(card.rotation);
      card.position.copy(pivot).add(hang);
    },
    setDesign,
    dispose() {
      disposed = true;
      card.remove(hardware);
      scene.remove(strap);
      disposables.forEach((x) => x.dispose());
    },
  };
}
