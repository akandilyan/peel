// Builds the PDF for cutting — a port of pdf.js from the Fleet Decals plugin.
// Outlines are stroked with the Separation spot color "CutContour" (fallback
// DeviceCMYK 0/100/0/0), 0.25 pt, no fill, overprint on (what RIPs expect;
// it was off in the plugin).
// Layers (Optional Content): the number and the cut frame are separate. In a
// multi-page file every page has a bookmark with its number.

import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  type PDFRef,
  type PDFPage,
} from "pdf-lib";
import type { PdfPageLayout } from "./glyph-layout";

const PDF_VERSION = "0.1";

export interface Ink {
  spot: string;
  cmyk: [number, number, number, number];
  widthPt: number;
}

const CUT_CONTOUR: Ink = {
  spot: "CutContour",
  cmyk: [0, 1, 0, 0],
  widthPt: 0.25,
};

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

// Glyph outline (font units, y axis up) -> PDF path operators. Quadratic curves -> cubic.
function pathOps(d: string, x: number, y: number, s: number): string[] {
  const ops: string[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const X = (v: number) => x + v * s;
  const Y = (v: number) => y + v * s;
  for (const [, cmd, args] of d.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const a = args.trim() ? args.trim().split(/\s+/).map(Number) : [];
    if (cmd === "M") {
      cx = sx = a[0];
      cy = sy = a[1];
      ops.push(`${n(X(cx))} ${n(Y(cy))} m`);
    } else if (cmd === "L") {
      cx = a[0];
      cy = a[1];
      ops.push(`${n(X(cx))} ${n(Y(cy))} l`);
    } else if (cmd === "Q") {
      const [qx, qy, ex, ey] = a;
      const c1x = cx + (2 / 3) * (qx - cx);
      const c1y = cy + (2 / 3) * (qy - cy);
      const c2x = ex + (2 / 3) * (qx - ex);
      const c2y = ey + (2 / 3) * (qy - ey);
      ops.push(
        `${n(X(c1x))} ${n(Y(c1y))} ${n(X(c2x))} ${n(Y(c2y))} ${n(X(ex))} ${n(Y(ey))} c`,
      );
      cx = ex;
      cy = ey;
    } else if (cmd === "C") {
      ops.push(
        `${n(X(a[0]))} ${n(Y(a[1]))} ${n(X(a[2]))} ${n(Y(a[3]))} ${n(X(a[4]))} ${n(Y(a[5]))} c`,
      );
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

function frameOps(f: PdfPageLayout["frame"]): string[] {
  return [`${n(f.x)} ${n(f.y)} ${n(f.width)} ${n(f.height)} re`];
}

interface Resources {
  cs: PDFRef;
  gs: PDFRef;
  text: PDFRef;
  frame: PDFRef;
}

// Shared document resources: spot color, graphics state, layers.
function resources(doc: PDFDocument, ink: Ink, layerName: string): Resources {
  const ctx = doc.context;
  const tint = ctx.register(
    ctx.obj({
      FunctionType: 2,
      Domain: [0, 1],
      Range: [0, 1, 0, 1, 0, 1, 0, 1],
      C0: [0, 0, 0, 0],
      C1: ink.cmyk,
      N: 1,
    }),
  );
  const cs = ctx.register(
    ctx.obj([
      PDFName.of("Separation"),
      PDFName.of(ink.spot),
      PDFName.of("DeviceCMYK"),
      tint,
    ]),
  );
  const gs = ctx.register(
    ctx.obj({ Type: "ExtGState", OP: true, op: true, OPM: 1, CA: 1, ca: 1 }),
  );
  const layer = (name: string) =>
    ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of(name) }));
  const text = layer(layerName);
  const frame = layer("CUT_FRAME");
  doc.catalog.set(
    PDFName.of("OCProperties"),
    ctx.obj({
      OCGs: [text, frame],
      D: { Order: [text, frame], ON: [text, frame], BaseState: "ON" },
    }),
  );
  return { cs, gs, text, frame };
}

function addDecalPage(
  doc: PDFDocument,
  res: Resources,
  page: PdfPageLayout,
  ink: Ink,
): PDFPage {
  const ctx = doc.context;
  const p = doc.addPage([page.width, page.height]);
  p.setTrimBox(0, 0, page.width, page.height);
  p.setBleedBox(0, 0, page.width, page.height);
  p.node.set(
    PDFName.of("Resources"),
    ctx.obj({
      ColorSpace: { CS0: res.cs },
      ExtGState: { GS0: res.gs },
      Properties: { MC0: res.text, MC1: res.frame },
    }),
  );
  const stroke = [
    "/CS0 CS 1 SCN",
    `${n(ink.widthPt)} w 4 M 0 j 0 J`,
    "/GS0 gs",
  ];
  const glyphs = page.items.flatMap((it) =>
    pathOps(it.d, it.x, it.y, page.scale),
  );
  const body = ["/OC /MC0 BDC", "q", ...stroke, ...glyphs, "S", "Q", "EMC"];
  body.push(
    "/OC /MC1 BDC",
    "q",
    ...stroke,
    ...frameOps(page.frame),
    "S",
    "Q",
    "EMC",
  );
  p.node.set(
    PDFName.of("Contents"),
    ctx.register(ctx.flateStream(body.join("\n") + "\n")),
  );
  return p;
}

// Bookmarks: one per page, with the decal number.
function addOutline(
  doc: PDFDocument,
  pages: { label: string; page: PDFPage }[],
) {
  const ctx = doc.context;
  const outlines = ctx.nextRef();
  const refs = pages.map(() => ctx.nextRef());
  pages.forEach(({ label, page }, i) => {
    const item: Record<string, unknown> = {
      Title: PDFHexString.fromText(label),
      Parent: outlines,
      Dest: [page.ref, PDFName.of("Fit")],
    };
    if (i > 0) item.Prev = refs[i - 1];
    if (i < pages.length - 1) item.Next = refs[i + 1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx.assign(refs[i], ctx.obj(item as any));
  });
  ctx.assign(
    outlines,
    ctx.obj({
      Type: "Outlines",
      First: refs[0],
      Last: refs[refs.length - 1],
      Count: refs.length,
    }),
  );
  doc.catalog.set(PDFName.of("Outlines"), outlines);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

export async function createDocument(
  pages: PdfPageLayout[],
  title: string,
  opts: {
    layer: string;
    ink?: Ink;
    onPage?: (i: number) => Promise<void> | void;
  },
): Promise<Uint8Array> {
  const ink = opts.ink ?? CUT_CONTOUR;
  const doc = await PDFDocument.create({ updateMetadata: false });
  const res = resources(doc, ink, opts.layer);
  const added: { label: string; page: PDFPage }[] = [];
  for (let i = 0; i < pages.length; i++) {
    added.push({
      label: pages[i].label,
      page: addDecalPage(doc, res, pages[i], ink),
    });
    if (opts.onPage) await opts.onPage(i);
  }
  if (pages.length > 1) addOutline(doc, added);
  const info = doc.context.obj({
    Title: PDFHexString.fromText(title),
    Creator: PDFString.of(`Peel ${PDF_VERSION}`),
    Producer: PDFString.of("pdf-lib (https://github.com/Hopding/pdf-lib)"),
  });
  doc.context.trailerInfo.Info = doc.context.register(info);
  return doc.save({ useObjectStreams: false });
}
