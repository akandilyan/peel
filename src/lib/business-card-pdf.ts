// Business card PDF for print: two pages (front, back), 1/8 in bleed, TrimBox on
// the card edge. Lavender is a spot color (PANTONE 2705 C or 2715 C, CMYK
// fallback) over the whole bleed; the logo, and white text on a lavender back,
// are knocked out to paper white. On a white back, text and the QR code are 100% K,
// text always as outlines. Rounded corners add the die line: a CutContour path
// on the trim in its own layer, 0.25 pt, overprinting.

import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from "pdf-lib";
import {
  CARD,
  CORNER_MM,
  LOGO,
  cardStyles,
  layoutCard,
  type CardDesign,
  type CardFields,
  type SpotInk,
} from "./business-card";
import type { BuiltFile } from "@/components/peel/use-build";

const PT_PER_MM = 72 / 25.4;

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

export type Point = (x: number, y: number) => [number, number];

// SVG path (absolute M L H V Q C Z) → PDF path operators. map takes the path's
// coordinates to the page. Quadratic curves → cubic.
export function pathOps(d: string, map: Point): string[] {
  const ops: string[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const pt = (x: number, y: number) => map(x, y).map(n).join(" ");
  for (const [, cmd, args] of d.matchAll(/([MLHVQCZ])([^MLHVQCZ]*)/g)) {
    const a = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === "M") {
      cx = sx = a[0];
      cy = sy = a[1];
      ops.push(`${pt(cx, cy)} m`);
    } else if (cmd === "L" || cmd === "H" || cmd === "V") {
      if (cmd === "L") [cx, cy] = a;
      else if (cmd === "H") cx = a[0];
      else cy = a[0];
      ops.push(`${pt(cx, cy)} l`);
    } else if (cmd === "Q") {
      const [qx, qy, ex, ey] = a;
      const c1 = pt(cx + (2 / 3) * (qx - cx), cy + (2 / 3) * (qy - cy));
      const c2 = pt(ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey));
      ops.push(`${c1} ${c2} ${pt(ex, ey)} c`);
      cx = ex;
      cy = ey;
    } else if (cmd === "C") {
      ops.push(`${pt(a[0], a[1])} ${pt(a[2], a[3])} ${pt(a[4], a[5])} c`);
      cx = a[4];
      cy = a[5];
    } else if (cmd === "Z") {
      ops.push("h");
      cx = sx;
      cy = sy;
    }
  }
  return ops;
}

// Rounded rectangle path; a circle quarter as one Bézier (k = 0.5523)
function roundedRectOps(x: number, y: number, w: number, h: number, r: number): string[] {
  const k = r * 0.5523;
  const p = (...v: number[]) => v.map(n).join(" ");
  return [
    `${p(x + r, y)} m`,
    `${p(x + w - r, y)} l`,
    `${p(x + w - r + k, y, x + w, y + r - k, x + w, y + r)} c`,
    `${p(x + w, y + h - r)} l`,
    `${p(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)} c`,
    `${p(x + r, y + h)} l`,
    `${p(x + r - k, y + h, x, y + h - r + k, x, y + h - r)} c`,
    `${p(x, y + r)} l`,
    `${p(x, y + r - k, x + r - k, y, x + r, y)} c`,
    "h",
  ];
}

