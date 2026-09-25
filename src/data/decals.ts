// Peel prototype mock data: ready-made decals from print files.
// Sizes, mm: widthMm/heightMm — the PDF page (sheet), artMm — the artwork itself
// (ArtBox of the source PDF; for Unlock with live text — measured from the SVG), cutMm —
// the cut line added when rebuilding.

export type Platform = "car" | "robot";
export type DecalKind = "generator" | "static";
/** Decal type — a group in the navigation. */
export type DecalCategory = "id" | "logo" | "service" | "wrap";
/** Navigation group: base elements or a partner program
 *  (uber — decals for Uber robotaxis). */
export type DecalGroup = "base" | "uber";

export const groups: { id: DecalGroup; name: string }[] = [
  { id: "base", name: "Base" },
  { id: "uber", name: "Uber" },
];

/** How it's produced: cut from colored film, print with contour cut, print only. */
export type Production = "cut" | "print-cut" | "print";

export const productionLabels: Record<Production, string> = {
  cut: "Cut from film",
  "print-cut": "Print & cut",
  print: "Print",
};

export interface DecalVariant {
  /** Suffix of the file names: car-uber-faq-qr-code-dark.pdf */
  id: string;
  name: string;
  preview: string;
  source: string;
}

export interface Decal {
  id: string;
  platform: Platform;
  name: string;
  /** One line under the title. */
  description: string;
  kind: DecalKind;
  category: DecalCategory;
  group: DecalGroup;
  /** PDF page size (piece of film), mm. */
  widthMm: number;
  heightMm: number;
  /** Size of the artwork itself (as in the designer's spec), mm. Missing — not shown
   *  (e.g. for a wrap parts layout the overall bounding box means nothing). */
  artMm?: [number, number];
  /** Cut line added when rebuilding the PDF: x, y (from the sheet's top left corner), width, height, mm. */
  cutMm?: [number, number, number, number];
  /** Shaped cut line (backing outline), SVG path in mm from the sheet's top left corner. */
  cutPath?: string;
  /** Previews (SVG from the source PDF). One layout, even if the car needs two. */
  previews: string[];
  /** PDF to download (static decals). Generators build their own PDFs. */
  source?: string;
  production: Production;
  /** Film: for cut decals — film in a catalog color (TeckWrap …, Black vinyl,
   *  RAL 9004), for printed ones — the print base. No data — «—» in the details. */
  material?: string;
  /** Print color (printed only: print, print-cut): PMS 6219 C, Black. */
  print?: string;
  /** Where to apply. */
  placement?: string;
  /** Outside or inside the glass. */
  mounting?: string;
  /** How many decals per car or robot (default 1). Quantity in the
   *  UI is in cars/robots, decals = cars × perVehicle. */
  perVehicle?: number;
  /** Where a car's decals go if there are several: «left and right side». */
  perVehicleNote?: string;
  /** Versions of one decal (FAQ QR code: light and dark), each with its own preview
   *  and PDF; the first is the default. Such a decal has no previews/source of its own. */
  variants?: DecalVariant[];
  /** Temporarily hidden from the UI (e.g. no working file). */
  hidden?: boolean;
  /** Light artwork on a transparent background — preview on a checkerboard. */
  transparentPreview?: boolean;
}

export const platforms: { id: Platform; name: string }[] = [
  { id: "car", name: "Car" },
  { id: "robot", name: "Robot" },
];

const categories: { id: DecalCategory; name: string }[] = [
  { id: "wrap", name: "Wrap" },
  { id: "id", name: "IDs" },
  { id: "logo", name: "Logos" },
  { id: "service", name: "Service notices" },
];

