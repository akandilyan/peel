// Decal PDF preflight: readiness for printing and plotter cutting.
// Run: npx tsx scripts/preflight.mts [--json]
//
// Checks static decal sources (public/decals/source/) and number PDFs
// built by the same code as in the UI (src/lib/export-decals.ts).
// Checks sizes against src/data/decals.ts.

import { existsSync, readFileSync } from "fs";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFObject,
  type PDFPage,
} from "pdf-lib";
import { inflateSync } from "zlib";
import { decals } from "../src/data/decals";
import { exportDecals } from "../src/lib/export-decals";
import { numberPresets } from "../src/lib/numbers";

const MM = 25.4 / 72;
const mm = (pt: number) => Math.round(pt * MM * 100) / 100;

type Level = "error" | "warn" | "info";
type Issue = { level: Level; msg: string };

type Stats = {
  rgbOps: number;
  grayOps: number;
  cmykColors: Map<string, number>;
  richBlack: number;
  maxInk: number;
  spotFills: Map<string, number>;
  spotStrokes: Map<string, number>;
  cutWidths: Set<number>;
  hairlines: number;
  textOps: number;
  images: { w: number; h: number; ppi: number; cs: string }[];
  shadings: number;
  smasks: number;
  alpha: number;
  blend: Set<string>;
  overprintCut: boolean | null;
  cutPaths: number;
  cutOpen: number;
};

function newStats(): Stats {
  return {
    rgbOps: 0,
    grayOps: 0,
    cmykColors: new Map(),
    richBlack: 0,
    maxInk: 0,
    spotFills: new Map(),
    spotStrokes: new Map(),
    cutWidths: new Set(),
    hairlines: 0,
    textOps: 0,
    images: [],
    shadings: 0,
    smasks: 0,
    alpha: 0,
    blend: new Set(),
    overprintCut: null,
    cutPaths: 0,
    cutOpen: 0,
  };
}

function streamText(doc: PDFDocument, obj: PDFObject | undefined): string {
  if (!obj) return "";
  const o = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
  if (o instanceof PDFArray)
    return o
      .asArray()
      .map((x) => streamText(doc, x))
      .join("\n");
  if (!(o instanceof PDFRawStream)) return "";
  const raw = o.contents;
  const filter = o.dict.get(PDFName.of("Filter"));
  if (filter && String(filter).includes("FlateDecode")) {
    try {
      return inflateSync(raw).toString("latin1");
    } catch {
      return "";
    }
  }
  return Buffer.from(raw).toString("latin1");
}

const lookup = <T,>(doc: PDFDocument, o: PDFObject | undefined): T | undefined =>
  (o instanceof PDFRef ? doc.context.lookup(o) : o) as T | undefined;

// Color space description: DeviceCMYK / Separation:CutContour / ICC:N3 …
function csName(doc: PDFDocument, res: PDFDict | undefined, name: string): string {
  if (["DeviceCMYK", "DeviceRGB", "DeviceGray", "Pattern"].includes(name)) return name;
  const spaces = lookup<PDFDict>(doc, res?.get(PDFName.of("ColorSpace")));
  const cs = lookup<PDFObject>(doc, spaces?.get(PDFName.of(name)));
  return describeCs(doc, cs);
}

function describeCs(doc: PDFDocument, cs: PDFObject | undefined): string {
  if (!cs) return "?";
  if (cs instanceof PDFName) return cs.decodeText();
  if (cs instanceof PDFArray) {
    const kind = String(cs.get(0)).slice(1);
    if (kind === "Separation") return `Separation:${lookup<PDFName>(doc, cs.get(1))?.decodeText()}`;
    if (kind === "DeviceN") {
      const names = lookup<PDFArray>(doc, cs.get(1));
      return `DeviceN:${names?.asArray().map((n) => (n as PDFName).decodeText()).join("+")}`;
    }
    if (kind === "ICCBased") {
      const s = lookup<PDFRawStream>(doc, cs.get(1));
      const n = s?.dict.get(PDFName.of("N"));
      return `ICC:N${n}`;
    }
    if (kind === "Indexed") return `Indexed(${describeCs(doc, lookup(doc, cs.get(1)))})`;
    return kind;
  }
  return "?";
}

