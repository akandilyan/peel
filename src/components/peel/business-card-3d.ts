// 3D card scene on plain three.js — the approach of the Ziggy card
// (zackon.top/posts/building-ziggy-card): a thin card body, the printed sides as
// canvas textures, physically based materials under studio light. The business
// card (matte paper, no foil) by default; the ID badge passes its own card: glossy
// PVC, one texture on both sides. Loaded on demand by business-card-preview.tsx
// and id-badge-preview.tsx.
// Scene units are centimeters.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { CARD, CORNER_MM } from "@/lib/business-card";
import { sideDocument } from "@/lib/business-card-svg";
import { shakeYaw, sideAt, stepSpin, type Side, type Spin } from "./business-card-spin";

/** Texture width of the business card; other cards get the same pixels per mm:
 *  about 23 px per mm, crisp 4 mm text. */
const TEXTURE_PX = 2048;
const TEXTURE_PX_PER_MM = TEXTURE_PX / CARD.widthMm;
const FOV = 30;

/** The physical card. */
export interface CardSpec {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  /** Corner radius when rounded */
  cornerMm: number;
  /** Surface roughness of the printed sides: front, back */
  roughness: [number, number];
  edgeColor: string;
  /** Studio reflections on the printed sides (1 — full): less keeps dark print
   *  dark, the photo of the ID badge would read greyish */
  envMapIntensity?: number;
  /** One texture for both sides (the same design) */
  sameSides?: boolean;
  /** How much room the card gets: the view is this many card heights tall */
  framing?: number;
}

const BUSINESS_CARD: CardSpec = {
  widthMm: CARD.widthMm,
  heightMm: CARD.heightMm,
  // 16 pt card stock, about 0.4 mm
  depthMm: 0.4,
  cornerMm: CORNER_MM,
  roughness: [0.72, 0.78],
  edgeColor: "#f2f2ef",
};

/** A point on the card under the pointer: the side and card mm (top left, y down). */
export interface CardPoint {
  side: Side;
  x: number;
  y: number;
}

/** Draws one side into its texture: a 2D context scaled to card mm. */
export type DrawSide = (ctx: CanvasRenderingContext2D, side: Side) => void;

/** A hole through the card (a slot punch): a stadium, card mm from the top left. */
export interface CardHole {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a rig gets to drive the card: the scene to add its own objects to, the
 *  camera to frame them, the card group to move. */
export interface RigContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  card: THREE.Group;
  spec: CardSpec;
  /** Canvas size, px */
  size: () => { width: number; height: number };
  /** World point on a printed face under a screen point, or null */
  hit: (clientX: number, clientY: number) => THREE.Vector3 | null;
  /** World ray through a screen point */
  ray: (clientX: number, clientY: number) => THREE.Ray;
  reducedMotion: () => boolean;
  /** The turning state the pointer drives */
  spin: Spin;
}

/** Takes over the card from the built-in turning (the ID badge lanyard). */
export interface CardRig {
  /** Moves the card and the rig's objects, frames the camera; every frame. */
  update: (delta: number, now: number) => void;
  dispose: () => void;
}

export interface CardScene {
  setSides: (front: string, back: string) => void;
  /** Draws the sides with canvas 2D on the next frame (redraw as often as
   *  needed: one draw per frame). With sameSides only the front is drawn. */
  drawSides: (draw: DrawSide) => void;
  /** The card point under a screen point, or null off the card. */
  pick: (clientX: number, clientY: number) => CardPoint | null;
  setRounded: (rounded: boolean) => void;
  /** Holes through the card, e.g. a slot punch; [] — none. */
  setHoles: (holes: CardHole[]) => void;
  /** Hands the card to a rig (null — back to turning); returns the rig. */
  setRig: <R extends CardRig>(make: ((ctx: RigContext) => R) | null) => R | null;
  setReducedMotion: (reduced: boolean) => void;
  dispose: () => void;
}

/** Card outline centered on the origin, square or with rounded corners, with
 *  its holes. */
