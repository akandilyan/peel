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
    version: "0.6.2",
    date: "2026-09-29",
    changes: [
      "Side, Trunk and Sensor box logos and the Unlock notice are cut from Oracal 651 071 Grey gloss film, not printed: their PDFs hold only the cut line, and the previews show it.",
      "Windshield ID and Back seat notice list their film: Oracal 651 010 White gloss.",
      "Body wrap covers both sides of the car: the second row is now the mirrored side, turned to nest along the first. The sheet is 1295 × 480 mm and fits across a 60 in roll.",
    ],
    decals: ["car-body-wrap", "car-side-logo", "car-trunk-logo", "car-sensor-box-logo", "car-uber-unlock-notice", "car-windshield-id", "car-uber-back-seat-notice"],
  },
  {
    version: "0.6.1",
    date: "2026-09-28",
    changes: [
      "Logos and the Unlock notice are cut along the letters instead of a rectangle: only the artwork goes on the car, applied with transfer tape. Decals on a white card keep their card outline.",
      "Previews of these decals are drawn from the print file, so the cut line sits exactly on the artwork.",
    ],
    decals: ["car-uber-unlock-notice", "car-uber-side-logo", "car-side-logo", "car-trunk-logo", "car-sensor-box-logo", "robot-side-logo", "robot-top-logo"],
  },
  {
    version: "0.6.0",
    date: "2026-09-28",
    changes: [
      "ID badge: a new photo frames itself on your face — sized and centered on the head, with room over the hair; Auto frame brings it back after you move it.",
      "ID badge: zoom, Auto, Replace and Remove sit on the card while you frame the photo.",
      "ID badge: paste a full name into the first name and it splits into first and last name.",
      "Clear all on the ID badge and the business card empties every field at once.",
    ],
    decals: ["team-id-badge", "team-business-card"],
  },
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