type Gs = {
  ctm: number[];
  fillCs: string;
  strokeCs: string;
  lw: number;
  overprintStroke: boolean;
};

const mul = (a: number[], b: number[]) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const scaleOf = (m: number[]) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

function recordCmyk(st: Stats, v: number[]) {
  const key = v.map((x) => Math.round(x * 100)).join("/");
  st.cmykColors.set(key, (st.cmykColors.get(key) ?? 0) + 1);
  const total = v.reduce((a, b) => a + b, 0) * 100;
  st.maxInk = Math.max(st.maxInk, total);
  if (v[3] > 0.9 && v[0] + v[1] + v[2] > 0.3) st.richBlack++;
}

// Content stream parsing. Strings, dictionaries and inline images are skipped.
function tokenize(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === "%") {
      while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++;
    } else if (c === "(") {
      let depth = 0;
      for (; i < s.length; i++) {
        if (s[i] === "\\") {
          i++;
          continue;
        }
        if (s[i] === "(") depth++;
        if (s[i] === ")" && --depth === 0) break;
      }
      i++;
      out.push("(str)");
    } else if (c === "<" && s[i + 1] === "<") {
      out.push("<<");
      i += 2;
    } else if (c === ">" && s[i + 1] === ">") {
      out.push(">>");
      i += 2;
    } else if (c === "<") {
      const j = s.indexOf(">", i);
      out.push("<hex>");
      i = j + 1;
    } else if (c === "[" || c === "]" || c === "{" || c === "}") {
      out.push(c);
      i++;
    } else if (c === "/") {
      let j = i + 1;
      while (j < s.length && !/[\s/[\]()<>{}%]/.test(s[j])) j++;
      out.push(s.slice(i, j));
      i = j;
    } else {
      let j = i;
      while (j < s.length && !/[\s/[\]()<>{}%]/.test(s[j])) j++;
      const t = s.slice(i, j);
      out.push(t);
      i = j;
      if (t === "ID") {
        const e = s.indexOf("EI", i);
        i = e < 0 ? s.length : e + 2;
        out.push("EI");
      }
    }
  }
  return out;
}