function cardShape(spec: CardSpec, rounded: boolean, holes: CardHole[] = []): THREE.Shape {
  const W = spec.widthMm / 10;
  const H = spec.heightMm / 10;
  const r = rounded ? spec.cornerMm / 10 : 0;
  const x = -W / 2;
  const y = -H / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + W - r, y);
  if (r) s.absarc(x + W - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + W, y + H - r);
  if (r) s.absarc(x + W - r, y + H - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + H);
  if (r) s.absarc(x + r, y + H - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  if (r) s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false);
  for (const h of holes) {
    // Card mm (top left, y down) → centimeters around the center, y up
    const hw = h.width / 20;
    const hr = h.height / 20;
    const cx = (h.x + h.width / 2) / 10 - W / 2;
    const cy = H / 2 - (h.y + h.height / 2) / 10;
    const p = new THREE.Path();
    p.moveTo(cx - hw + hr, cy - hr);
    p.lineTo(cx + hw - hr, cy - hr);
    p.absarc(cx + hw - hr, cy, hr, -Math.PI / 2, Math.PI / 2, false);
    p.lineTo(cx - hw + hr, cy + hr);
    p.absarc(cx - hw + hr, cy, hr, Math.PI / 2, (3 * Math.PI) / 2, false);
    s.holes.push(p);
  }
  return s;
}

/** A printed side: the outline filled, UVs across the whole card (0…1). */
function faceGeometry(spec: CardSpec, shape: THREE.Shape): THREE.ShapeGeometry {
  const W = spec.widthMm / 10;
  const H = spec.heightMm / 10;
  const g = new THREE.ShapeGeometry(shape, 16);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++)
    uv.setXY(i, (pos.getX(i) + W / 2) / W, (pos.getY(i) + H / 2) / H);
  return g;
}

function sideTexture(spec: CardSpec, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(spec.widthMm * TEXTURE_PX_PER_MM);
  canvas.height = Math.round(spec.heightMm * TEXTURE_PX_PER_MM);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAnisotropy;
  return t;
}

