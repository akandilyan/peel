// Lanyard PDF for dye sublimation: two pages, the tape's outside (the logo lockup
// repeated along it, all reading one way) and its inside (the pattern), each the
// full 20 × 900 mm strip at 1:1, laid horizontally, with bleed. TrimBox on the
// strip. Inks are spot colors with CMYK fallbacks; the light ground is the
// unprinted white tape, the dark ground is printed over the whole bleed and the
// artwork knocks out of it. Guides (trim, safe margin, sewn ends, the middle)
// sit in a Guides layer that shows on screen and doesn't print.

import { PDFDocument, PDFHexString, PDFName, PDFString, type PDFRef } from "pdf-lib";
import art from "@/data/lanyard-art.json";
import type { BuiltFile } from "@/components/peel/use-build";
import { pathOps, type Point } from "./business-card-pdf";
import {
  LANYARD_PRINT,
  STRAP_LENGTH_MM,
  STRAP_WIDTH_MM,
  lanyardInks,
  type LanyardDesign,
} from "./lanyard";
import type { SpotInk } from "./business-card";

const PT_PER_MM = 72 / 25.4;
/** Figma strip pixels → mm: the strip's 64 px are the strap's width. */
const MM_PER_PX = STRAP_WIDTH_MM / art.strip.height;

/** The inside pattern's grid, as the Figma symbol lays it out and the 3D
 *  preview maps it: tile (gx, gy) → strip px = M · (gx, gy) + t, the tile
 *  219.28 × 125.51 px (the tile artwork is drawn at 2000 × 1142). */
const GRID = {
  a: 0.7071019411087036,
  b: -0.7071019411087036,
  c: 0.7071115970611572,
  d: 0.7071115970611572,
  tx: 507.13604736328125,
  ty: -1906.8492431640625,
  tileWidth: 219.28196716308594,
  tileHeight: 125.50543212890625,
};

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

const fillOps = (paths: { d: string; evenOdd: boolean }[], map: Point) =>
  paths.flatMap((p) => [...pathOps(p.d, map), p.evenOdd ? "f*" : "f"]);