function walk(
  doc: PDFDocument,
  content: string,
  res: PDFDict | undefined,
  st: Stats,
  gs0: Gs,
  depth = 0,
) {
  if (depth > 12) return;
  let gs: Gs = { ...gs0 };
  const stack: Gs[] = [];
  let args: string[] = [];
  let pathOpen = false;
  let subpaths = 0;
  let closed = 0;
  let inText = false;
  const extG = lookup<PDFDict>(doc, res?.get(PDFName.of("ExtGState")));
  const xobjs = lookup<PDFDict>(doc, res?.get(PDFName.of("XObject")));
  const num = (k: number) => Number(args[args.length - k]);
  const isCut = (cs: string) => /CutContour|Cut|Thru-cut|Contour/i.test(cs) && cs.startsWith("Separation");

  for (const t of tokenize(content)) {
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) || t.startsWith("/") || t === "(str)" || t === "<hex>" || t === "[" || t === "]") {
      args.push(t);
      continue;
    }
    switch (t) {
      case "q":
        stack.push({ ...gs, ctm: [...gs.ctm] });
        break;
      case "Q":
        gs = stack.pop() ?? gs;
        break;
      case "cm":
        gs.ctm = mul([num(6), num(5), num(4), num(3), num(2), num(1)], gs.ctm);
        break;
      case "w":
        gs.lw = num(1);
        break;
      case "gs": {
        const d = lookup<PDFDict>(doc, extG?.get(PDFName.of(args[args.length - 1].slice(1))));
        if (d) {
          const ca = d.get(PDFName.of("ca")) ?? d.get(PDFName.of("CA"));
          if (ca instanceof PDFNumber && ca.asNumber() < 1) st.alpha++;
          const bm = d.get(PDFName.of("BM"));
          if (bm && String(bm) !== "/Normal" && String(bm) !== "/Compatible") st.blend.add(String(bm));
          const sm = d.get(PDFName.of("SMask"));
          if (sm && String(sm) !== "/None") st.smasks++;
          const op = d.get(PDFName.of("OP"));
          if (op) gs.overprintStroke = String(op) === "true";
        }
        break;
      }
      case "BT":
        inText = true;
        break;
      case "ET":
        inText = false;
        break;
      case "Tj":
      case "TJ":
      case "'":
      case '"':
        if (inText) st.textOps++;
        break;
      case "rg":
        st.rgbOps++;
        gs.fillCs = "DeviceRGB";
        break;
      case "RG":
        st.rgbOps++;
        gs.strokeCs = "DeviceRGB";
        break;
      case "g":
        st.grayOps++;
        gs.fillCs = "DeviceGray";
        break;
      case "G":
        st.grayOps++;
        gs.strokeCs = "DeviceGray";
        break;
      case "k":
        gs.fillCs = "DeviceCMYK";
        recordCmyk(st, [num(4), num(3), num(2), num(1)]);
        break;
      case "K":
        gs.strokeCs = "DeviceCMYK";
        recordCmyk(st, [num(4), num(3), num(2), num(1)]);
        break;
      case "cs":
        gs.fillCs = csName(doc, res, args[args.length - 1].slice(1));
        break;
      case "CS":
        gs.strokeCs = csName(doc, res, args[args.length - 1].slice(1));
        break;
      case "sc":
      case "scn":
        if (gs.fillCs === "DeviceCMYK" || gs.fillCs === "ICC:N4")
          recordCmyk(st, [num(4), num(3), num(2), num(1)]);
        if (gs.fillCs.includes("RGB") || gs.fillCs === "ICC:N3") st.rgbOps++;
        break;
      case "SC":
      case "SCN":
        if (gs.strokeCs.includes("RGB") || gs.strokeCs === "ICC:N3") st.rgbOps++;
        break;
      case "m":
      case "re":
        pathOpen = true;
        subpaths++;
        if (t === "re") closed++;
        break;
      case "h":
        closed++;
        break;
      case "f":
      case "F":
      case "f*":
      case "B":
      case "B*":
      case "b":
      case "b*":
      case "S":
      case "s": {
        const fills = !["S", "s"].includes(t);
        const strokes = ["S", "s", "B", "B*", "b", "b*"].includes(t);
        if (t === "s" || t === "b" || t === "b*") closed = subpaths;
        if (fills) {
          const c = gs.fillCs;
          if (c.startsWith("Separation") || c.startsWith("DeviceN"))
            st.spotFills.set(c, (st.spotFills.get(c) ?? 0) + 1);
          if (c.includes("RGB") || c === "ICC:N3") st.rgbOps++;
        }
        if (strokes) {
          const c = gs.strokeCs;
          const w = gs.lw * scaleOf(gs.ctm);
          if (c.startsWith("Separation") || c.startsWith("DeviceN"))
            st.spotStrokes.set(c, (st.spotStrokes.get(c) ?? 0) + 1);
          if (isCut(c)) {
            st.cutWidths.add(Math.round(w * 1000) / 1000);
            st.cutPaths += subpaths;
            st.cutOpen += Math.max(0, subpaths - closed);
            if (st.overprintCut === null || gs.overprintStroke) st.overprintCut = gs.overprintStroke;
          } else if (w < 0.25) st.hairlines++;
        }
        pathOpen = false;
        subpaths = 0;
        closed = 0;
        break;
      }
      case "n":
        pathOpen = false;
        subpaths = 0;
        closed = 0;
        break;
      case "sh":
        st.shadings++;
        break;
      case "Do": {
        const name = args[args.length - 1].slice(1);
        const x = lookup<PDFRawStream>(doc, xobjs?.get(PDFName.of(name)));
        if (!x) break;
        const sub = String(x.dict.get(PDFName.of("Subtype")));
        if (sub === "/Image") {
          const w = Number(String(x.dict.get(PDFName.of("Width"))));
          const h = Number(String(x.dict.get(PDFName.of("Height"))));
          const m = gs.ctm;
          const wIn = Math.hypot(m[0], m[1]) / 72;
          const cs = describeCs(doc, lookup(doc, x.dict.get(PDFName.of("ColorSpace"))));
          st.images.push({ w, h, ppi: Math.round(w / wIn), cs });
          if (x.dict.get(PDFName.of("SMask"))) st.smasks++;
        } else if (sub === "/Form") {
          const r = lookup<PDFDict>(doc, x.dict.get(PDFName.of("Resources"))) ?? res;
          const mArr = lookup<PDFArray>(doc, x.dict.get(PDFName.of("Matrix")));
          const fm = mArr ? mArr.asArray().map((v) => Number(String(v))) : [1, 0, 0, 1, 0, 0];
          const grp = lookup<PDFDict>(doc, x.dict.get(PDFName.of("Group")));
          if (grp && String(grp.get(PDFName.of("S"))) === "/Transparency") {
            // a transparency group by itself is not a problem — count it only if there is alpha/blend
          }
          walk(doc, streamText(doc, x), r, st, { ...gs, ctm: mul(fm, gs.ctm) }, depth + 1);
        }
        break;
      }
    }
    void pathOpen;
    args = [];
  }
}

