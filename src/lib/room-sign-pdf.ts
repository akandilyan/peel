// Meeting room sign PDF: a 380 mm square page per room, everything that's cut —
// the ring's two circles and the name's letters — as a CutContour line, 0.25 pt,
// overprinting, in the CUT layer; nothing is printed (the film is only cut and
// weeded). Letters that touch (ff, ft, tf, tt, T7 — the crossbars meet even at −1% tracking) are merged into
// one outline with paper.js, so the knife never cuts through a letter. A Guides
// layer, on screen and not in print, names the room and the film.

import { zipSync } from "fflate";
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from "pdf-lib";
import type { BuiltFile } from "@/components/peel/use-build";
import { pathOps } from "./business-card-pdf";
import { Cancelled } from "./export-decals";
import {
  ROOM_SIGN,
  layoutRoomSign,
  roomLabel,
  roomSignFileName,
  roomSignFilms,
  roomSlug,
  type PlacedRoomGlyph,
  type RoomFont,
  type RoomSignFilm,
} from "./room-sign";

const PT_PER_MM = 72 / 25.4;
const GUIDE_TEXT_MM = 3.5;
const K = 0.5523;

type Paper = typeof import("paper/dist/paper-core");
type Scope = InstanceType<Paper["PaperScope"]>;

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

// A circle as four Béziers, page points
function circleOps(cx: number, cy: number, r: number): string[] {
  const p = (...v: number[]) => v.map(n).join(" ");
  const k = r * K;
  return [
    `${p(cx + r, cy)} m`,
    `${p(cx + r, cy + k, cx + k, cy + r, cx, cy + r)} c`,
    `${p(cx - k, cy + r, cx - r, cy + k, cx - r, cy)} c`,
    `${p(cx - r, cy - k, cx - k, cy - r, cx, cy - r)} c`,
    `${p(cx + k, cy - r, cx + r, cy - k, cx + r, cy)} c`,
    "h",
  ];
}

// Neighbors on a line whose ink boxes overlap go into one cluster
function clusters(glyphs: PlacedRoomGlyph[], scale: number): PlacedRoomGlyph[][] {
  const out: PlacedRoomGlyph[][] = [];
  glyphs.forEach((g, i) => {
    const prev = glyphs[i - 1];
    const touching =
      prev &&
      prev.y === g.y &&
      prev.x + prev.bounds[2] * scale > g.x + g.bounds[0] * scale;
    if (touching) out[out.length - 1].push(g);
    else out.push([g]);
  });
  return out;
}

// Merged outline of a cluster, as PDF path ops through `map` (font units → page)
function unionOps(
  scope: Scope,
  group: PlacedRoomGlyph[],
  scale: number,
  map: (x: number, y: number) => [number, number],
): string[] {
  const x0 = group[0].x;
  let merged: InstanceType<Paper["PathItem"]> | null = null;
  for (const g of group) {
    const p = new scope.CompoundPath({ pathData: g.d, insert: false });
    p.translate(new scope.Point((g.x - x0) / scale, 0));
    merged = merged ? merged.unite(p, { insert: false }) : p;
  }
  const paths = merged instanceof scope.CompoundPath ? merged.children : [merged];
  const pt = (x: number, y: number) => map(x0 / scale + x, y).map(n).join(" ");
  const ops: string[] = [];
  for (const item of paths as InstanceType<Paper["Path"]>[]) {
    const segs = item.segments;
    if (!segs.length) continue;
    ops.push(`${pt(segs[0].point.x, segs[0].point.y)} m`);
    const count = segs.length;
    for (let i = 1; i <= count; i++) {
      const a = segs[i - 1];
      const b = segs[i % count];
      if (a.handleOut.isZero() && b.handleIn.isZero())
        ops.push(`${pt(b.point.x, b.point.y)} l`);
      else
        ops.push(
          `${pt(a.point.x + a.handleOut.x, a.point.y + a.handleOut.y)} ${pt(
            b.point.x + b.handleIn.x,
            b.point.y + b.handleIn.y,
          )} ${pt(b.point.x, b.point.y)} c`,
        );
    }
    ops.push("h");
  }
  return ops;
}

async function paperScope(): Promise<Scope> {
  const { default: paper } = await import("paper/dist/paper-core");
  const scope = new paper.PaperScope();
  scope.setup(new scope.Size(1, 1));
  return scope;
}

function createDocument(doc: PDFDocument) {
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
  const gs = ctx.register(ctx.obj({ Type: "ExtGState", OP: true, op: true, OPM: 1, CA: 1, ca: 1 }));
  const cutLayer = ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of("CUT") }));
  const guidesLayer = ctx.register(
    ctx.obj({
      Type: "OCG",
      Name: PDFString.of("Guides"),
      Usage: { Print: { PrintState: "OFF" }, View: { ViewState: "ON" } },
    }),
  );
  const layers = [cutLayer, guidesLayer];
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
  return { cs, gs, cutLayer, guidesLayer };
}

