// Rebuilds the source PDFs of static decals for the print shop.
// Run: npx tsx scripts/regenerate-sources.mts <originals dir>
//
// Originals are not stored in the project. The dir holds designer files by decal id:
// {id}.pdf (layout) and {id}.svg (layout preview; for layouts without live text —
// npx tsx scripts/pdf-to-svg.mts {id}.pdf {id}.svg). Only decals whose originals
// are in the dir are rebuilt. Output: public/decals/source/{id}.pdf
// and public/decals/preview/{id}.svg; src/data/preview-svgs.json — always.
//
// Rules (defaults, to be checked with the print shop):
// - print & cut without a cut line: CutContour as a rectangle offset at least
//   CUT_OFFSET from the artwork (ArtBox); the cut line size is rounded up to whole
//   mm, artwork centered. MARGIN around. TrimBox = cut line,
//   BleedBox = MediaBox = page. All sizes are whole mm.
// - print & cut with a ready contour: sheet = artwork rounded up to whole
//   mm, + MARGIN, artwork centered.
// - prepress (prepress.mts): brand CMYK -> Pantone spot colors, black
//   at most 280%, live text to outlines, CutContour cut lines 0.25 pt with overprint;
// - OutputIntent Coated FOGRA39 (profile from Adobe if installed, otherwise a reference).
// Other files are left untouched.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFString, type PDFObject, type PDFPage } from "pdf-lib";
import { inflateSync } from "zlib";
import { prepressPage, stripPrivateData, type PrepressOptions } from "./prepress.mjs";
import { allDecals } from "../src/data/decals";

const PT = 72 / 25.4;
const CUT_OFFSET = 2 * PT;
const MARGIN = 3 * PT;
const SRC = "public/decals/source/";
const ORIG = process.argv[2] ? path.resolve(process.argv[2]) + "/" : null;
if (!ORIG || !existsSync(ORIG)) {
  console.error("Usage: npx tsx scripts/regenerate-sources.mts <originals-dir>");
  process.exit(1);
}

// ink — exact artwork bounds (mm from the top-left corner of the source page),
// only for files with live text: there ArtBox is the text block frame with room
// for ascenders/descenders. For outlined artwork ArtBox matches Illustrator and the
// path coordinates in the PDF — we use it. For live text ArtBox is the text block frame
// with room for ascenders/descenders, so it can't be used for centering. Measured on the
// source SVG in the browser (getBoundingClientRect of the outlines).
type Ink = { x: number; top: number; w: number; h: number };
// card — decal on a white backing (a card with rounded corners): cut line =
// backing contour from the PDF itself (first filled path), sheet = cut line +
// MARGIN. No bleed: the background is white, so on white film it prints nothing.
// TrimBox = backing bounds.
// keep — don't change geometry (the sheet is ready), prepress only.
// cutFill — plotter-cut shapes drawn as fills of this color ("r g b" or
// "c m y k" as in the source): the cut lines are rebuilt from the fill outlines as
// CutContour on a clean sheet, everything else in the original (fills, drawn
// outlines) is dropped. Sheet = shapes rounded up to whole mm + MARGIN. The preview
// is generated from the same outlines, no {id}.svg needed.
type Job = {
  id: string;
  addCut: boolean;
  ink?: Ink;
  card?: boolean;
  keep?: boolean;
  cutFill?: string;
  // single — the original has identical pages (left and right side): keep
  // one, the required count is assembled on download (src/lib/export-static.ts)
  single?: boolean;
  prepress?: PrepressOptions;
};

// For all files
const PREPRESS: PrepressOptions = {
  fixCut: true,
  stripPageClip: true,
  inkLimit: 2.8,
  pantone: {
    "0.525 0.376 0.312 0.016": "PANTONE 6219 C",
    "0.485 0.489 0 0": "PANTONE 2715 C",
  },
};
const FOGRA39 = "/Library/Application Support/Adobe/Color/Profiles/Recommended/CoatedFOGRA39.icc";

// Illustrator private data: with it Illustrator opens the source AI, not the PDF
const AI_PRIVATE = ["PieceInfo", "LastModified", "Thumb"];

