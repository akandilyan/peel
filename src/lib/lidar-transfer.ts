// Lidar ID transfer: a plastic strip that carries both lidar numbers onto the
// robot's choker (the ring under the lidar). The two numbers are stuck over the
// windows, the strip is laid on the choker with its triangle markers at the
// center of the choker's front, and the backing is peeled off on both sides.
//
// The choker is a cone, so the strip is its flat development: an annular
// sector — two concentric arcs joined by radial ends. The inner (shorter) arc is
// the choker's upper edge, where the cone is narrower. Geometry is in mm, y down,
// the strip as it lies on the choker seen from the front: inner edge on top, ends
// higher than the middle, the sector's center above it, the numbers upright.
//
// Choker numbers are fitted to the designer's Illustrator templates (A1: four
// and three digits, A1.5: four digits); the windows follow the decal size.

import { numberPresets } from "./numbers";

export type RobotModel = "a1" | "a1.5";

/** What the transfer page builds: the robot model and the number length. */
export interface TransferDesign {
  model: RobotModel;
  digits: 3 | 4;
}
export const defaultTransfer: TransferDesign = { model: "a1.5", digits: 4 };

export interface ChokerModel {
  id: RobotModel;
  name: string;
  /** Radius of the strip's inner (shorter) edge, the top of the choker. */
  innerRadiusMm: number;
  /** Strip width, inner edge to outer edge. */
  bandWidthMm: number;
  /** Half the strip's length along its centerline, from the markers to an end. */
  halfLengthMm: number;
  /** Window centers: distance from the markers along the centerline, and
   *  the offset from the centerline (negative — toward the inner, upper edge). */
  window: { arcMm: number; offsetMm: number };
}

export const chokerModels: Record<RobotModel, ChokerModel> = {
  // Template halves differ: inner radius 286.1 and 277.5 mm — averaged.
  a1: {
    id: "a1",
    name: "A1",
    innerRadiusMm: 281.8,
    bandWidthMm: 59.4,
    halfLengthMm: 182.6,
    window: { arcMm: 90.6, offsetMm: -2.7 },
  },
  // The template's edges are free curves (radius 250 to 3500 mm along one
  // edge); this is the closest sector (within 2 mm).
  "a1.5": {
    id: "a1.5",
    name: "A1.5",
    innerRadiusMm: 786.4,
    bandWidthMm: 50.3,
    halfLengthMm: 193,
    window: { arcMm: 99.3, offsetMm: -2.85 },
  },
};

/** Markers: equilateral V notches cut into both edges at the strip's middle. */
export const NOTCH_SIDE_MM = 11;
/** How far the decal overlaps the plastic around its window, on every side. */
export const WINDOW_OVERLAP_MM = 4;
/** Which edge is the top: an arrow cut out under the top marker, pointing up.
 *  The windows sit only ~3 mm closer to the top edge, too little to see, and the
 *  A1.5 strip is nearly straight. */
export const ARROW = { gapMm: 4, headWidthMm: 7, headMm: 5, stemWidthMm: 2.4, stemMm: 5 };

export type Point = [number, number];
export type PathCmd = ["M" | "L", Point] | ["C", Point, Point, Point] | ["Z"];

export interface TransferLayout {
  model: ChokerModel;
  digits: 3 | 4;
  /** Sector center; geometry is relative to it until `layoutTransfer` moves it. */
  center: Point;
  /** Strip outline (with the notches), the two windows and the arrow — closed
   *  contours, all cut. */
  contours: PathCmd[][];
  /** Middles of the top (inner) and bottom (outer) edges. */
  topMid: Point;
  bottomMid: Point;
  window: { widthMm: number; heightMm: number; centers: Point[]; anglesRad: number[] };
}

// Point at radius r and angle a (radians, 0 = straight down from the center,
// positive = to the right).
const polar = (c: Point, r: number, a: number): Point => [
  c[0] + r * Math.sin(a),
  c[1] + r * Math.cos(a),
];

// Arc from a0 to a1 at radius r as cubic Béziers, at most 30° each.
function arc(c: Point, r: number, a0: number, a1: number): PathCmd[] {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 6)));
  const out: PathCmd[] = [];
  for (let i = 0; i < n; i++) {
    const s = a0 + ((a1 - a0) * i) / n;
    const e = a0 + ((a1 - a0) * (i + 1)) / n;
    const k = (4 / 3) * Math.tan((e - s) / 4) * r;
    const p0 = polar(c, r, s);
    const p3 = polar(c, r, e);
    // Tangent along increasing angle: (cos a, −sin a)
    out.push([
      "C",
      [p0[0] + k * Math.cos(s), p0[1] - k * Math.sin(s)],
      [p3[0] - k * Math.cos(e), p3[1] + k * Math.sin(e)],
      p3,
    ]);
  }
  return out;
}

export function windowSize(digits: 3 | 4) {
  const p = numberPresets.robot;
  return {
    widthMm: p.widthByDigits[digits] - 2 * WINDOW_OVERLAP_MM,
    heightMm: p.heightMm - 2 * WINDOW_OVERLAP_MM,
  };
}