export async function exportBusinessCard(
  fields: CardFields,
  design: CardDesign,
  fileName: string,
): Promise<BuiltFile> {
  const style = cardStyles[design.style];
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const bleed = CARD.bleedMm;
  const W = (CARD.widthMm + 2 * bleed) * PT_PER_MM;
  const H = (CARD.heightMm + 2 * bleed) * PT_PER_MM;
  const t = bleed * PT_PER_MM;
  // Card mm (top left of the trim, y down) → page points (bottom left, y up)
  const X = (x: number) => (x + bleed) * PT_PER_MM;
  const Y = (y: number) => H - (y + bleed) * PT_PER_MM;

  // Spot colors, one Separation per ink, shared by the pages
  const separation = (name: string, cmyk: number[]) =>
    ctx.register(
      ctx.obj([
        PDFName.of("Separation"),
        PDFName.of(name),
        PDFName.of("DeviceCMYK"),
        ctx.register(
          ctx.obj({
            FunctionType: 2,
            Domain: [0, 1],
            Range: [0, 1, 0, 1, 0, 1, 0, 1],
            C0: [0, 0, 0, 0],
            C1: cmyk,
            N: 1,
          }),
        ),
      ]),
    );
  const inks = new Map<SpotInk, ReturnType<typeof separation>>();
  const inkOf = (ink: SpotInk) => {
    if (!inks.has(ink)) inks.set(ink, separation(ink.spot, ink.cmyk));
    return inks.get(ink)!;
  };

  // Die line for rounded corners: CutContour, overprinting, in the CUT layer
  const die = design.rounded
    ? {
        cs: separation("CutContour", [0, 1, 0, 0]),
        gs: ctx.register(ctx.obj({ Type: "ExtGState", OP: true, op: true, OPM: 1 })),
        layer: ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of("CUT") })),
      }
    : null;
  if (die)
    doc.catalog.set(
      PDFName.of("OCProperties"),
      ctx.obj({ OCGs: [die.layer], D: { Order: [die.layer], ON: [die.layer] } }),
    );
  const dieOps = die
    ? [
        "/OC /Cut BDC",
        "q",
        "/Die CS 1 SCN",
        "0.25 w",
        "/DieGS gs",
        ...roundedRectOps(t, t, W - 2 * t, H - 2 * t, CORNER_MM * PT_PER_MM),
        "S",
        "Q",
        "EMC",
      ]
    : [];

  const addPage = (background: SpotInk | null, body: string[]) => {
    const p = doc.addPage([W, H]);
    p.setTrimBox(t, t, W - 2 * t, H - 2 * t);
    p.setBleedBox(0, 0, W, H);
    p.node.set(
      PDFName.of("Resources"),
      ctx.obj({
        ColorSpace: {
          ...(background ? { Bg: inkOf(background) } : {}),
          ...(die ? { Die: die.cs } : {}),
        },
        ExtGState: die ? { DieGS: die.gs } : {},
        Properties: die ? { Cut: die.layer } : {},
      }),
    );
    // Lavender over the whole bleed; what follows in paper white knocks out of it
    const fill = background ? ["q", "/Bg cs 1 scn", `0 0 ${n(W)} ${n(H)} re f`, "Q"] : [];
    p.node.set(
      PDFName.of("Contents"),
      ctx.register(ctx.flateStream([...fill, ...body, ...dieOps].join("\n") + "\n")),
    );
  };

  // Front: the logo in paper white
  const logoMap: Point = (x, y) => [
    X(LOGO.x + x * LOGO.scale),
    Y(LOGO.y + y * LOGO.scale),
  ];
  addPage(style.front, [
    "q",
    "0 0 0 0 k",
    ...LOGO.paths.flatMap((d) => [...pathOps(d, logoMap), "f*"]),
    "Q",
  ]);

  // Back: outlined text and QR modules — 100% K on paper, paper white on lavender
  const layout = layoutCard(fields);
  const text = Object.values(layout.lines).flatMap((line) =>
    line!.glyphs.flatMap((g) =>
      pathOps(g.d, (x, y) => [X(g.x + x * g.scale), Y(g.y - y * g.scale)]),
    ),
  );
  // QR: one rectangle per horizontal run of dark modules
  const { qr } = layout;
  const m = qr.moduleMm;
  const modules: string[] = [];
  for (let r = 0; r < qr.modules; r++) {
    for (let c = 0; c < qr.modules; c++) {
      if (!qr.isDark(r, c)) continue;
      let end = c;
      while (end + 1 < qr.modules && qr.isDark(r, end + 1)) end++;
      const x = X(qr.x + c * m);
      const y = Y(qr.y + (r + 1) * m);
      modules.push(
        `${n(x)} ${n(y)} ${n((end - c + 1) * m * PT_PER_MM)} ${n(m * PT_PER_MM)} re`,
      );
      c = end;
    }
  }
  const ink = style.text === "white" ? "0 0 0 0 k" : "0 0 0 1 k";
  addPage(style.back, ["q", ink, ...text, "f", ...modules, "f", "Q"]);

  const info = ctx.obj({
    Title: PDFHexString.fromText(fileName.replace(/\.pdf$/, "")),
    Creator: PDFString.of("Peel"),
    Producer: PDFString.of("pdf-lib (https://github.com/Hopding/pdf-lib)"),
  });
  ctx.trailerInfo.Info = ctx.register(info);
  const bytes = await doc.save({ useObjectStreams: false });
  return { name: fileName, bytes, type: "application/pdf" };
}