export async function exportLanyard(design: LanyardDesign, fileName: string): Promise<BuiltFile> {
  const { ground, ink } = lanyardInks[design];
  const { bleedAcrossMm, bleedAlongMm, safeMm, sewMm } = LANYARD_PRINT;
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const W = (STRAP_LENGTH_MM + 2 * bleedAlongMm) * PT_PER_MM;
  const H = (STRAP_WIDTH_MM + 2 * bleedAcrossMm) * PT_PER_MM;
  // Strap mm (x along from the left end, y down from the top edge) → page points
  const X = (x: number) => (x + bleedAlongMm) * PT_PER_MM;
  const Y = (y: number) => H - (y + bleedAcrossMm) * PT_PER_MM;

  const separation = (i: SpotInk) =>
    ctx.register(
      ctx.obj([
        PDFName.of("Separation"),
        PDFName.of(i.spot),
        PDFName.of("DeviceCMYK"),
        ctx.register(
          ctx.obj({
            FunctionType: 2,
            Domain: [0, 1],
            Range: [0, 1, 0, 1, 0, 1, 0, 1],
            C0: [0, 0, 0, 0],
            C1: i.cmyk,
            N: 1,
          }),
        ),
      ]),
    );
  const inkCs = separation(ink);
  const groundCs = ground ? separation(ground) : null;

  // Guides: on screen, not in print
  const guidesLayer = ctx.register(
    ctx.obj({
      Type: "OCG",
      Name: PDFString.of("Guides"),
      Usage: { Print: { PrintState: "OFF" }, View: { ViewState: "ON" } },
    }),
  );
  doc.catalog.set(
    PDFName.of("OCProperties"),
    ctx.obj({
      OCGs: [guidesLayer],
      D: {
        Order: [guidesLayer],
        ON: [guidesLayer],
        AS: [{ Event: "Print", OCGs: [guidesLayer], Category: ["Print"] }],
      },
    }),
  );
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `${n(X(x1))} ${n(Y(y1))} m ${n(X(x2))} ${n(Y(y2))} l S`;
  const rect = (x: number, y: number, w: number, h: number) =>
    `${n(X(x))} ${n(Y(y + h))} ${n(w * PT_PER_MM)} ${n(h * PT_PER_MM)} re S`;
  const L = STRAP_LENGTH_MM;
  const guides = [
    "/OC /Guides BDC",
    "q",
    "0 1 0 0 K",
    "0.5 w",
    rect(0, 0, L, STRAP_WIDTH_MM),
    "[2 2] 0 d",
    "0.35 w",
    rect(safeMm, safeMm, L - 2 * safeMm, STRAP_WIDTH_MM - 2 * safeMm),
    line(sewMm, 0, sewMm, STRAP_WIDTH_MM),
    line(L - sewMm, 0, L - sewMm, STRAP_WIDTH_MM),
    "[6 3 1 3] 0 d",
    line(L / 2, 0, L / 2, STRAP_WIDTH_MM),
    "Q",
    "EMC",
  ];

  const addPage = (body: string[], xObjects: Record<string, PDFRef> = {}) => {
    const p = doc.addPage([W, H]);
    const t = [bleedAlongMm * PT_PER_MM, bleedAcrossMm * PT_PER_MM];
    p.setTrimBox(t[0], t[1], W - 2 * t[0], H - 2 * t[1]);
    p.setBleedBox(0, 0, W, H);
    p.node.set(
      PDFName.of("Resources"),
      ctx.obj({
        ColorSpace: { Ink: inkCs, ...(groundCs ? { Ground: groundCs } : {}) },
        XObject: xObjects,
        Properties: { Guides: guidesLayer },
      }),
    );
    const fill = groundCs ? ["q", "/Ground cs 1 scn", `0 0 ${n(W)} ${n(H)} re f`, "Q"] : [];
    p.node.set(
      PDFName.of("Contents"),
      ctx.register(ctx.flateStream([...fill, ...body, ...guides].join("\n") + "\n")),
    );
  };

  // Outside: the lockup at the Figma pitch, as many as fit between the sewn
  // ends, centered on the strap
  const { lockup } = art;
  const pitch = lockup.pitch * MM_PER_PX;
  const width = (lockup.right - lockup.left) * MM_PER_PX;
  const count = Math.floor((L - 2 * sewMm - width) / pitch) + 1;
  const start = (L - (count - 1) * pitch - width) / 2;
  const lockups = Array.from({ length: count }, (_, i) => {
    const x0 = start + i * pitch - lockup.left * MM_PER_PX;
    const map: Point = (x, y) => [X(x0 + x * MM_PER_PX), Y(y * MM_PER_PX)];
    return fillOps(lockup.paths, map);
  }).flat();
  addPage(["q", "/Ink cs 1 scn", ...lockups, "Q"]);

  // Inside: the pattern tile as a form, placed over every grid cell that
  // touches the bleed and clipped to it — plain paths, no tiling pattern, so
  // any RIP renders it without seams
  const { tile } = art;
  const tileForm = ctx.register(
    ctx.flateStream(["/Ink cs 1 scn", ...fillOps(tile.paths, (x, y) => [x, y])].join("\n"), {
      Type: "XObject",
      Subtype: "Form",
      BBox: [0, 0, tile.width, tile.height],
      Resources: { ColorSpace: { Ink: inkCs } },
    }),
  );
  const { a, b, c, d, tx, ty, tileWidth: TW, tileHeight: TH } = GRID;
  const det = a * d - b * c;
  const toGrid = (px: number, py: number) => [
    (d * (px - tx) - b * (py - ty)) / det,
    (-c * (px - tx) + a * (py - ty)) / det,
  ];
  // The bleed's corners in strip px → the range of grid cells
  const x0 = -bleedAlongMm / MM_PER_PX;
  const x1 = (L + bleedAlongMm) / MM_PER_PX;
  const y0 = -bleedAcrossMm / MM_PER_PX;
  const y1 = (STRAP_WIDTH_MM + bleedAcrossMm) / MM_PER_PX;
  const corners = [
    toGrid(x0, y0),
    toGrid(x1, y0),
    toGrid(x0, y1),
    toGrid(x1, y1),
  ];
  const range = (k: 0 | 1, size: number) => [
    Math.floor(Math.min(...corners.map((p) => p[k])) / size),
    Math.floor(Math.max(...corners.map((p) => p[k])) / size),
  ];
  const [i0, i1] = range(0, TW);
  const [j0, j1] = range(1, TH);
  // Tile artwork units → page: scale to the tile, into the grid, strip px → pt
  const sx = TW / tile.width;
  const sy = TH / tile.height;
  const k = MM_PER_PX * PT_PER_MM;
  const placed: string[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const ox = a * i * TW + b * j * TH + tx;
      const oy = c * i * TW + d * j * TH + ty;
      // Skip cells whose tile misses the bleed (its bounding circle)
      const cx = ox + (a * TW + b * TH) / 2;
      const cy = oy + (c * TW + d * TH) / 2;
      const r = Math.hypot(TW, TH) / 2;
      if (cx + r < x0 || cx - r > x1 || cy + r < y0 || cy - r > y1) continue;
      const m = [a * sx * k, -c * sx * k, b * sy * k, -d * sy * k, X(ox * MM_PER_PX), Y(oy * MM_PER_PX)];
      placed.push(`q ${m.map(n).join(" ")} cm /Tile Do Q`);
    }
  }
  addPage(["q", `0 0 ${n(W)} ${n(H)} re W n`, ...placed, "Q"], { Tile: tileForm });

  const info = ctx.obj({
    Title: PDFHexString.fromText(fileName.replace(/\.pdf$/, "")),
    Creator: PDFString.of("Peel"),
    Producer: PDFString.of("pdf-lib (https://github.com/Hopding/pdf-lib)"),
  });
  ctx.trailerInfo.Info = ctx.register(info);
  const bytes = await doc.save({ useObjectStreams: false });
  return { name: fileName, bytes, type: "application/pdf" };
}