function box(p: PDFPage, name: "Media" | "Trim" | "Bleed" | "Art") {
  const b = p[`get${name}Box`]();
  return [mm(b.x), mm(b.y), mm(b.width), mm(b.height)] as const;
}

function hasBox(p: PDFPage, key: string) {
  return !!p.node.get(PDFName.of(key));
}

type Report = {
  file: string;
  pages: number;
  version: string;
  creator: string;
  boxes: string[];
  layers: string[];
  fonts: string[];
  outputIntent: boolean;
  stats: Omit<Stats, "cmykColors" | "spotFills" | "spotStrokes" | "cutWidths" | "blend"> & {
    cmykColors: Record<string, number>;
    spotFills: Record<string, number>;
    spotStrokes: Record<string, number>;
    cutWidths: number[];
    blend: string[];
  };
  issues: Issue[];
};

function fontsOf(doc: PDFDocument): string[] {
  const out = new Set<string>();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && String(obj.get(PDFName.of("Type"))) === "/Font") {
      const base = String(obj.get(PDFName.of("BaseFont")) ?? "?").slice(1);
      let embedded = false;
      const desc = lookup<PDFDict>(doc, obj.get(PDFName.of("FontDescriptor")));
      const descendants = lookup<PDFArray>(doc, obj.get(PDFName.of("DescendantFonts")));
      const d2 = descendants
        ? lookup<PDFDict>(doc, lookup<PDFDict>(doc, descendants.get(0))?.get(PDFName.of("FontDescriptor")))
        : undefined;
      for (const d of [desc, d2])
        if (d && ["FontFile", "FontFile2", "FontFile3"].some((k) => d.get(PDFName.of(k)))) embedded = true;
      out.add(`${base}${embedded ? "" : " (NOT embedded)"}`);
    }
  }
  return [...out];
}

function layersOf(doc: PDFDocument): string[] {
  const props = lookup<PDFDict>(doc, doc.catalog.get(PDFName.of("OCProperties")));
  const ocgs = lookup<PDFArray>(doc, props?.get(PDFName.of("OCGs")));
  return (
    ocgs?.asArray().map((r) => {
      const d = lookup<PDFDict>(doc, r);
      const n = d?.get(PDFName.of("Name"));
      return n ? (n as unknown as { decodeText(): string }).decodeText() : "?";
    }) ?? []
  );
}