// Source page artwork goes directly into the new sheet's content (not a Form XObject):
// Illustrator then opens it as paths within their own bounds, not as an object
// the size of the source page. The original's layer is moved to ARTWORK.
async function placeInline(doc: PDFDocument, src: PDFDocument, index: number, size: [number, number], dx: number, dy: number, art: PDFRef) {
  const ctx = doc.context;
  const [page] = await doc.copyPages(src, [index]);
  doc.addPage(page);
  for (const k of [...AI_PRIVATE, "CropBox", "ArtBox", "TrimBox", "BleedBox", "Group", "Rotate"]) page.node.delete(PDFName.of(k));
  page.setMediaBox(0, 0, size[0], size[1]);
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents!];
  const pre = ctx.register(ctx.flateStream(`q 1 0 0 1 ${n(dx)} ${n(dy)} cm\n`));
  const post = ctx.register(ctx.flateStream("Q\n"));
  page.node.set(PDFName.of("Contents"), ctx.obj([pre, ...refs, post]));
  const props = page.node.Resources()!.lookupMaybe(PDFName.of("Properties"), PDFDict);
  if (props) for (const [key, v] of props.entries()) {
    const d = ctx.lookup(v);
    if (d instanceof PDFDict && String(d.get(PDFName.of("Type"))) === "/OCG") props.set(key, art);
  }
  return page;
}

// Cut lines in previews: one color and 0.5 px on screen at any zoom — as for numbers
// and cut frames in decal-preview.tsx (vector-effect="non-scaling-stroke" there).
const CUT_PREVIEW = "#EC008C";
const CUT_COLORS = /stroke="(#EC008C|rgb\(92\.549133%, 0%, 54\.899597%\))"/i;
// Page-sized clipping masks (the Illustrator artboard) are removed, as in the PDF:
// otherwise a cut line along the artboard edge is clipped in half. Inner masks stay.
function stripPageClips(svg: string, size?: [number, number]): string {
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const dims = size ?? (vb ? [Number(vb[1]), Number(vb[2])] : null);
  if (!dims) return svg;
  const [W, H] = dims;
  const TOL = 1.5; // cairo export rounds the mask to whole points
  const ids: string[] = [];
  for (const m of svg.matchAll(/<clipPath id="([^"]+)"[^>]*>\s*<path[^>]*\sd="([^"]+)"/g)) {
    const nums = (m[2].match(/-?[\d.]+/g) ?? []).map(Number);
    const xs = nums.filter((_, k) => k % 2 === 0);
    const ys = nums.filter((_, k) => k % 2 === 1);
    const page =
      Math.min(...xs) <= TOL && Math.min(...ys) <= TOL && Math.max(...xs) >= W - TOL && Math.max(...ys) >= H - TOL;
    if (page) ids.push(m[1]);
  }
  for (const id of ids) svg = svg.split(` clip-path="url(#${id})"`).join("");
  return svg;
}

function normalizeCutStrokes(svg: string, size?: [number, number]): string {
  svg = stripPageClips(svg, size);
  return svg.replace(/<path\b[^>]*>/g, (tag) => {
    if (!CUT_COLORS.test(tag)) return tag;
    return tag
      .replace(/\s(stroke|stroke-width|vector-effect)="[^"]*"/g, "")
      .replace(/^<path/, `<path stroke="${CUT_PREVIEW}" stroke-width="0.5" vector-effect="non-scaling-stroke"`);
  });
}

// Add entries to the resource dictionary without overwriting the original's resources
function addRes(page: PDFPage, key: string, entries: Record<string, PDFObject>) {
  const ctx = page.doc.context;
  const res = page.node.Resources()!;
  let d = res.lookupMaybe(PDFName.of(key), PDFDict);
  if (!d) {
    d = ctx.obj({});
    res.set(PDFName.of(key), d);
  }
  for (const [k, v] of Object.entries(entries)) d.set(PDFName.of(k), v);
}

