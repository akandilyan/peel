"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { Elevated } from "@/lib/elevated";
import { spring } from "@/lib/springs";
import { MAX_ZOOM, clampCrop, type BadgePhoto, type PhotoCrop } from "@/lib/id-badge";

// CUSTOM: the ID badge's framing toolbar floats over the stage's bottom while
// the photo is framed — native Slider and Buttons on an Elevated surface, as a
// dropdown's, made see-through (its own surface color at 50%, important over
// Elevated's opaque one) over a blur of the card and the backdrop; instead of
// the surface's ring and shadow, a hairline of the text color at 12%, dark on
// the light theme and light on the dark one. It rises in and fades up, and out
// the same way, shorter; the opacity is on the blurred surface itself — on a
// parent it would switch the backdrop blur off until the fade ends. Its pointer
// and key events stay in it: the stage would turn the card or move the photo.

const MotionElevated = motion.create(Elevated);

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function PhotoToolbar({
  photo,
  crop,
  onCropChange,
  reducedMotion,
  children,
}: {
  /** Shown while there's a photo being framed */
  photo: BadgePhoto | null;
  crop: PhotoCrop;
  onCropChange: (crop: PhotoCrop) => void;
  reducedMotion: boolean;
  /** The photo buttons, right of the zoom */
  children?: ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
      <AnimatePresence>
        {photo && (
          <MotionElevated
            key="tools"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 6, scale: reducedMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: spring.moderate }}
            exit={{
              opacity: 0,
              y: reducedMotion ? 0 : 4,
              scale: reducedMotion ? 1 : 0.99,
              transition: { duration: spring.moderate.exit.duration },
            }}
            offset={2}
            shadowLevel={3}
            className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-xl border border-foreground/12 bg-surface-3/50! p-1 shadow-none! backdrop-blur-xl backdrop-saturate-150"
            onPointerDown={stop}
            onPointerMove={stop}
            onPointerUp={stop}
            onClick={stop}
            onKeyDown={stop}
          >
            {/* Scrubber: pips at 5% steps would be 61 dots */}
            <div className="w-[130px]">
              <Slider
                variant="scrubber"
                label="Zoom"
                value={crop.zoom}
                min={1}
                max={MAX_ZOOM}
                step={0.05}
                formatValue={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onCropChange(clampCrop(photo, { ...crop, zoom: v as number }))}
              />
            </div>
            {children}
          </MotionElevated>
        )}
      </AnimatePresence>
    </div>
  );
}