export const allDecals: Decal[] = [
  {
    id: "car-windshield-id",
    platform: "car",
    name: "Windshield ID",
    description: "Fleet number for the windshield.",
    kind: "generator",
    category: "id",
    group: "base",
    widthMm: 110,
    heightMm: 45,
    previews: ["/decals/preview/car-windshield-id.svg"],
    production: "cut",
    mounting: "Outside",
    material: "White vinyl",
    placement: "Windshield",
  },
  {
    id: "car-side-logo",
    platform: "car",
    name: "Side logo",
    description: "Avride logo for both sides of the car.",
    kind: "static",
    category: "logo",
    group: "base",
    widthMm: 770,
    heightMm: 110,
    artMm: [760, 99.1],
    cutMm: [3, 3, 764, 104],
    previews: ["/decals/preview/car-side-logo.svg"],
    source: "/decals/source/car-side-logo.pdf",
    production: "print-cut",
    print: "PMS 6219 C",
    placement: "Both sides",
    mounting: "Outside",
    perVehicle: 2,
    perVehicleNote: "left and right side",
  },
  {
    id: "car-trunk-logo",
    platform: "car",
    name: "Trunk logo",
    description: "Avride logo for the trunk lid.",
    kind: "static",
    category: "logo",
    group: "base",
    widthMm: 399,
    heightMm: 64,
    artMm: [388.5, 53.9],
    cutMm: [3, 3, 393, 58],
    previews: ["/decals/preview/car-trunk-logo.svg"],
    source: "/decals/source/car-trunk-logo.pdf",
    production: "print-cut",
    print: "PMS 6219 C",
    placement: "Trunk lid",
    mounting: "Outside",
  },
  {
    id: "car-sensor-box-logo",
    platform: "car",
    name: "Sensor box logo",
    description: "Avride logo for the roof sensor box.",
    kind: "static",
    category: "logo",
    group: "base",
    widthMm: 297,
    heightMm: 50,
    artMm: [286.3, 39.7],
    cutMm: [3, 3, 291, 44],
    previews: ["/decals/preview/car-sensor-box-logo.svg"],
    source: "/decals/source/car-sensor-box-logo.pdf",
    production: "print-cut",
    print: "PMS 6219 C",
    placement: "Sensor box",
    mounting: "Outside",
  },
  {
    id: "car-uber-unlock-notice",
    platform: "car",
    name: "Unlock notice",
    description: "Door notice: “Unlock with Uber app”.",
    kind: "static",
    category: "service",
    group: "uber",
    widthMm: 248,
    heightMm: 33,
    // Text converted to outlines (regenerate-sources) — size from the visible letters
    artMm: [237.7, 23],
    cutMm: [3, 3, 242, 27],
    previews: ["/decals/preview/car-uber-unlock-notice.svg"],
    source: "/decals/source/car-uber-unlock-notice.pdf",
    production: "print-cut",
    perVehicleNote: "one per rear door",
    placement: "Rear doors",
    print: "PMS 6219 C",
    mounting: "Outside",
    perVehicle: 2,
  },
  {
    id: "car-uber-back-seat-notice",
    platform: "car",
    name: "Back seat notice",
    description: "Inside-the-glass notice: “Please use the back seat”.",
    kind: "static",
    category: "service",
    group: "uber",
    widthMm: 211,
    heightMm: 52,
    artMm: [204.1, 45.5],
    previews: ["/decals/preview/car-uber-back-seat-notice.svg"],
    source: "/decals/source/car-uber-back-seat-notice.pdf",
    // Letters are entirely CutContour outlines, no fills — cut from film
    production: "cut",
    placement: "Front passenger window",
    material: "White vinyl",
    mounting: "Inside glass, mirrored",
  },
  {
    id: "car-uber-front-windshield-logo",
    platform: "car",
    name: "Front windshield logo",
    description:
      "Uber logo for the front windshield, applied inside the glass.",
    kind: "static",
    category: "logo",
    group: "uber",
    widthMm: 114,
    heightMm: 114,
    artMm: [108, 108],
    previews: ["/decals/preview/car-uber-front-windshield-logo.svg"],
    source: "/decals/source/car-uber-front-windshield-logo.pdf",
    production: "print-cut",
    print: "Black",
    placement: "Front windshield",
    mounting: "Inside glass, face adhesive",
  },
  {
    id: "car-uber-rear-windshield-logo",
    platform: "car",
    name: "Rear windshield logo",
    description: "Uber logo for the rear windshield.",
    kind: "static",
    category: "logo",
    group: "uber",
    widthMm: 114,
    heightMm: 114,
    artMm: [108, 108],
    previews: ["/decals/preview/car-uber-rear-windshield-logo.svg"],
    source: "/decals/source/car-uber-rear-windshield-logo.pdf",
    production: "print-cut",
    print: "Black",
    placement: "Rear windshield",
    mounting: "Outside",
  },
  {
    id: "car-uber-side-logo",
    platform: "car",
    name: "Side logo",
    description: "“Available on Uber” logo for both sides of the car.",
    kind: "static",
    category: "logo",
    group: "uber",
    widthMm: 584,
    heightMm: 210,
    artMm: [573.9, 200],
    cutMm: [3, 3, 578, 204],
    previews: ["/decals/preview/car-uber-side-logo.svg"],
    source: "/decals/source/car-uber-side-logo.pdf",
    production: "print-cut",
    print: "Black",
    placement: "Both sides",
    mounting: "Outside",
    perVehicle: 2,
    perVehicleNote: "left and right side",
  },
  {
    id: "car-first-responders-notice",
    platform: "car",
    name: "First responders notice",
    description: "Emergency contact card for first responders.",
    kind: "static",
    category: "service",
    group: "base",
    widthMm: 56.8,
    heightMm: 107.6,
    artMm: [50.8, 101.6],
    cutPath:
      "M 40.25 3 L 16.55 3 C 11.8 3 9.43 3 7.62 3.92 C 6.03 4.73 4.73 6.03 3.92 7.62 C 3 9.43 3 11.8 3 16.55 L 3 91.05 C 3 95.8 3 98.17 3.92 99.98 C 4.73 101.57 6.03 102.87 7.62 103.68 C 9.43 104.6 11.8 104.6 16.55 104.6 L 40.25 104.6 C 45 104.6 47.37 104.6 49.18 103.68 C 50.77 102.87 52.07 101.57 52.88 99.98 C 53.8 98.17 53.8 95.8 53.8 91.05 L 53.8 16.55 C 53.8 11.8 53.8 9.43 52.88 7.62 C 52.07 6.03 50.77 4.73 49.18 3.92 C 47.37 3 45 3 40.25 3",
    previews: ["/decals/preview/car-first-responders-notice.svg"],
    source: "/decals/source/car-first-responders-notice.pdf",
    production: "print-cut",
    mounting: "Outside",
    placement: "C-pillar, driver side",
    print: "Black",
  },
  {
    id: "car-uber-faq-qr-code",
    platform: "car",
    name: "FAQ QR code",
    description:
      "QR code that opens the Uber autonomous rides page for Dallas.",
    kind: "static",
    category: "service",
    group: "uber",
    widthMm: 56.8,
    heightMm: 56.8,
    artMm: [50.8, 50.8],
    cutPath:
      "M 46.8 3 L 10.01 3 C 7.55 3 6.33 3 5.39 3.48 C 4.57 3.9 3.9 4.57 3.48 5.39 C 3 6.33 3 7.55 3 10 L 3 46.8 C 3 49.25 3 50.48 3.48 51.41 C 3.9 52.24 4.57 52.9 5.39 53.32 C 6.33 53.8 7.55 53.8 10.01 53.8 L 46.8 53.8 C 49.25 53.8 50.48 53.8 51.41 53.32 C 52.24 52.9 52.9 52.23 53.32 51.41 C 53.8 50.47 53.8 49.25 53.8 46.8 L 53.8 10.01 C 53.8 7.55 53.8 6.33 53.32 5.39 C 52.9 4.57 52.23 3.9 51.41 3.48 C 50.47 3 49.25 3 46.8 3 L 46.8 3 Z",
    previews: [],
    variants: [
      {
        id: "light",
        name: "Light",
        preview: "/decals/preview/car-uber-faq-qr-code-light.svg",
        source: "/decals/source/car-uber-faq-qr-code-light.pdf",
      },
      {
        id: "dark",
        name: "Dark",
        preview: "/decals/preview/car-uber-faq-qr-code-dark.svg",
        source: "/decals/source/car-uber-faq-qr-code-dark.pdf",
      },
    ],
    production: "print-cut",
    print: "Black",
  },
  {
    id: "car-body-wrap",
    platform: "car",
    name: "Body wrap",
    description: "Plotter-cut wrap shapes from Spanish Lavender film.",
    kind: "static",
    category: "wrap",
    group: "base",
    widthMm: 1249,
    heightMm: 509,
    artMm: [1242.4, 502.3],
    previews: ["/decals/preview/car-body-wrap.svg"],
    source: "/decals/source/car-body-wrap.pdf",
    production: "cut",
    material: "TeckWrap CG48-HD Spanish Lavender",
    placement: "Body",
    mounting: "Outside",
  },
  {
    id: "robot-lidar-id",
    platform: "robot",
    name: "Lidar ID",
    description: "ID number for the robot lidar.",
    kind: "generator",
    category: "id",
    group: "base",
    widthMm: 88,
    heightMm: 36,
    previews: ["/decals/preview/robot-lidar-id.svg"],
    production: "cut",
    material: "Black vinyl, RAL 9004",
    placement: "Lidar",
    mounting: "Outside",
    perVehicle: 2,
    perVehicleNote: "one per side of the lidar",
  },
  {
    id: "robot-side-logo",
    platform: "robot",
    name: "Side logo",
    description: "Avride logo for both sides of the robot.",
    kind: "static",
    category: "logo",
    group: "base",
    widthMm: 375,
    heightMm: 58,
    artMm: [365, 47.6],
    cutMm: [3, 3, 369, 52],
    previews: ["/decals/preview/robot-side-logo.svg"],
    source: "/decals/source/robot-side-logo.pdf",
    production: "print-cut",
    print: "PMS 2715 C",
    placement: "Both sides",
    mounting: "Outside",
    perVehicle: 2,
    perVehicleNote: "left and right side",
  },
  {
    id: "robot-top-logo",
    platform: "robot",
    name: "Top logo",
    description: "Avride logo for the robot lid.",
    kind: "static",
    category: "logo",
    group: "base",
    widthMm: 130,
    heightMm: 26,
    artMm: [120, 15.6],
    cutMm: [3, 3, 124, 20],
    previews: ["/decals/preview/robot-top-logo.svg"],
    source: "/decals/source/robot-top-logo.pdf",
    production: "print-cut",
    print: "PMS 6219 C",
    placement: "Lid",
    mounting: "Outside",
  },
  {
    id: "robot-qr-code",
    platform: "robot",
    name: "QR code",
    description: "QR code with a phone number and avride.ai.",
    kind: "static",
    category: "service",
    group: "base",
    widthMm: 66,
    heightMm: 32.2,
    artMm: [60, 26.2],
    cutPath:
      "M 3 6.15 C 3 4.41 4.41 3 6.15 3 L 26.1 3 C 27.84 3 29.25 4.41 29.25 6.15 L 29.25 7.04 C 29.25 7.92 29.25 8.37 29.42 8.7 C 29.57 9 29.81 9.24 30.11 9.39 C 30.45 9.56 30.89 9.56 31.77 9.56 L 34.23 9.56 C 35.11 9.56 35.55 9.56 35.89 9.39 C 36.19 9.24 36.43 9 36.58 8.7 C 36.75 8.37 36.75 7.92 36.75 7.04 L 36.75 6.15 C 36.75 4.41 38.16 3 39.9 3 L 59.85 3 C 61.59 3 63 4.41 63 6.15 L 63 26.1 C 63 27.84 61.59 29.25 59.85 29.25 L 39.9 29.25 C 38.16 29.25 36.75 27.84 36.75 26.1 L 36.75 25.21 C 36.75 24.33 36.75 23.88 36.58 23.55 C 36.43 23.25 36.19 23.01 35.89 22.86 C 35.55 22.69 35.11 22.69 34.23 22.69 L 31.77 22.69 C 30.89 22.69 30.45 22.69 30.11 22.86 C 29.81 23.01 29.57 23.25 29.42 23.55 C 29.25 23.88 29.25 24.33 29.25 25.21 L 29.25 26.1 C 29.25 27.84 27.84 29.25 26.1 29.25 L 6.15 29.25 C 4.41 29.25 3 27.84 3 26.1 Z",
    previews: ["/decals/preview/robot-qr-code.svg"],
    source: "/decals/source/robot-qr-code.pdf",
    production: "print-cut",
    mounting: "Outside",
    placement: "Back",
    print: "Black",
  },
];