function addOutputIntent(doc: PDFDocument) {
  const ctx = doc.context;
  const intent: Record<string, PDFObject | string> = {
    Type: "OutputIntent",
    S: "GTS_PDFX",
    OutputConditionIdentifier: PDFString.of("FOGRA39"),
    OutputCondition: PDFString.of("Coated FOGRA39 (ISO 12647-2:2004)"),
    Info: PDFString.of("Coated FOGRA39 (ISO 12647-2:2004)"),
    RegistryName: PDFString.of("http://www.color.org"),
  };
  if (existsSync(FOGRA39)) {
    const icc = ctx.flateStream(readFileSync(FOGRA39), { N: 4 });
    intent.DestOutputProfile = ctx.register(icc);
  }
  doc.catalog.set(PDFName.of("OutputIntents"), ctx.obj([ctx.obj(intent)]));
}
// id — decal name (as in src/data/decals.ts): originals {id}.pdf and {id}.svg
// in the dir from the argument, output — source/{id}.pdf and preview/{id}.svg.
const jobs: Job[] = [
  { id: "car-side-logo", addCut: true, single: true },
  { id: "car-trunk-logo", addCut: true },
  { id: "car-sensor-box-logo", addCut: true },
  {
    id: "car-uber-unlock-notice",
    addCut: true,
    single: true,
    // Visible letters (measured on the SVG) — for centering: the original's ArtBox is
    // the live text frame. Text is converted to outlines (prepress).
    ink: { x: 10.48, top: 8.88, w: 237.71, h: 23.0 },
    prepress: { outlineText: true },
  },
  { id: "car-uber-back-seat-notice", addCut: false },
  { id: "robot-side-logo", addCut: true, single: true },
  { id: "robot-top-logo", addCut: true },
  // Uber: window decals — the CutContour cut line is already in the layout
  { id: "car-uber-front-windshield-logo", addCut: false },
  { id: "car-uber-rear-windshield-logo", addCut: false },
  { id: "car-uber-side-logo", addCut: true, single: true },
  {
    id: "car-first-responders-notice",
    addCut: true,
    card: true,
    prepress: { outlineText: true },
  },
  { id: "robot-qr-code", addCut: true, card: true },
  // Uber FAQ QR: two color versions, each its own file; in the dark one's original
  // the black card has 2 mm of bleed past the outline, in the same rounded shape
  { id: "car-uber-faq-qr-code-light", addCut: true, card: true },
  { id: "car-uber-faq-qr-code-dark", addCut: true, card: true },
  // Wrap: the designer draws the pieces as lavender fills with red outlines
  { id: "car-body-wrap", addCut: false, cutFill: "0.75 0.69 1" },
];

const fileOf = (job: Job) => `${job.id}.pdf`;
const PREVIEW_ORIG = (job: Job) => `${ORIG}${job.id}.svg`;
const PREVIEW_OUT = (job: Job) => `public/decals/preview/${job.id}.svg`;

const n = (v: number) => String(Math.round(v * 1000) / 1000);
const mm = (pt: number) => Math.round((pt / PT) * 10) / 10;
// Artwork size — to tenths of a mm: removes export error (760.0007 -> 760.0)
const artMm = (pt: number) => Math.round((pt / PT) * 10) / 10;
// Round up to whole mm, result in points
const ceilMm = (mmValue: number) => Math.ceil(mmValue - 1e-9) * PT;

