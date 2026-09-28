"use client";

// What the 3D card previews (business card, ID badge, lanyard) share about the
// stage they're drawn on: whether WebGL is there (the flat fallback without
// it), the reduced motion setting, drag to turn, and easing for states drawn
// in the card texture, where CSS transitions don't reach.

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import {
  beginTurn,
  hoverAt,
  newSpin,
  releaseTurn,
  turnBy,
  yawFor,
  type Side,
  type Spin,
  type TurnDrag,
} from "./business-card-spin";

let webgl: boolean | undefined;
const noSubscribe = () => () => {};
function webglAvailable(): boolean {
  if (webgl === undefined) {
    try {
      webgl = Boolean(document.createElement("canvas").getContext("webgl2"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** WebGL 2 in this browser; null until the client knows. */
export function useWebgl(): boolean | null {
  return useSyncExternalStore(noSubscribe, webglAvailable, () => null);
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** The system asks for reduced motion; follows it live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** 0…1 easing toward on (1) or off (0) in about ms each way: ease-out on the
 *  way up, ease-in on the way down; a jump with reduced motion. */
export function useEase(on: boolean, ms: number, reduced: boolean) {
  const [value, setValue] = useState(on ? 1 : 0);
  const now = useRef(on ? 1 : 0);
  useEffect(() => {
    const target = on ? 1 : 0;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = t - last;
      last = t;
      const from = now.current;
      const next = reduced
        ? target
        : from + Math.sign(target - from) * Math.min(Math.abs(target - from), dt / ms);
      now.current = next;
      setValue(target ? 1 - (1 - next) ** 2 : next ** 2);
      if (next !== target) raf = requestAnimationFrame(step);
    };
    if (now.current !== target) raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, ms, reduced]);
  return value;
}

/** The card's rotation and pointer handlers for a stage that only turns it
 *  (the scene reads spin every frame):
 *  drag to turn (up and down within maxPitch, a mouse only), a flick on
 *  release, a tilt toward a hovering mouse. No handlers but the hover reset
 *  while enabled is false (no WebGL). */
export function useTurnGesture({ maxPitch, enabled }: { maxPitch: number; enabled: boolean }) {
  const spin = useRef<Spin>(newSpin());
  const drag = useRef<TurnDrag>({ x: 0, y: 0, t: 0, velocity: 0 });
  const end = (e: PointerEvent<HTMLDivElement>) => {
    const s = spin.current;
    if (!s.dragging) return;
    s.dragging = false;
    releaseTurn(s, drag.current, e);
  };
  const onPointerLeave = () => {
    spin.current.hover = null;
  };
  const handlers = enabled
    ? {
        onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          spin.current.dragging = true;
          beginTurn(drag.current, e);
        },
        onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
          const s = spin.current;
          const rect = e.currentTarget.getBoundingClientRect();
          s.hover = hoverAt(e, rect);
          if (s.dragging) turnBy(s, drag.current, e, rect, maxPitch);
        },
        onPointerUp: end,
        onPointerCancel: end,
        onPointerLeave,
      }
    : { onPointerLeave };
  /** Turn to a side, as the Front / Back tabs do */
  const faceSide = (side: Side) => {
    const s = spin.current;
    s.targetYaw = yawFor(side, s.targetYaw);
    s.targetPitch = 0;
  };
  return { spin, handlers, faceSide };
}
