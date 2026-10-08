// Meeting room sign PDF: a 380 mm square page per room, everything that's cut —
// the ring's two circles and the name's letters — as a CutContour line, 0.25 pt,
// overprinting, in the CUT layer; nothing is printed (the film is only cut and
// weeded). The letters' outline comes from room-sign-cut.ts (touching letters
// merged). One file for either film — it's picked when ordering. Nothing else
// on the page: no guide text, the cut only.

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
  roomSignFileName,
  roomSlug,
  type RoomFont,
} from "./room-sign";
import { letterOutlines, loadCutScope, type CutScope } from "./room-sign-cut";

const PT_PER_MM = 72 / 25.4;
const K = 0.5523;

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
  const layers = [cutLayer];
  doc.catalog.set(
    PDFName.of("OCProperties"),
    ctx.obj({ OCGs: layers, D: { Order: layers, ON: layers } }),
  );
  return { cs, gs, cutLayer };
}

function addSign(
  doc: PDFDocument,
  res: ReturnType<typeof createDocument>,
  scope: CutScope,
  name: string,
  font: RoomFont,
) {
  const { sheetMm, diameterMm, ringMm } = ROOM_SIGN;
  const S = sheetMm * PT_PER_MM;
  const layout = layoutRoomSign(name, font);
  // The letters: sheet mm, y down → page points, y up
  const letterOps = letterOutlines(layout, scope).flatMap((d) =>
    pathOps(d, (x, y) => [x * PT_PER_MM, S - y * PT_PER_MM]),
  );

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

  const ctx = doc.context;
  const page = doc.addPage([S, S]);
  page.setTrimBox(0, 0, S, S);
  page.setBleedBox(0, 0, S, S);
  page.node.set(
    PDFName.of("Resources"),
    ctx.obj({
      ColorSpace: { CS0: res.cs },
      ExtGState: { GS0: res.gs },
      Properties: { Cut: res.cutLayer },
    }),
  );
  page.node.set(
    PDFName.of("Contents"),
    ctx.register(ctx.flateStream(cut.join("\n") + "\n")),
  );
}

async function build(
  rooms: string[],
  font: RoomFont,
  scope: CutScope,
  title: string,
  onPage: (i: number) => Promise<void>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const res = createDocument(doc);
  for (let i = 0; i < rooms.length; i++) {
    addSign(doc, res, scope, rooms[i], font);
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
  font,
  mode,
  onProgress = () => {},
  isCancelled = () => false,
}: {
  id: string;
  rooms: string[];
  font: RoomFont;
  mode: "pdf" | "zip";
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}): Promise<BuiltFile> {
  if (!rooms.length) throw new Error("Nothing to export");
  const scope = await loadCutScope();
  const total = rooms.length;
  const step = async (i: number) => {
    onProgress(i + 1, total);
    if (isCancelled()) throw new Cancelled();
    await tick();
  };

  if (mode === "pdf" || total === 1) {
    const name = roomSignFileName(id, rooms, "pdf");
    const bytes = await build(rooms, font, scope, name.replace(/\.pdf$/, ""), step);
    return { name, bytes, type: "application/pdf" };
  }

  // Separate files; a repeated name gets a number
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < total; i++) {
    let base = `${id}_${roomSlug(rooms[i])}`;
    for (let k = 2; `${base}.pdf` in files; k++) base = `${id}_${roomSlug(rooms[i])}-${k}`;
    files[`${base}.pdf`] = await build([rooms[i]], font, scope, base, async () => {});
    await step(i);
  }
  // PDFs are already compressed — store them in the ZIP uncompressed
  return {
    name: roomSignFileName(id, rooms, "zip"),
    bytes: zipSync(files, { level: 0 }),
    type: "application/zip",
  };
}