// Filled paths of the page in page coordinates (accounting for q/Q/cm) with their
// fill color as written in the source ("0.75 0.69 1")
type Seg = { op: "m" | "l" | "c" | "h"; p: number[] };
type Filled = { color: string; segs: Seg[] };
function filledPaths(doc: PDFDocument, page: PDFPage): Filled[] {
  const c = page.node.Contents();
  const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
  const text = streams
    .map((st) => {
      const raw = (st as PDFRawStream).contents;
      try { return inflateSync(raw).toString("latin1"); } catch { return Buffer.from(raw).toString("latin1"); }
    })
    .join("\n");
  const toks = text.match(/\/[^\s/\[\]()<>]+|[-+]?\d*\.?\d+(?:e[-+]?\d+)?|[A-Za-z'"*]+|\[|\]/g) ?? [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];
  let st: number[] = [];
  let path: Seg[] = [];
  let color = "";
  const colors: string[] = [];
  const out: Filled[] = [];
  const mul = (a: number[], b: number[]) => [
    a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
  ];
  const tr = (xs: number[]) => {
    const out: number[] = [];
    for (let i = 0; i < xs.length; i += 2) out.push(ctm[0] * xs[i] + ctm[2] * xs[i + 1] + ctm[4], ctm[1] * xs[i] + ctm[3] * xs[i + 1] + ctm[5]);
    return out;
  };
  for (const t of toks) {
    if (/^[-+]?\d*\.?\d/.test(t)) { st.push(Number(t)); continue; }
    if (t === "q") { stack.push(ctm); colors.push(color); }
    else if (t === "Q") { ctm = stack.pop()!; color = colors.pop()!; }
    else if (["g", "rg", "k", "sc", "scn"].includes(t)) color = st.map(n).join(" ");
    else if (t === "cm") ctm = mul(st.slice(-6), ctm);
    else if (t === "m" || t === "l") path.push({ op: t, p: tr(st.slice(-2)) });
    else if (t === "c") path.push({ op: "c", p: tr(st.slice(-6)) });
    else if (t === "h") path.push({ op: "h", p: [] });
    else if (t === "re") {
      const [x, y, w, h] = st.slice(-4);
      path.push({ op: "m", p: tr([x, y]) }, { op: "l", p: tr([x + w, y]) }, { op: "l", p: tr([x + w, y + h]) }, { op: "l", p: tr([x, y + h]) }, { op: "h", p: [] });
    } else if (["f", "F", "f*", "b", "b*", "B", "B*"].includes(t)) { if (path.length) out.push({ color, segs: path }); path = []; }
    else if (t === "n" || t === "S" || t === "s") path = [];
    st = [];
  }
  return out;
}

// First filled path of the page — the backing
function firstFilledPath(doc: PDFDocument, page: PDFPage): Seg[] {
  const [first] = filledPaths(doc, page);
  if (!first) throw new Error("No filled path");
  return first.segs;
}

// Subpaths of a path, each closed
function subpaths(segs: Seg[]): Seg[][] {
  const out: Seg[][] = [];
  for (const sg of segs) {
    if (sg.op === "m" || !out.length) out.push([]);
    if (sg.op !== "h") out[out.length - 1].push(sg);
  }
  return out.filter((sp) => sp.length > 1).map((sp) => [...sp, { op: "h", p: [] }]);
}

// Cut lines from the outlines of fills of one color (Job.cutFill)
async function buildCutFill(job: Job, src: PDFDocument, color: string) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const tint = ctx.register(
    ctx.obj({ FunctionType: 2, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1, 0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 0, 0], N: 1 }),
  );
  const cs = ctx.register(ctx.obj([PDFName.of("Separation"), PDFName.of("CutContour"), PDFName.of("DeviceCMYK"), tint]));
  const gs = ctx.register(ctx.obj({ Type: "ExtGState", OP: true, op: true, OPM: 1, CA: 1, ca: 1 }));
  const cutLayer = ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of("CUT_CONTOUR") }));
  doc.catalog.set(PDFName.of("OCProperties"), ctx.obj({ OCGs: [cutLayer], D: { Order: [cutLayer], ON: [cutLayer], BaseState: "ON" } }));

  const pages = [];
  for (const [i, sp] of src.getPages().entries()) {
    const shapes = filledPaths(src, sp)
      .filter((f) => f.color === color)
      .flatMap((f) => subpaths(f.segs));
    if (!shapes.length) throw new Error(`${job.id}: no fills of color ${color} on page ${i + 1}`);
    const pts = shapes.flat().flatMap((sg) => sg.p);
    const xs = pts.filter((_, k) => k % 2 === 0);
    const ys = pts.filter((_, k) => k % 2 === 1);
    const bx = Math.min(...xs), by = Math.min(...ys);
    const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
    const cutW = ceilMm(artMm(bw)), cutH = ceilMm(artMm(bh));
    const w = cutW + 2 * MARGIN, h = cutH + 2 * MARGIN;
    const dx = MARGIN + (cutW - bw) / 2 - bx;
    const dy = MARGIN + (cutH - bh) / 2 - by;

    const page = doc.addPage([w, h]);
    addRes(page, "ColorSpace", { CSCut: cs });
    addRes(page, "ExtGState", { GSCut: gs });
    addRes(page, "Properties", { MCCut: cutLayer });
    const pathOps = shapes.flat().map((sg) => {
      const q = sg.p.map((v, k) => n(v + (k % 2 === 0 ? dx : dy))).join(" ");
      return sg.op === "h" ? "h" : `${q} ${sg.op}`;
    });
    const ops = ["/OC /MCCut BDC", "q", "/CSCut CS 1 SCN", "0.25 w 4 M 0 j 0 J", "/GSCut gs", ...pathOps, "S", "Q", "EMC"];
    page.node.addContentStream(ctx.register(ctx.flateStream(ops.join("\n") + "\n")));
    page.setTrimBox(MARGIN, MARGIN, cutW, cutH);
    page.setBleedBox(0, 0, w, h);
    pages.push({ sheet: [mm(w), mm(h)], art: [artMm(bw), artMm(bh)], pieces: shapes.length });

    if (i === 0) {
      const d = shapes
        .flat()
        .map((sg) => {
          if (sg.op === "h") return "Z";
          const q = [];
          for (let k = 0; k < sg.p.length; k += 2) q.push(`${n(sg.p[k] + dx)} ${n(h - (sg.p[k + 1] + dy))}`);
          return `${sg.op === "m" ? "M" : sg.op === "l" ? "L" : "C"} ${q.join(" ")}`;
        })
        .join(" ");
      writeFileSync(
        PREVIEW_OUT(job),
        `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">` +
          `<path stroke="${CUT_PREVIEW}" stroke-width="0.5" vector-effect="non-scaling-stroke" fill="none" d="${d}"/></svg>\n`,
      );
    }
  }
  const info = ctx.obj({
    Title: PDFHexString.fromText(job.id),
    Creator: PDFString.of("Peel regenerate-sources"),
    Producer: PDFString.of("pdf-lib (https://github.com/Hopding/pdf-lib)"),
  });
  ctx.trailerInfo.Info = ctx.register(info);
  addOutputIntent(doc);
  stripPrivateData(doc);
  writeFileSync(SRC + fileOf(job), await doc.save({ useObjectStreams: false }));
  return { cutFill: color, pages };
}