/** The transfer around its sector center at (0, 0). */
export function transferGeometry(modelId: RobotModel, digits: 3 | 4): TransferLayout {
  const model = chokerModels[modelId];
  const c: Point = [0, 0];
  const rIn = model.innerRadiusMm;
  const rOut = rIn + model.bandWidthMm;
  const rMid = rIn + model.bandWidthMm / 2;
  const end = model.halfLengthMm / rMid;
  const depth = (NOTCH_SIDE_MM * Math.sqrt(3)) / 2;
  const nOut = Math.asin(NOTCH_SIDE_MM / 2 / rOut);
  const nIn = Math.asin(NOTCH_SIDE_MM / 2 / rIn);

  // Outer edge (the long arc, bottom of the strip), left end to right end with
  // its notch pointing up; then the inner edge back with its notch down.
  const outline: PathCmd[] = [
    ["M", polar(c, rOut, -end)],
    ...arc(c, rOut, -end, -nOut),
    ["L", polar(c, rOut - depth, 0)],
    ["L", polar(c, rOut, nOut)],
    ...arc(c, rOut, nOut, end),
    ["L", polar(c, rIn, end)],
    ...arc(c, rIn, end, nIn),
    ["L", polar(c, rIn + depth, 0)],
    ["L", polar(c, rIn, -nIn)],
    ...arc(c, rIn, -nIn, -end),
    ["Z"],
  ];

  const { widthMm, heightMm } = windowSize(digits);
  const rWin = rMid + model.window.offsetMm;
  const angles = [-1, 1].map((s) => (s * model.window.arcMm) / rMid);
  const centers = angles.map((a) => polar(c, rWin, a));
  const windows = angles.map((a, i): PathCmd[] => {
    // Long side along the tangent, short side along the radius (pointing down)
    const t: Point = [Math.cos(a), -Math.sin(a)];
    const r: Point = [Math.sin(a), Math.cos(a)];
    const at = (u: number, v: number): Point => [
      centers[i][0] + t[0] * u + r[0] * v,
      centers[i][1] + t[1] * u + r[1] * v,
    ];
    const w = widthMm / 2;
    const h = heightMm / 2;
    return [["M", at(-w, h)], ["L", at(w, h)], ["L", at(w, -h)], ["L", at(-w, -h)], ["Z"]];
  });

  // Arrow pointing up, its tip ARROW.gapMm under the top marker's tip
  const tip = rIn + depth + ARROW.gapMm;
  const hw = ARROW.headWidthMm / 2;
  const sw = ARROW.stemWidthMm / 2;
  const neck = tip + ARROW.headMm;
  const tail = neck + ARROW.stemMm;
  const arrow: PathCmd[] = [
    ["M", [0, tip]],
    ["L", [hw, neck]],
    ["L", [sw, neck]],
    ["L", [sw, tail]],
    ["L", [-sw, tail]],
    ["L", [-sw, neck]],
    ["L", [-hw, neck]],
    ["Z"],
  ];

  return {
    model,
    digits,
    center: c,
    contours: [outline, ...windows, arrow],
    topMid: polar(c, rIn, 0),
    bottomMid: polar(c, rOut, 0),
    window: { widthMm, heightMm, centers, anglesRad: angles },
  };
}

/** Moves and rotates the layout: p → rotate(p, angle) + offset. */
export function transformLayout(l: TransferLayout, angleRad: number, offset: Point): TransferLayout {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const f = ([x, y]: Point): Point => [x * cos - y * sin + offset[0], x * sin + y * cos + offset[1]];
  return {
    ...l,
    center: f(l.center),
    topMid: f(l.topMid),
    bottomMid: f(l.bottomMid),
    contours: l.contours.map((cs) =>
      cs.map((cmd): PathCmd => {
        if (cmd[0] === "Z") return cmd;
        if (cmd[0] === "C") return ["C", f(cmd[1]), f(cmd[2]), f(cmd[3])];
        return [cmd[0], f(cmd[1])];
      }),
    ),
    window: { ...l.window, centers: l.window.centers.map(f), anglesRad: l.window.anglesRad.map((a) => a + angleRad) },
  };
}

/** Points of every contour, for bounds (Bézier control points included —
 *  their hull holds the curve). */
export function bounds(l: TransferLayout) {
  const pts = l.contours.flat().flatMap((cmd) => cmd.slice(1) as Point[]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** PDF page margin around the strip; the bottom guide caption sits in it. */
export const TRANSFER_MARGIN_MM = 10;

/** Strip lying horizontally, its top-left bounding corner at (margin, margin). */
export function layoutTransfer(modelId: RobotModel, digits: 3 | 4, marginMm = TRANSFER_MARGIN_MM) {
  const g = transferGeometry(modelId, digits);
  const b = bounds(g);
  const l = transformLayout(g, 0, [marginMm - b.x0, marginMm - b.y0]);
  return {
    layout: l,
    widthMm: b.x1 - b.x0 + 2 * marginMm,
    heightMm: b.y1 - b.y0 + 2 * marginMm,
    /** The strip itself, without the margin */
    stripMm: { width: b.x1 - b.x0, height: b.y1 - b.y0 },
  };
}

const f = (v: number) => String(Math.round(v * 1000) / 1000);

export function toSvgPath(contour: PathCmd[]): string {
  return contour
    .map((cmd) => (cmd[0] === "Z" ? "Z" : `${cmd[0]} ${(cmd.slice(1) as Point[]).map((p) => `${f(p[0])} ${f(p[1])}`).join(" ")}`))
    .join(" ");
}

export const transferLabel = (model: RobotModel, digits: 3 | 4) =>
  `${chokerModels[model].name} · ${digits} digits`;

/** robot-lidar-id-transfer_a1.5_4-digits.pdf */
export const transferFileName = (decalId: string, t: TransferDesign) =>
  `${decalId}_${t.model}_${t.digits}-digits.pdf`;