/** Preview and PDF of a decal, or of its version (the first one by default). */
export function decalFiles(
  decal: Decal,
  variantId?: string,
): { id: string; preview?: string; source?: string } {
  const vs = decal.variants;
  if (!vs?.length)
    return { id: decal.id, preview: decal.previews[0], source: decal.source };
  const v = vs.find((x) => x.id === variantId) ?? vs[0];
  return { id: `${decal.id}-${v.id}`, preview: v.preview, source: v.source };
}

/** Decals in the UI — without temporarily hidden ones. */
export const decals = allDecals.filter((d) => !d.hidden);

/** Platform decals in sidebar order: groups (Base, Uber), categories within them. */
export function decalsInOrder(platform: Platform): Decal[] {
  const cat = (d: Decal) => categories.findIndex((c) => c.id === d.category);
  return groups.flatMap((g) =>
    decals
      .filter((d) => d.platform === platform && d.group === g.id)
      .sort((x, y) => cat(x) - cat(y)),
  );
}

/** Old decal URLs (before the «place + type» naming scheme) → new ones. Pages are
 *  built for them too, and the app replaces the URL with the new one — links that
 *  were already shared don't break (static hosting has no redirects). */
export const renamedDecals: Record<string, string> = {
  "car-number": "car-windshield-id",
  "car-rear-logo": "car-trunk-logo",
  "car-unlock-notice": "car-uber-unlock-notice",
  "car-back-seat-notice": "car-uber-back-seat-notice",
  "car-uber-front-windshield": "car-uber-front-windshield-logo",
  "car-uber-rear-windshield": "car-uber-rear-windshield-logo",
  "car-uber-side": "car-uber-side-logo",
  "car-first-responders": "car-first-responders-notice",
  "car-wrap-lavender": "car-body-wrap",
};
