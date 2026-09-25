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