mkdirSync("public/decals/preview", { recursive: true });
const report: Record<string, unknown> = {};

for (const job of jobs) {
  if (!existsSync(ORIG + fileOf(job))) continue;
  if (!job.cutFill && !existsSync(PREVIEW_ORIG(job))) throw new Error(`No preview original: ${PREVIEW_ORIG(job)}`);
  const src = await PDFDocument.load(readFileSync(ORIG + fileOf(job)));
  if (job.cutFill) {
    report[fileOf(job)] = await buildCutFill(job, src, job.cutFill);
    continue;
  }
  const opts = { ...PREPRESS, ...job.prepress };
  // Backing (card) — before processing, while text hasn't been turned into outlines yet
  const cards = src.getPages().map((p) => (job.card ? firstFilledPath(src, p) : []));
  const prepress = src.getPages().map((p) => prepressPage(src, p, opts));
  if (job.keep) {
    for (const p of src.getPages()) for (const k of AI_PRIVATE) p.node.delete(PDFName.of(k));
    addOutputIntent(src);
    stripPrivateData(src);
    writeFileSync(SRC + fileOf(job), await src.save({ useObjectStreams: false }));
    // Preview without recomputing geometry — cut lines only
    writeFileSync(PREVIEW_OUT(job), normalizeCutStrokes(readFileSync(PREVIEW_ORIG(job), "utf8")));
    report[fileOf(job)] = { keep: true, prepress };
    continue;
  }
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;

  // CutContour spot color (fallback CMYK 0/100/0/0) and cut line layer — as for numbers
  const tint = ctx.register(
    ctx.obj({ FunctionType: 2, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1, 0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 0, 0], N: 1 }),
  );
  const cs = ctx.register(ctx.obj([PDFName.of("Separation"), PDFName.of("CutContour"), PDFName.of("DeviceCMYK"), tint]));
  // Overprint: the cut line doesn't knock out ink beneath it (as RIPs expect)
  const gs = ctx.register(ctx.obj({ Type: "ExtGState", OP: true, op: true, OPM: 1, CA: 1, ca: 1 }));
  const art = ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of("ARTWORK") }));
  const cutLayer = ctx.register(ctx.obj({ Type: "OCG", Name: PDFString.of("CUT_CONTOUR") }));
  const layers = [art, ...(job.addCut ? [cutLayer] : [])];
  doc.catalog.set(PDFName.of("OCProperties"), ctx.obj({ OCGs: layers, D: { Order: layers, ON: layers, BaseState: "ON" } }));

  const pages = job.single ? src.getPages().slice(0, 1) : src.getPages();
  let geom: { sheet: number[]; cut: number[]; decal: number[]; art: number[]; cutPath?: string } = {
    sheet: [0, 0], cut: [0, 0, 0, 0], decal: [0, 0], art: [0, 0],
  };
  for (const [i, sp] of pages.entries()) {
    if (job.card) {
      const segs = [...cards[i]];
      // The cut contour is closed
      if (segs[segs.length - 1].op !== "h") segs.push({ op: "h", p: [] });
      const xs = segs.flatMap((sg) => sg.p.filter((_, k) => k % 2 === 0));
      const ys = segs.flatMap((sg) => sg.p.filter((_, k) => k % 2 === 1));
      const bx = Math.min(...xs), by = Math.min(...ys);
      const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
      const w = bw + 2 * MARGIN, h = bh + 2 * MARGIN;
      const dx = MARGIN - bx, dy = MARGIN - by;
      void sp;
      const page = await placeInline(doc, src, i, [w, h], dx, dy, art);
      addRes(page, "ColorSpace", { CSCut: cs });
      addRes(page, "ExtGState", { GSCut: gs });
      addRes(page, "Properties", { MCArt: art, MCCut: cutLayer });
      const pathOps = segs.map((sg) => {
        const q = sg.p.map((v, k) => n(v + (k % 2 === 0 ? dx : dy))).join(" ");
        return sg.op === "h" ? "h" : `${q} ${sg.op}`;
      });
      const cutOps = ["/OC /MCCut BDC", "q", "/CSCut CS 1 SCN", "0.25 w 4 M 0 j 0 J", "/GSCut gs", ...pathOps, "S", "Q", "EMC"];
      page.node.addContentStream(ctx.register(ctx.flateStream(cutOps.join("\n") + "\n")));
      page.setTrimBox(MARGIN, MARGIN, bw, bh);
      page.setBleedBox(0, 0, w, h);
      // Contour for the preview: SVG path in mm, from the top-left corner of the sheet
      const f = (v: number) => String(Math.round(v * 100) / 100);
      const cutPath = segs
        .map((sg) => {
          if (sg.op === "h") return "Z";
          const pts = [];
          for (let k = 0; k < sg.p.length; k += 2) pts.push(`${f((sg.p[k] + dx) / PT)} ${f((h - (sg.p[k + 1] + dy)) / PT)}`);
          return `${sg.op === "m" ? "M" : sg.op === "l" ? "L" : "C"} ${pts.join(" ")}`;
        })
        .join(" ");
      geom = { sheet: [mm(w), mm(h)], cut: [], decal: [mm(bw), mm(bh)], art: [mm(bw), mm(bh)], cutPath } as typeof geom;
      // Preview — from the first page (paired decals have a single page)
      if (i === 0) {
        const orig = PREVIEW_ORIG(job);
        const svg = readFileSync(orig, "utf8");
        const m = svg.match(/<svg[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*>([\s\S]*)<\/svg>\s*$/);
        if (!m) throw new Error(`Unexpected SVG ${orig}`);
        const [, ow, oh, raw] = m;
        const inner = normalizeCutStrokes(raw, [Number(ow), Number(oh)]);
        const out =
          `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
          `width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">` +
          `<svg x="${n(dx)}" y="${n(h - Number(oh) - dy)}" width="${ow}" height="${oh}" viewBox="0 0 ${ow} ${oh}" overflow="visible">${inner}</svg></svg>\n`;
        writeFileSync(PREVIEW_OUT(job), out);
      }
      continue;
    }
    // Artwork bounds in points from the bottom-left corner: measured or ArtBox
    const pageH = sp.getMediaBox().height;
    const a = job.ink
        ? { x: job.ink.x * PT, y: pageH - (job.ink.top + job.ink.h) * PT, width: job.ink.w * PT, height: job.ink.h * PT }
      : sp.getArtBox();
    // Cut line (or, for a ready contour, the artwork itself) — whole mm, artwork centered
    const offMm = job.addCut ? CUT_OFFSET / PT : 0;
    const cutW = ceilMm(artMm(a.width) + 2 * offMm);
    const cutH = ceilMm(artMm(a.height) + 2 * offMm);
    const w = cutW + 2 * MARGIN;
    const h = cutH + 2 * MARGIN;
    const cutX = MARGIN;
    const cutY = MARGIN;
    const artX = cutX + (cutW - a.width) / 2;
    const artY = cutY + (cutH - a.height) / 2;
    // Move the source page artwork with an offset so it lands at artX/artY
    const page = await placeInline(doc, src, i, [w, h], artX - a.x, artY - a.y, art);
    page.setTrimBox(cutX, cutY, cutW, cutH);
    page.setBleedBox(0, 0, w, h);
    if (job.addCut) {
      addRes(page, "ColorSpace", { CSCut: cs });
      addRes(page, "ExtGState", { GSCut: gs });
      addRes(page, "Properties", { MCArt: art, MCCut: cutLayer });
      const ops = [
        "/OC /MCCut BDC", "q", "/CSCut CS 1 SCN", "0.25 w 4 M 0 j 0 J", "/GSCut gs",
        `${n(cutX)} ${n(cutY)} ${n(cutW)} ${n(cutH)} re`, "S", "Q", "EMC",
      ];
      page.node.addContentStream(ctx.register(ctx.flateStream(ops.join("\n") + "\n")));
    }
    geom = {
      sheet: [mm(w), mm(h)],
      cut: job.addCut ? [mm(cutX), mm(cutY), mm(cutW), mm(cutH)] : [],
      decal: [mm(cutW), mm(cutH)],
      art: [artMm(a.width), artMm(a.height)],
    };

    // Preview: move the old SVG (in points, relative to the old page) onto the new page
    if (i === 0) {
      const orig = PREVIEW_ORIG(job);
      const svg = readFileSync(orig, "utf8");
      const m = svg.match(/<svg[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*>([\s\S]*)<\/svg>\s*$/);
      if (!m) throw new Error(`Unexpected SVG ${orig}`);
      const [, ow, oh, raw] = m;
      const inner = normalizeCutStrokes(raw, [Number(ow), Number(oh)]);
      // SVG y axis points down: artwork top in the old SVG = oh - (a.y + a.height)
      const dx = artX - a.x;
      const dy = h - (artY + a.height) - (Number(oh) - (a.y + a.height));
      const out =
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
        `width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">` +
        `<svg x="${n(dx)}" y="${n(dy)}" width="${ow}" height="${oh}" viewBox="0 0 ${ow} ${oh}" overflow="visible">${inner}</svg></svg>\n`;
      writeFileSync(PREVIEW_OUT(job), out);
    }
  }
  const info = ctx.obj({
    Title: PDFHexString.fromText(fileOf(job).replace(/\.pdf$/, "")),
    Creator: PDFString.of("Peel regenerate-sources"),
    Producer: PDFString.of("pdf-lib (https://github.com/Hopding/pdf-lib)"),
  });
  ctx.trailerInfo.Info = ctx.register(info);
  addOutputIntent(doc);
  stripPrivateData(doc);
  writeFileSync(SRC + fileOf(job), await doc.save({ useObjectStreams: false }));
  report[fileOf(job)] = { pages: pages.length, ...geom, prepress };
}

/** The file's root svg stretches to the sheet, keeping the file's proportions. */
function toInlineSvg(text: string): string {
  return text
    .replace(/^[\s\S]*?<svg\b/, "<svg")
    .replace(/<svg\b([^>]*?)\swidth="[^"]*"/, "<svg$1")
    .replace(/<svg\b([^>]*?)\sheight="[^"]*"/, "<svg$1")
    .replace(/<svg\b/, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
}

// Markup of all previews for inlining into the page — as a data module, so that
// Next.js tracks changes (it doesn't see fs in the page) and no fetching is needed
const inlineSvgs: Record<string, string> = {};
for (const d of allDecals)
  for (const src of [...d.previews, ...(d.variants ?? []).map((v) => v.preview)])
    if (src.endsWith(".svg") && existsSync("public" + src))
      inlineSvgs[src] = toInlineSvg(readFileSync("public" + src, "utf8"));
writeFileSync("src/data/preview-svgs.json", JSON.stringify(inlineSvgs) + "\n");
console.error(`preview-svgs.json: ${Object.keys(inlineSvgs).length} previews`);

console.log(JSON.stringify(report, null, 1));
