// Lidar ID transfer PDF: one page, the strip's size plus a
// margin. Everything that's cut — the strip outline with its markers, the two
// windows and the arrow pointing to the top edge — is a CutContour line, 0.25 pt,
// overprinting, in the TRANSFER layer; nothing is printed (the plastic is only
// cut). A Guides layer, on screen and not in print, names the top edge and the
// transfer, in Inter outlines (glyphs-card.json).

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import glyphData from "@/data/glyphs-card.json";
import type { BuiltFile } from "@/components/peel/use-build";
import { pathOps } from "./business-card-pdf";
import {
  layoutTransfer,
  transferLabel,
  type PathCmd,
  type TransferDesign,
} from "./lidar-transfer";

const PT_PER_MM = 72 / 25.4;
const GUIDE_TEXT_MM = 3.5;

const font = glyphData as unknown as {
  unitsPerEm: number;
  capHeight: number;
  glyphs: Record<string, { advance: number; d: string }>;
  kerning: Record<string, number>;
};

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Adds a page per transfer to the document. Layers already in the document
 *  are kept. */
function appendTransfers(doc: PDFDocument, items: TransferDesign[]): PDFPage[] {
  const ctx = doc.context;
  const cs = ctx.register(
    ctx.obj([
      PDFName.of("Separation"),
      PDFName.of("CutContour"),
      PDFName.of("DeviceCMYK"),
      ctx.register(
        ctx.obj({
          FunctionType: 2,
          Domain: [0, 1],
          Range: [0, 1, 0, 1, 0, 1, 0, 1],
          C0: [0, 0, 0, 0],
          C1: [0, 1, 0, 0],
          N: 1,
        }),
      ),
    ]),
  );
  const gs = ctx.register(
    ctx.obj({ Type: "ExtGState", OP: true, op: true, OPM: 1, CA: 1, ca: 1 }),
  );
  const cutLayer = ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of("TRANSFER") }));
  const guidesLayer = ctx.register(
    ctx.obj({
      Type: "OCG",
      Name: PDFString.of("Guides"),
      Usage: { Print: { PrintState: "OFF" }, View: { ViewState: "ON" } },
    }),
  );
  const prev = doc.catalog.lookupMaybe(PDFName.of("OCProperties"), PDFDict);
  const prevLayers = prev
    ? (prev.lookup(PDFName.of("OCGs"), PDFArray).asArray() as PDFRef[])
    : [];
  const layers = [...prevLayers, cutLayer, guidesLayer];
  doc.catalog.set(
    PDFName.of("OCProperties"),
    ctx.obj({
      OCGs: layers,
      D: {
        Order: layers,
        ON: layers,
        AS: [{ Event: "Print", OCGs: [guidesLayer], Category: ["Print"] }],
      },
    }),
  );

  return items.map(({ model, digits }) => {
    const { layout, widthMm, heightMm } = layoutTransfer(model, digits);
    const W = widthMm * PT_PER_MM;
    const H = heightMm * PT_PER_MM;
    // Layout mm (y down) → page points (y up)
    const pt = ([x, y]: [number, number]) => `${n(x * PT_PER_MM)} ${n(H - y * PT_PER_MM)}`;
    const contourOps = (c: PathCmd[]) =>
      c.map((cmd) =>
        cmd[0] === "Z"
          ? "h"
          : cmd[0] === "C"
            ? `${pt(cmd[1])} ${pt(cmd[2])} ${pt(cmd[3])} c`
            : `${pt(cmd[1])} ${cmd[0] === "M" ? "m" : "l"}`,
      );

    // A centered line of Inter outlines, baseline at y (mm)
    const text = (s: string, cx: number, baseline: number) => {
      const scale = GUIDE_TEXT_MM / font.unitsPerEm;
      let x = 0;
      const placed = [...s].map((ch, i) => {
        const g = font.glyphs[ch];
        if (i > 0) x += font.kerning[s[i - 1] + ch] ?? 0;
        const at = x;
        x += g?.advance ?? 0;
        return { g, at };
      });
      const left = cx - (x * scale) / 2;
      return placed.flatMap(({ g, at }) =>
        g?.d
          ? [
              ...pathOps(g.d, (gx, gy) => [
                (left + (at + gx) * scale) * PT_PER_MM,
                H - (baseline - gy * scale) * PT_PER_MM,
              ]),
              "f",
            ]
          : [],
      );
    };
    const [tx, ty] = layout.topMid;
    const [bx, by] = layout.bottomMid;
    const guides = [
      "/OC /Guides BDC",
      "q",
      "1 0 0 0 k",
      ...text("TOP · toward the lidar", tx, ty - 4),
      ...text(`Lidar ID transfer · ${transferLabel(model, digits)}`, bx, by + 4 + GUIDE_TEXT_MM),
      "Q",
      "EMC",
    ];
    const cut = [
      "/OC /Cut BDC",
      "q",
      "/CS0 CS 1 SCN",
      "0.25 w 4 M 0 j 0 J",
      "/GS0 gs",
      ...layout.contours.flatMap(contourOps),
      "S",
      "Q",
      "EMC",
    ];

    const page = doc.addPage([W, H]);
    page.setTrimBox(0, 0, W, H);
    page.setBleedBox(0, 0, W, H);
    page.node.set(
      PDFName.of("Resources"),
      ctx.obj({
        ColorSpace: { CS0: cs },
        ExtGState: { GS0: gs },
        Properties: { Cut: cutLayer, Guides: guidesLayer },
      }),
    );
    page.node.set(
      PDFName.of("Contents"),
      ctx.register(ctx.flateStream([...cut, ...guides].join("\n") + "\n")),
    );
    return page;
  });
}

export async function exportTransfer(t: TransferDesign, fileName: string): Promise<BuiltFile> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  appendTransfers(doc, [t]);
  doc.context.trailerInfo.Info = doc.context.register(
    doc.context.obj({
      Title: PDFHexString.fromText(fileName.replace(/\.pdf$/, "")),
      Creator: PDFString.of("Peel"),
      Producer: PDFString.of("pdf-lib (https://github.com/Hopding/pdf-lib)"),
    }),
  );
  const bytes = await doc.save({ useObjectStreams: false });
  return { name: fileName, bytes, type: "application/pdf" };
}