function addSign(
  doc: PDFDocument,
  res: ReturnType<typeof createDocument>,
  scope: Scope,
  name: string,
  film: RoomSignFilm,
  font: RoomFont,
) {
  const { sheetMm, diameterMm, ringMm } = ROOM_SIGN;
  const S = sheetMm * PT_PER_MM;
  const layout = layoutRoomSign(name, font);
  const k = layout.scale;

  // The letters: mm y down → page points y up
  const letterOps = clusters(layout.glyphs, k).flatMap((group) => {
    const { y } = group[0];
    const map = (gx: number, gy: number): [number, number] => [
      (gx * k) * PT_PER_MM,
      S - (y - gy * k) * PT_PER_MM,
    ];
    if (group.length > 1) return unionOps(scope, group, k, map);
    const g = group[0];
    return pathOps(g.d, (gx, gy) => [(g.x + gx * k) * PT_PER_MM, S - (g.y - gy * k) * PT_PER_MM]);
  });

  const c = S / 2;
  const R = (diameterMm / 2) * PT_PER_MM;
  const cut = [
    "/OC /Cut BDC",
    "q",
    "/CS0 CS 1 SCN",
    "0.25 w 4 M 0 j 0 J",
    "/GS0 gs",
    ...circleOps(c, c, R),
    ...circleOps(c, c, R - ringMm * PT_PER_MM),
    ...letterOps,
    "S",
    "Q",
    "EMC",
  ];

  // Guide text under the ring, in the sign's own font
  const guide = `Meeting room sign · ${roomLabel(name)} · ${roomSignFilms.find((f) => f.id === film)!.material}`;
  const gScale = GUIDE_TEXT_MM / font.unitsPerEm;
  let gx = 0;
  const gPlaced = [...guide].map((ch, i) => {
    const g = font.glyphs[ch];
    if (i > 0) gx += font.kerning[guide[i - 1] + ch] ?? 0;
    const at = gx;
    gx += g?.advance ?? 0;
    return { g, at };
  });
  const gLeft = sheetMm / 2 - (gx * gScale) / 2;
  const gBase = sheetMm - 6;
  const guides = [
    "/OC /Guides BDC",
    "q",
    "1 0 0 0 k",
    ...gPlaced.flatMap(({ g, at }) =>
      g?.d
        ? [
            ...pathOps(g.d, (px, py) => [
              (gLeft + (at + px) * gScale) * PT_PER_MM,
              S - (gBase - py * gScale) * PT_PER_MM,
            ]),
            "f",
          ]
        : [],
    ),
    "Q",
    "EMC",
  ];

  const ctx = doc.context;
  const page = doc.addPage([S, S]);
  page.setTrimBox(0, 0, S, S);
  page.setBleedBox(0, 0, S, S);
  page.node.set(
    PDFName.of("Resources"),
    ctx.obj({
      ColorSpace: { CS0: res.cs },
      ExtGState: { GS0: res.gs },
      Properties: { Cut: res.cutLayer, Guides: res.guidesLayer },
    }),
  );
  page.node.set(
    PDFName.of("Contents"),
    ctx.register(ctx.flateStream([...cut, ...guides].join("\n") + "\n")),
  );
}

async function build(
  rooms: string[],
  film: RoomSignFilm,
  font: RoomFont,
  scope: Scope,
  title: string,
  onPage: (i: number) => Promise<void>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const res = createDocument(doc);
  for (let i = 0; i < rooms.length; i++) {
    addSign(doc, res, scope, rooms[i], film, font);
    await onPage(i);
  }
  doc.context.trailerInfo.Info = doc.context.register(
    doc.context.obj({
      Title: PDFHexString.fromText(title),
      Creator: PDFString.of("Peel"),
      Producer: PDFString.of("pdf-lib (https://github.com/Hopding/pdf-lib)"),
    }),
  );
  return doc.save({ useObjectStreams: false });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** One PDF with a page per room, or a ZIP with a PDF per room. */
export async function exportRoomSigns({
  id,
  rooms,
  film,
  font,
  mode,
  onProgress = () => {},
  isCancelled = () => false,
}: {
  id: string;
  rooms: string[];
  film: RoomSignFilm;
  font: RoomFont;
  mode: "pdf" | "zip";
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}): Promise<BuiltFile> {
  if (!rooms.length) throw new Error("Nothing to export");
  const scope = await paperScope();
  const total = rooms.length;
  const step = async (i: number) => {
    onProgress(i + 1, total);
    if (isCancelled()) throw new Cancelled();
    await tick();
  };

  if (mode === "pdf" || total === 1) {
    const name = roomSignFileName(id, film, rooms, "pdf");
    const bytes = await build(rooms, film, font, scope, name.replace(/\.pdf$/, ""), step);
    return { name, bytes, type: "application/pdf" };
  }

  // Separate files; a repeated name gets a number
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < total; i++) {
    let base = `${id}-${film}_${roomSlug(rooms[i])}`;
    for (let k = 2; `${base}.pdf` in files; k++) base = `${id}-${film}_${roomSlug(rooms[i])}-${k}`;
    files[`${base}.pdf`] = await build([rooms[i]], film, font, scope, base, async () => {});
    await step(i);
  }
  // PDFs are already compressed — store them in the ZIP uncompressed
  return {
    name: roomSignFileName(id, film, rooms, "zip"),
    bytes: zipSync(files, { level: 0 }),
    type: "application/zip",
  };
}