async function preflight(file: string, bytes: Uint8Array): Promise<Report> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const header = Buffer.from(bytes.slice(0, 10)).toString("latin1").match(/%PDF-(\d\.\d)/)?.[1] ?? "?";
  const st = newStats();
  const issues: Issue[] = [];
  const boxes: string[] = [];
  doc.getPages().forEach((p, i) => {
    const f = (b: readonly number[]) => `${b[2]}×${b[3]}${b[0] || b[1] ? ` @${b[0]},${b[1]}` : ""}`;
    boxes.push(
      `p${i + 1}: Media ${f(box(p, "Media"))}` +
        (hasBox(p, "TrimBox") ? ` · Trim ${f(box(p, "Trim"))}` : " · no Trim") +
        (hasBox(p, "BleedBox") ? ` · Bleed ${f(box(p, "Bleed"))}` : "") +
        (hasBox(p, "ArtBox") ? ` · Art ${f(box(p, "Art"))}` : ""),
    );
    if (p.getRotation().angle) issues.push({ level: "warn", msg: `page ${i + 1} rotated ${p.getRotation().angle}°` });
    const res = lookup<PDFDict>(doc, p.node.get(PDFName.of("Resources")));
    walk(doc, streamText(doc, p.node.get(PDFName.of("Contents"))), res, st, {
      ctm: [1, 0, 0, 1, 0, 0],
      fillCs: "DeviceGray",
      strokeCs: "DeviceGray",
      lw: 1,
      overprintStroke: false,
    });
  });
  const info = lookup<PDFDict>(doc, doc.context.trailerInfo.Info);
  const creator = [info?.get(PDFName.of("Creator")), info?.get(PDFName.of("Producer"))]
    .filter(Boolean)
    .map((v) => {
      const o = v as unknown as { decodeText?: () => string };
      return o.decodeText ? o.decodeText() : String(v);
    })
    .join(" / ");
  const fonts = fontsOf(doc);
  const layers = layersOf(doc);
  const outputIntent = !!doc.catalog.get(PDFName.of("OutputIntents"));

  return {
    file,
    pages: doc.getPageCount(),
    version: header,
    creator,
    boxes,
    layers,
    fonts,
    outputIntent,
    stats: {
      ...st,
      cmykColors: Object.fromEntries(st.cmykColors),
      spotFills: Object.fromEntries(st.spotFills),
      spotStrokes: Object.fromEntries(st.spotStrokes),
      cutWidths: [...st.cutWidths],
      blend: [...st.blend],
    },
    issues,
  };
}

// Evaluation rules
function judge(r: Report, expect?: { production?: string; sheet?: [number, number]; art?: [number, number]; cut?: number[] }) {
  const s = r.stats;
  const add = (level: Level, msg: string) => r.issues.push({ level, msg });
  const hasCut = Object.keys(s.spotStrokes).some((k) => /Cut/i.test(k)) || s.cutPaths > 0;
  const cutFill = Object.keys(s.spotFills).some((k) => /Cut/i.test(k));

  if (r.pages === 0) add("error", "no pages");
  // A RIP will print an embedded font, but outlines are safer and the size matches Illustrator
  if (s.textOps) add("warn", `live text: ${s.textOps} text ops — outline fonts before production`);
  if (r.fonts.some((f) => f.includes("NOT embedded"))) add("error", "fonts not embedded");
  if (s.rgbOps) add("warn", `RGB color used (${s.rgbOps} ops) — convert to CMYK`);
  if (s.images.length) {
    for (const im of s.images)
      add(im.ppi < 300 ? "warn" : "info", `raster ${im.w}×${im.h} ${im.cs} at ~${im.ppi} ppi`);
  }
  if (s.alpha || s.smasks || s.blend.length)
    add("warn", `transparency: alpha ${s.alpha}, smask ${s.smasks}, blend ${s.blend.join(",") || "—"} — flatten or confirm RIP support`);
  if (s.shadings) add("info", `${s.shadings} gradient(s)`);
  if (s.maxInk > 300) add("warn", `max ink coverage ${Math.round(s.maxInk)}% (> 300%)`);
  if (s.hairlines) add("warn", `${s.hairlines} stroke(s) thinner than 0.25 pt (not cut line)`);
  if (cutFill) add("error", "CutContour used as fill — must be stroke only");
  if (hasCut) {
    if (s.overprintCut === false) add("info", "CutContour overprint off (knockout) — some RIPs expect overprint on");
    if (s.cutOpen) add("warn", `${s.cutOpen} open cut path(s)`);
    const w = s.cutWidths;
    if (w.some((x) => x > 1)) add("warn", `cut line width ${w.join(", ")} pt (thick)`);
  }
  const prod = expect?.production;
  if (prod === "print-cut" && !hasCut) add("error", "print & cut, but no CutContour");
  if (prod === "cut" && !hasCut) add("warn", "cut from film: no CutContour — plotter cuts the artwork outline itself");
  if (prod === "print" && hasCut) add("info", "print only, but file has CutContour");

  const trim = r.boxes.every((b) => !b.includes("no Trim"));
  if (!trim) add("warn", "no TrimBox");
  if (!r.outputIntent) add("info", "no OutputIntent (color profile not declared)");

  // check sizes against decals.ts
  if (expect?.sheet) {
    const m = r.boxes[0].match(/Media ([\d.]+)×([\d.]+)/);
    if (m) {
      const [w, h] = [Number(m[1]), Number(m[2])];
      if (Math.abs(w - expect.sheet[0]) > 0.6 || Math.abs(h - expect.sheet[1]) > 0.6)
        add("error", `sheet in data ${expect.sheet.join("×")} ≠ PDF ${w}×${h}`);
    }
  }
  if (expect?.art) {
    const m = r.boxes[0].match(/Art ([\d.]+)×([\d.]+)/);
    if (m) {
      const [w, h] = [Number(m[1]), Number(m[2])];
      if (Math.abs(w - expect.art[0]) > 0.6 || Math.abs(h - expect.art[1]) > 0.6)
        add("warn", `art size in data ${expect.art.join("×")} ≠ PDF ArtBox ${w}×${h}`);
    }
  }
  if (expect?.cut) {
    const m = r.boxes[0].match(/Trim ([\d.]+)×([\d.]+)/);
    if (m) {
      const [w, h] = [Number(m[1]), Number(m[2])];
      if (Math.abs(w - expect.cut[2]) > 0.6 || Math.abs(h - expect.cut[3]) > 0.6)
        add("warn", `cut in data ${expect.cut[2]}×${expect.cut[3]} ≠ TrimBox ${w}×${h}`);
    }
  }
}

