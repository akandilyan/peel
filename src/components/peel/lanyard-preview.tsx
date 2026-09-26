"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CARD_SLOT, PREVIEW_CARD, lanyardDesigns, type LanyardDesign } from "@/lib/lanyard";
import type { CardScene, CardSpec } from "./business-card-3d";
import { BACKDROP } from "./business-card-preview";
import { newSpin, sideAt, yawFor } from "./business-card-spin";
import type { LanyardRig } from "./lanyard-3d";
import { Swatches, type Swatch } from "./style-swatches";

// Lanyard preview on native Fluid parts, like the business card: CardGroup /
// Card on the brand backdrop, title and size in the header, the design swatches
// in the footer.
// CUSTOM: the content is the shared WebGL card scene with a lanyard rig — the
// strap hangs straight down to the snap hook, the hook holds a blank badge
// whose top only shows; drag to turn it all. three.js loads only on this page;
// the scene fades in once drawn. Without WebGL there's no preview.

/** Design swatches: the strap's ground with its print color. */
const DESIGN_SWATCHES: Swatch<LanyardDesign>[] = lanyardDesigns.map((d) => ({
  id: d.id,
  name: d.name,
  chip: `linear-gradient(135deg, ${d.ground} 50%, ${d.ink} 50%)`,
}));

/** The badge on the hook: a blank CR80 card, only its top in view. */
const BADGE: CardSpec = {
  widthMm: PREVIEW_CARD.widthMm,
  heightMm: PREVIEW_CARD.heightMm,
  depthMm: 0.76,
  cornerMm: 3.18,
  roughness: [0.6, 0.6],
  edgeColor: "#f5f5f5",
  envMapIntensity: 0.3,
  sameSides: true,
};

const MAX_PITCH = 0.3;
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

export function LanyardPreview({
  sizeLabel,
  design,
  onDesignChange,
}: {
  sizeLabel: string;
  design: LanyardDesign;
  onDesignChange: (design: LanyardDesign) => void;
}) {
  const hasWebgl = useSyncExternalStore(noSubscribe, webglAvailable, () => null);
  const reducedMotion = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
  const [ready, setReady] = useState(false);
  const spin = useRef(newSpin());
  const sceneEl = useRef<HTMLDivElement>(null);
  const scene = useRef<CardScene | null>(null);
  const rig = useRef<LanyardRig | null>(null);
  const designRef = useRef(design);

  // The scene and the lanyard rig: three.js is fetched on demand
  useEffect(() => {
    if (!hasWebgl || !sceneEl.current) return;
    let cancelled = false;
    const el = sceneEl.current;
    void Promise.all([import("./business-card-3d"), import("./lanyard-3d")]).then(
      ([{ createCardScene }, { createLanyardRig }]) => {
        if (cancelled) return;
        const s = createCardScene(el, spin.current, {
          card: BADGE,
          onSide: () => {},
          onReady: () => setReady(true),
        });
        s.setRounded(true);
        s.setHoles([CARD_SLOT]);
        // A blank badge: white both sides
        s.drawSides((ctx) => {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, BADGE.widthMm, BADGE.heightMm);
        });
        rig.current = s.setRig((ctx) => createLanyardRig(ctx, { design: designRef.current }));
        scene.current = s;
      },
    );
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
      rig.current = null;
    };
  }, [hasWebgl]);
  useEffect(() => {
    designRef.current = design;
    rig.current?.setDesign(design);
  }, [design]);
  useEffect(() => {
    scene.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, ready]);

  // Dragging turns it, as the business card
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

  return (
    <CardGroup
      fluidHover={false}
      className={`rounded-xl border border-transparent bg-origin-border ${BACKDROP}`}
    >
      <Card>
        <CardHeader>
          <div className="flex items-baseline justify-between gap-4">
            <CardTitle>Preview</CardTitle>
            <span className="text-[13px] text-muted-foreground tabular-nums">{sizeLabel}</span>
          </div>
        </CardHeader>
        <CardContent>
          {/* As tall as the ID badge's stage */}
          <div
            role="img"
            aria-label={`Lanyard, ${design} design${hasWebgl ? ". Drag to turn it." : ""}`}
            className={`relative h-[400px] touch-pan-y select-none sm:h-[500px] ${hasWebgl ? "cursor-grab active:cursor-grabbing" : ""}`}
            onPointerDown={hasWebgl ? onPointerDown : undefined}
            onPointerMove={hasWebgl ? onPointerMove : undefined}
            onPointerUp={hasWebgl ? onPointerUp : undefined}
            onPointerCancel={hasWebgl ? onPointerUp : undefined}
            onPointerLeave={() => {
              spin.current.hover = null;
            }}
          >
            {hasWebgl === false && (
              <p className="absolute inset-0 flex items-center justify-center text-[13px] text-muted-foreground">
                The 3D preview needs WebGL.
              </p>
            )}
            <div
              ref={sceneEl}
              // The strap and the badge fade out at the stage's top and bottom
              className={`absolute inset-0 transition-opacity duration-300 [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_80%,transparent)] ${ready ? "opacity-100" : "opacity-0"}`}
            />
          </div>
        </CardContent>
        {/* The design swatches, as the business card's styles; the row as tall
            as the card's, whose Front / Back tabs set it (48 px), so the
            swatches sit as far from the bottom edge */}
        <CardFooter className="flex min-h-12 items-center">
          <Swatches
            label="Design"
            options={DESIGN_SWATCHES}
            value={design}
            onChange={onDesignChange}
          />
        </CardFooter>
      </Card>
    </CardGroup>
  );
}
