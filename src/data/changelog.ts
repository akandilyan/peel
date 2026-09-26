// Peel version history: the home page (What's new) and the "new" dots in the sidebar.
// When a notable change ships, add an entry at the top and bump version in
// package.json. decals — decals added or updated in the release: they get a
// dot in the sidebar while this release is the latest.

export interface Release {
  version: string;
  /** Release date, YYYY-MM-DD */
  date: string;
  /** What changed — one item per change, in English, like the UI */
  changes: string[];
  /** ids of decals added or updated in the release */
  decals?: string[];
}

export const changelog: Release[] = [
  {
    version: "0.5.0",
    date: "2026-09-26",
    changes: [
      "ID badge: a 3D card you edit in place — type your name on it, drop your photo and frame it; get a PDF for the plastic card printer with the same design on both sides.",
      "Lanyard: the Avride strap in a light and a dark design, in 3D on a snap hook — turn it to see both sides, and download the print file for sublimation.",
    ],
    decals: ["team-id-badge", "team-lanyard"],
  },
  {
    version: "0.4.0",
    date: "2026-09-26",
    changes: [
      "Team section for print beyond vehicles.",
      "Business card: enter your details, get a print-ready two-sided PDF with a QR code that saves your contact.",
      "Business card preview in 3D: drag to turn the card, or flip it with Front / Back.",
      "Business card designs: Classic, Lavender (PMS 2705 C on both sides) and Solid lavender (PMS 2715 C); rounded or square corners.",
    ],
    decals: ["team-business-card"],
  },
  {
    version: "0.3.0",
    date: "2026-09-25",
    changes: [
      "Uber FAQ QR code: 2 × 2 in card, light and dark versions.",
      "Decals with versions: pick one in the Download panel.",
    ],
    decals: ["car-uber-faq-qr-code"],
  },
  {
    version: "0.2.1",
    date: "2026-09-25",
    changes: ["Body wrap: the final cut set — two pieces per side, 1249 × 509 mm sheet."],
    decals: ["car-body-wrap"],
  },
  {
    version: "0.2.0",
    date: "2026-09-24",
    changes: [
      "Uber decals: windshield logos, side logo, unlock and back seat notices.",
      "Print-ready files: Pantone spot colors, outlined text, 0.25 pt CutContour lines and the Coated FOGRA39 profile.",
      "Lidar ID matches the reference file and supports 3- and 4-digit numbers.",
      "Download panel: set how many cars or robots you need, get one PDF or separate files.",
      "Sizes in millimeters or inches.",
    ],
    decals: [
      "car-uber-front-windshield-logo",
      "car-uber-rear-windshield-logo",
      "car-uber-side-logo",
      "car-uber-unlock-notice",
      "car-uber-back-seat-notice",
      "robot-lidar-id",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-09-23",
    changes: [
      "First version: car and robot decals with preview, size and download.",
      "Windshield ID generator, ported from the Fleet Decals Figma plugin.",
    ],
  },
];

export const latest = changelog[0];

/** Decals of the latest release — shown with a dot in the sidebar. */
export const newDecalIds = new Set(latest.decals ?? []);