/** Draws a side's SVG into its texture canvas; the old image stays until then. */
async function drawSide(texture: THREE.CanvasTexture, markup: string) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sideDocument(markup, TEXTURE_PX))}`;
  await img.decode();
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  texture.needsUpdate = true;
}

export function createCardScene(
  container: HTMLElement,
  spin: Spin,
  opts: {
    onSide: (side: Side) => void;
    /** Both sides are drawn — the scene can replace the flat preview */
    onReady: () => void;
    card?: CardSpec;
  },
): CardScene {
  const spec = opts.card ?? BUSINESS_CARD;
  const W = spec.widthMm / 10;
  const H = spec.heightMm / 10;
  const DEPTH = spec.depthMm / 10;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Studio light built in code (RoomEnvironment) — no environment maps to download
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.75;
  // A close key from the top left: a soft falloff across the paper
  const key = new THREE.PointLight("#ffffff", 90, 0, 1.6);
  key.position.set(-7, 6, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#eef0ff", 0.5);
  rim.position.set(6, 2, -6);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  // The card: the edge is the extruded outline (the white paper core, its caps
  // hidden), the printed sides are flat faces on the same outline, the back one
  // turned around so it reads from behind.
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const frontMap = sideTexture(spec, anisotropy);
  const backMap = spec.sameSides ? frontMap : sideTexture(spec, anisotropy);
  const edge = new THREE.MeshStandardMaterial({ color: spec.edgeColor, roughness: 0.9 });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const envMapIntensity = spec.envMapIntensity ?? 1;
  const frontMat = new THREE.MeshStandardMaterial({
    map: frontMap,
    roughness: spec.roughness[0],
    envMapIntensity,
  });
  const backMat = new THREE.MeshStandardMaterial({
    map: backMap,
    roughness: spec.roughness[1],
    envMapIntensity,
  });
  const materials = [edge, hidden, frontMat, backMat];
  const card = new THREE.Group();
  scene.add(card);
  const body = new THREE.Mesh(undefined, [hidden, edge]);
  const front = new THREE.Mesh(undefined, frontMat);
  const back = new THREE.Mesh(undefined, backMat);
  front.position.z = DEPTH / 2;
  back.position.z = -DEPTH / 2;
  back.rotation.y = Math.PI;
  card.add(body, front, back);
  let rounded = true;
  let holes: CardHole[] = [];
  const build = () => {
    const shape = cardShape(spec, rounded, holes);
    body.geometry.dispose();
    front.geometry.dispose();
    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: DEPTH,
      bevelEnabled: false,
      curveSegments: 16,
    });
    extruded.translate(0, 0, -DEPTH / 2);
    body.geometry = extruded;
    // One face geometry for both sides: the back mesh is the same face turned
    front.geometry = back.geometry = faceGeometry(spec, shape);
  };
  build();

  // A rig drives the card instead of the turning, e.g. the badge lanyard
  let rig: CardRig | null = null;
  const raycaster = new THREE.Raycaster();
  const toNdc = (clientX: number, clientY: number) => {
    const rect = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  };
  const castTo = (clientX: number, clientY: number) => {
    raycaster.setFromCamera(toNdc(clientX, clientY), camera);
    card.updateMatrixWorld();
    return raycaster.intersectObjects([front, back], false)[0];
  };

  // Camera distance: the card fits with room to turn, whatever the canvas shape
  let size = { width: 1, height: 1 };
  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    size = { width, height };
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = `${width}px`;
    renderer.domElement.style.height = `${height}px`;
    camera.aspect = width / height;
    // A rig frames the camera itself, every frame
    if (rig) {
      camera.updateProjectionMatrix();
      return;
    }
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const byHeight = (H * (spec.framing ?? 1.55)) / (2 * t);
    const byWidth = (W * 1.3) / (2 * t * camera.aspect);
    camera.position.set(0, 0, Math.max(byHeight, byWidth));
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // Render loop: runs while the preview is on screen
  let reducedMotion = false;
  let visible = true;
  let frame = 0;
  let last = performance.now();
  let lastSide: Side = "front";
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const delta = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible) return;
    if (rig) {
      rig.update(delta, now);
      tickDraw();
      renderer.render(scene, camera);
      return;
    }
    const s = spin;
    stepSpin(s, delta, now, reducedMotion);
    card.rotation.set(s.pitch, s.yaw + shakeYaw(s, now, reducedMotion), 0);
    const side = sideAt(s.yaw);
    if (side !== lastSide) {
      lastSide = side;
      opts.onSide(side);
    }
    tickDraw();
    renderer.render(scene, camera);
  };
  const tickDraw = () => {
    if (!pendingDraw) return;
    const draw = pendingDraw;
    pendingDraw = null;
    paint(frontMap, draw, "front");
    if (!spec.sameSides) paint(backMap, draw, "back");
    if (!ready) {
      ready = true;
      opts.onReady();
    }
  };
  let pendingDraw: DrawSide | null = null;
  const paint = (texture: THREE.CanvasTexture, draw: DrawSide, side: Side) => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(canvas.width / spec.widthMm, 0, 0, canvas.height / spec.heightMm, 0, 0);
    draw(ctx, side);
    texture.needsUpdate = true;
  };
  frame = requestAnimationFrame(tick);
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  });
  io.observe(container);

  let version = 0;
  let ready = false;
  return {
    setSides(front, back) {
      const v = ++version;
      void Promise.all([drawSide(frontMap, front), drawSide(backMap, back)])
        .then(() => {
          if (v === version && !ready) {
            ready = true;
            opts.onReady();
          }
        })
        .catch(() => {});
    },
    drawSides(draw) {
      pendingDraw = draw;
    },
    pick(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const hit = castTo(clientX, clientY);
      if (!hit?.uv) return null;
      // Both faces share the UVs; the texture's top row is v = 1
      return {
        side: hit.object === front ? "front" : "back",
        x: hit.uv.x * spec.widthMm,
        y: (1 - hit.uv.y) * spec.heightMm,
      };
    },
    setRounded(next) {
      if (next === rounded) return;
      rounded = next;
      build();
    },
    setHoles(next) {
      if (JSON.stringify(next) === JSON.stringify(holes)) return;
      holes = next;
      build();
    },
    setRig(make) {
      rig?.dispose();
      rig = null;
      // Back to the turning: the card at the origin, the camera re-framed
      card.position.set(0, 0, 0);
      card.quaternion.identity();
      camera.position.set(0, 0, camera.position.z);
      camera.rotation.set(0, 0, 0);
      if (!make) {
        resize();
        return null;
      }
      const made = make({
        renderer,
        scene,
        camera,
        card,
        spec,
        size: () => size,
        hit: (x, y) => castTo(x, y)?.point.clone() ?? null,
        ray: (x, y) => {
          raycaster.setFromCamera(toNdc(x, y), camera);
          return raycaster.ray.clone();
        },
        reducedMotion: () => reducedMotion,
        spin,
      });
      rig = made;
      return made;
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced;
    },
    dispose() {
      rig?.dispose();
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      body.geometry.dispose();
      front.geometry.dispose();
      materials.forEach((m) => m.dispose());
      frontMap.dispose();
      if (backMap !== frontMap) backMap.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
