// Rotation of the 3D card: state shared by the pointer handlers (the card,
// badge and lanyard previews) and the render loop (business-card-3d.ts), and
// the drag-to-turn steps they all take. No three.js here — the previews import
// it without pulling in the 3D bundle.

export type Side = "front" | "back";

export interface Spin {
  yaw: number;
  pitch: number;
  targetYaw: number;
  targetPitch: number;
  /** Pointer over the card, −1…1 — a slight tilt toward it */
  hover: { x: number; y: number } | null;
  dragging: boolean;
  /** Something on the card is being edited (ID badge): no sway, no tilt */
  hold: boolean;
  /** When a "no" shake started (performance.now), a typed character the badge
   *  can't print */
  shakeAt: number | null;
}

export const newSpin = (): Spin => ({
  yaw: 0,
  pitch: 0,
  targetYaw: 0,
  targetPitch: 0,
  hover: null,
  dragging: false,
  hold: false,
  shakeAt: null,
});

const SHAKE_MS = 480;
const SHAKE_YAW = 0.14;

/** Yaw offset of a "no" shake: a head shake — three swings, fading out; not
 *  damped with the rest so it stays crisp. None with reduced motion (the hint
 *  under the preview tells anyway). */
export function shakeYaw(s: Spin, now: number, reducedMotion: boolean): number {
  if (s.shakeAt === null || reducedMotion) return 0;
  const t = (now - s.shakeAt) / SHAKE_MS;
  if (t >= 1 || t < 0) {
    if (t >= 1) s.shakeAt = null;
    return 0;
  }
  return Math.sin(t * Math.PI * 6) * SHAKE_YAW * (1 - t) ** 2;
}

const damp = (x: number, y: number, lambda: number, dt: number) =>
  x + (y - x) * (1 - Math.exp(-lambda * dt));

/** One frame of turning: toward the target, with a gentle sway at rest and a
 *  tilt toward the pointer on hover; still while something is edited. */
export function stepSpin(s: Spin, delta: number, now: number, reducedMotion: boolean) {
  const sway =
    reducedMotion || s.hover || s.dragging || s.hold ? 0 : Math.sin(now / 1400) * 0.06;
  const tilting = s.hover && !s.dragging && !s.hold;
  const tiltX = tilting ? s.hover!.x * 0.18 : 0;
  const tiltY = tilting ? s.hover!.y * 0.12 : 0;
  const k = s.dragging ? 18 : 6;
  s.yaw = damp(s.yaw, s.targetYaw + sway + tiltX, k, delta);
  s.pitch = damp(s.pitch, s.targetPitch + sway * 0.4 + tiltY, k, delta);
}

/** Side facing the camera at a given yaw. */
export const sideAt = (yaw: number): Side =>
  Math.cos(yaw) >= 0 ? "front" : "back";

/** Nearest yaw that shows the side: multiples of 2π for the front, odd π for the back. */
export function yawFor(side: Side, from: number): number {
  const offset = side === "front" ? 0 : Math.PI;
  return Math.round((from - offset) / (2 * Math.PI)) * 2 * Math.PI + offset;
}

/** A drag in progress: where the pointer was last, when, and how fast the card
 *  was turning (rad/s) for a flick on release. */
export interface TurnDrag {
  x: number;
  y: number;
  t: number;
  velocity: number;
}

/** The pointer's side of a pointer event, as the steps below need it. */
type PointerAt = { clientX: number; clientY: number; timeStamp: number; pointerType: string };

/** Dragging across the whole stage turns the card by about 200°. */
const TURN = Math.PI * 1.1;
/** A flick keeps turning for about this long before the card settles, s. */
const FLICK = 0.12;

/** Where a mouse is over the stage, −1…1 both ways, for the tilt toward it;
 *  null for touch and pen. */
export function hoverAt(e: PointerAt, rect: DOMRect): Spin["hover"] {
  return e.pointerType === "mouse"
    ? {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: ((e.clientY - rect.top) / rect.height) * 2 - 1,
      }
    : null;
}

/** A drag starts here. */
export function beginTurn(d: TurnDrag, e: PointerAt) {
  d.x = e.clientX;
  d.y = e.clientY;
  d.t = e.timeStamp;
  d.velocity = 0;
}

/** The pointer moved: turn the card by it, tilt it up and down (a mouse only,
 *  within maxPitch radians), keep the speed for a flick. */
export function turnBy(s: Spin, d: TurnDrag, e: PointerAt, rect: DOMRect, maxPitch: number) {
  const dYaw = ((e.clientX - d.x) / rect.width) * TURN;
  s.targetYaw += dYaw;
  if (e.pointerType === "mouse")
    s.targetPitch = Math.max(
      -maxPitch,
      Math.min(maxPitch, s.targetPitch + ((e.clientY - d.y) / rect.width) * Math.PI),
    );
  d.velocity = dYaw / (Math.max(1, e.timeStamp - d.t) / 1000);
  d.x = e.clientX;
  d.y = e.clientY;
  d.t = e.timeStamp;
}

/** Let go: the card flicks on and settles on the side it lands nearest; a
 *  pause before the release means no flick. */
export function releaseTurn(s: Spin, d: TurnDrag, e: PointerAt) {
  const velocity = e.timeStamp - d.t > 80 ? 0 : d.velocity;
  const projected = s.targetYaw + velocity * FLICK;
  s.targetYaw = yawFor(sideAt(projected), projected);
  s.targetPitch = 0;
}