const reports: Report[] = [];

for (const d of decals) {
  if (d.kind !== "static") continue;
  if (!d.source) continue;
  const path = "public" + d.source;
  if (!existsSync(path)) {
    reports.push({ file: d.id, issues: [{ level: "error", msg: `source missing: ${d.source}` }] } as Report);
    continue;
  }
  const r = await preflight(d.source.split("/").pop()!, readFileSync(path));
  for (const pv of d.previews) if (!existsSync("public" + pv)) r.issues.push({ level: "error", msg: `preview missing: ${pv}` });
  const pagesInData = d.previews.length;
  if (pagesInData !== r.pages) r.issues.push({ level: "warn", msg: `data has ${pagesInData} preview(s), PDF has ${r.pages} page(s)` });
  judge(r, {
    production: d.production,
    sheet: [d.widthMm, d.heightMm],
    art: d.artMm,
    cut: d.cutMm,
  });
  reports.push(r);
}

// Numbers — built by the same code as the UI
for (const [platform, layer, n] of [
  ["car", "CAR_NAME", 199],
  ["robot", "LIDAR_ID", 1000],
] as const) {
  const res = await exportDecals({ numbers: [n], preset: numberPresets[platform], layer, mode: "pdf" });
  const r = await preflight(`generated ${res.name}`, res.bytes);
  judge(r, { production: "cut" });
  reports.push(r);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const r of reports) {
    console.log(`\n■ ${r.file}  (PDF ${r.version}, ${r.pages}p, ${r.creator})`);
    r.boxes?.forEach((b) => console.log("  " + b));
    if (r.layers?.length) console.log("  layers: " + r.layers.join(", "));
    if (r.fonts?.length) console.log("  fonts: " + r.fonts.join(", "));
    if (r.stats) {
      const s = r.stats;
      console.log(
        `  colors CMYK: ${Object.keys(s.cmykColors).join(" | ") || "—"}  spot stroke: ${JSON.stringify(s.spotStrokes)}  spot fill: ${JSON.stringify(s.spotFills)}  cut w: ${s.cutWidths.join(",") || "—"}  cut paths: ${s.cutPaths}  max ink: ${Math.round(s.maxInk)}%`,
      );
    }
    for (const i of r.issues) console.log(`  ${i.level === "error" ? "✗" : i.level === "warn" ? "!" : "·"} ${i.msg}`);
  }
}
