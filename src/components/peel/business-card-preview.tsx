"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TabsSubtle, TabsSubtleItem } from "@/components/ui/tabs-subtle";
import { CARD } from "@/lib/business-card";
import type { CardScene } from "./business-card-3d";
import { newSpin, sideAt, yawFor, type Side } from "./business-card-spin";

// Business card preview on native Fluid parts, like DecalPreview: CardGroup /
// Card (on the brand backdrop, see below), title and size in the header, Front / Back tabs (TabsSubtle)
// in the footer. CUSTOM: the content is a WebGL card you turn by dragging;
// three.js loads only on this page; the card fades in once it has drawn.
// Without WebGL the sides are flat SVG.

const SIDES: Side[] = ["front", "back"];

// Backdrop from the template (Avride Business Card, "Hero section"): lavender at
// the top fading to a cool off-white. Dark theme: a dim lavender fading into the
// page background.
export const BACKDROP =
  "bg-linear-to-b from-[#dfdbfe] to-[#f6f6fb] dark:from-[#23213a] dark:to-background";

/** Max tilt up and down while dragging, radians. */
const MAX_PITCH = 0.5;
/** A flick keeps turning for about this long before the card settles, s. */
const FLICK = 0.12;

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

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function BusinessCardPreview({
  label,
  sizeLabel,
  front,
  back,
  rounded,
  footerStart,
  footerEnd,
}: {
  label: string;
  sizeLabel: string;
  /** Sides as SVG markup in mm (business-card-svg.ts) */
  front: string;
  back: string;
  /** Die-cut rounded corners */
  rounded: boolean;
  /** Controls on the sides of the Front / Back tabs (the card design) */
  footerStart?: ReactNode;
  footerEnd?: ReactNode;
}) {
  // null on the server: the flat preview renders first
  const hasWebgl = useSyncExternalStore(noSubscribe, webglAvailable, () => null);
  const reducedMotion = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
  const [side, setSide] = useState<Side>("front");
  // The 3D scene has drawn both sides — the flat preview steps aside
  const [ready, setReady] = useState(false);

  const spin = useRef(newSpin());
  const mount = useRef<HTMLDivElement>(null);
  const scene = useRef<CardScene | null>(null);
  // Latest sides and corners for a scene that loads after they change
  const sides = useRef({ front, back });
  const roundedRef = useRef(rounded);

  // The scene: three.js is fetched on demand, created once per mount
  useEffect(() => {
    if (!hasWebgl || !mount.current) return;
    let cancelled = false;
    const el = mount.current;
    void import("./business-card-3d").then(({ createCardScene }) => {
      if (cancelled) return;
      const s = createCardScene(el, spin.current, {
        onSide: setSide,
        onReady: () => setReady(true),
      });
      s.setSides(sides.current.front, sides.current.back);
      s.setRounded(roundedRef.current);
      scene.current = s;
    });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [hasWebgl]);
  useEffect(() => {
    sides.current = { front, back };
    scene.current?.setSides(front, back);
  }, [front, back]);
  useEffect(() => {
    roundedRef.current = rounded;
    scene.current?.setRounded(rounded);
  }, [rounded]);
  useEffect(() => {
    scene.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, ready]);

  const drag = useRef({ x: 0, y: 0, t: 0, velocity: 0 });
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    spin.current.dragging = true;
    drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, velocity: 0 };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = spin.current;
    const rect = e.currentTarget.getBoundingClientRect();
    s.hover =
      e.pointerType === "mouse"
        ? {
            x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
            y: ((e.clientY - rect.top) / rect.height) * 2 - 1,
          }
        : null;
    if (!s.dragging) return;
    const d = drag.current;
    // Dragging across the whole preview turns the card by about 200°
    const dYaw = ((e.clientX - d.x) / rect.width) * Math.PI * 1.1;
    s.targetYaw += dYaw;
    if (e.pointerType === "mouse")
      s.targetPitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, s.targetPitch + ((e.clientY - d.y) / rect.width) * Math.PI),
      );
    d.velocity = dYaw / (Math.max(1, e.timeStamp - d.t) / 1000);
    d.x = e.clientX;
    d.y = e.clientY;
    d.t = e.timeStamp;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = spin.current;
    if (!s.dragging) return;
    s.dragging = false;
    // A pause before release means no flick
    const velocity = e.timeStamp - drag.current.t > 80 ? 0 : drag.current.velocity;
    const projected = s.targetYaw + velocity * FLICK;
    s.targetYaw = yawFor(sideAt(projected), projected);
    s.targetPitch = 0;
  };
  const flipTo = (next: Side) => {
    const s = spin.current;
    s.targetYaw = yawFor(next, s.targetYaw);
    s.targetPitch = 0;
    setSide(next);
  };

  const flat = (markup: string) => (
    <svg
      viewBox={`0 0 ${CARD.widthMm} ${CARD.heightMm}`}
      className="h-auto w-full max-w-[300px]"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
  const interactive = hasWebgl === true;

  return (
    // CUSTOM: the whole preview card sits on the brand backdrop instead of
    // surface-1, one background for the header, the stage and the tabs
    // A transparent 1 px border, as the outlined field cards have a visible one:
    // the text inside all the cards starts on the same line. bg-origin-border:
    // the gradient spans the border too — otherwise it repeats under the
    // transparent border and shows as a line at the bottom.
    <CardGroup
      fluidHover={false}
      className={`rounded-xl border border-transparent bg-origin-border ${BACKDROP}`}
    >
      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between gap-4">
            <CardTitle>{label}</CardTitle>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {sizeLabel}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div
            role="img"
            aria-label={`${label}: business card, ${side} side${interactive ? ". Drag to turn it." : ""}`}
            className={`relative h-[220px] touch-pan-y sm:h-[300px] select-none ${interactive ? "cursor-grab active:cursor-grabbing" : ""}`}
            onPointerDown={interactive ? onPointerDown : undefined}
            onPointerMove={interactive ? onPointerMove : undefined}
            onPointerUp={interactive ? onPointerUp : undefined}
            onPointerCancel={interactive ? onPointerUp : undefined}
            onPointerLeave={() => {
              spin.current.hover = null;
            }}
          >
            {/* Flat sides: only without WebGL, both at once. With it the stage
                stays empty until the 3D card has drawn and then fades in —
                swapping a flat card for the 3D one blinks. */}
            {hasWebgl === false && (
              <div className="absolute inset-0 flex items-center justify-center gap-4 px-10">
                {flat(front)}
                {flat(back)}
              </div>
            )}
            <div
              ref={mount}
              className={`absolute inset-0 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
            />
          </div>
        </CardContent>
        {/* Three columns: start and end slots, the tabs in the middle. On a phone
            the tabs take a row of their own on top, the slots share the next one. */}
        <CardFooter className="grid grid-cols-2 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="justify-self-start">{footerStart}</div>
          <div className="order-first col-span-2 justify-self-center sm:order-none sm:col-span-1">
            {hasWebgl !== false && (
              <TabsSubtle
                selectedIndex={SIDES.indexOf(side)}
                onSelect={(i) => flipTo(SIDES[i])}
              >
                <TabsSubtleItem index={0} label="Front" />
                <TabsSubtleItem index={1} label="Back" />
              </TabsSubtle>
            )}
          </div>
          <div className="justify-self-end whitespace-nowrap">{footerEnd}</div>
        </CardFooter>
      </Card>
    </CardGroup>
  );
}
