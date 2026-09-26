// Avride lanyard: a 20 × 900 mm strap, the logo outside and a pattern inside (the
// Figma file "Avride Merch Concepts"), on a swivel snap hook. Two designs, light
// and dark. Printed by dye sublimation on white polyester tape, both sides; the
// ends are sewn into a loop around the hook's ring.

import type { SpotInk } from "./business-card";

export type LanyardDesign = "light" | "dark";

/** The designs, with the strap's ground and print colors (from the artwork). */
export const lanyardDesigns: { id: LanyardDesign; name: string; ground: string; ink: string }[] = [
  { id: "light", name: "Light", ground: "#ffffff", ink: "#9885ff" },
  { id: "dark", name: "Dark", ground: "#282d33", ink: "#b1a5ff" },
];

/** Print inks per design, the brand's spot colors as on the business card: the ground (none — the white tape) and the artwork.
 *  The dark ground is PANTONE 426 C, the nearest to the artwork's #282D33 (to be
 *  confirmed with the manufacturer). */
export const lanyardInks: Record<LanyardDesign, { ground: SpotInk | null; ink: SpotInk }> = {
  light: {
    ground: null,
    ink: { screen: "#9885ff", spot: "PANTONE 2715 C", cmyk: [0.48, 0.52, 0, 0] },
  },
  dark: {
    ground: { screen: "#282d33", spot: "PANTONE 426 C", cmyk: [0.75, 0.62, 0.52, 0.7] },
    ink: { screen: "#b1a5ff", spot: "PANTONE 2705 C", cmyk: [0.38, 0.35, 0, 0] },
  },
};

export const defaultLanyardDesign: LanyardDesign = "light";

/** Strap width, mm: 3/4 in, the most common lanyard. */
export const STRAP_WIDTH_MM = 20;

/** Strap length, mm: the whole loop, flat, before sewing. */
export const STRAP_LENGTH_MM = 900;

/** The badge the preview hangs on the hook — only its blank top shows: a CR80
 *  card with the standard slot punch, 1/2 × 1/8 in, 2.5 mm below the top edge. */
export const PREVIEW_CARD = { widthMm: 53.98, heightMm: 85.6 };
export const CARD_SLOT = {
  x: (PREVIEW_CARD.widthMm - 12.7) / 2,
  y: 2.5,
  width: 12.7,
  height: 3.2,
};

/** The print file's layout, mm: bleed across the width and past the ends, the
 *  safe margin from the edges, and the sewn zone at each end (folded around the
 *  ring and stitched) that the logos keep out of. */
export const LANYARD_PRINT = {
  bleedAcrossMm: 2,
  bleedAlongMm: 5,
  safeMm: 2,
  sewMm: 38,
};
