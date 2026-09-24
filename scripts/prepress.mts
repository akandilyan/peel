// Prepress of a source PDF page — before it is placed on a new sheet.
// Used in regenerate-sources.mts.
//
// - text to outlines: BT … ET is replaced with glyph outlines from the embedded font
//   (TrueType, Identity-H or simple WinAnsi);
// - brand CMYK -> Pantone spot color (fallback color — the same CMYK);
// - rich black: total ink at most inkLimit, CMY reduced proportionally;
// - CutContour cut line: 0.25 pt width and overprint;
// - the artboard clip (Illustrator writes it into every PDF) is removed: otherwise in
//   Illustrator the artwork opens inside a page-sized frame.

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFContext,
  type PDFObject,
  type PDFPage,
} from "pdf-lib";
import opentype from "opentype.js";
import { inflateSync } from "zlib";

export type PrepressOptions = {
  outlineText?: boolean;
  /** "c m y k" as in the source -> spot color name, e.g. "PANTONE 6219 C" */
  pantone?: Record<string, string>;
  /** Total ink limit, as a fraction: 2.8 = 280% */
  inkLimit?: number;
  /** CutContour cut lines: 0.25 pt and overprint */
  fixCut?: boolean;
  /** Remove the page-sized clip */
  stripPageClip?: boolean;
};

export type PrepressReport = {
  outlinedGlyphs: number;
  pantone: Record<string, number>;
  inkLimited: string[];
  cutFixed: number;
  pageClipsRemoved: number;
};

const n = (v: number) => String(Math.round(v * 1000) / 1000);

/** Spot color: Separation with a fallback CMYK. */
export function separation(ctx: PDFContext, name: string, cmyk: number[]): PDFRef {
  const tint = ctx.register(
    ctx.obj({ FunctionType: 2, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1, 0, 1], C0: [0, 0, 0, 0], C1: cmyk, N: 1 }),
  );
  return ctx.register(ctx.obj([PDFName.of("Separation"), PDFName.of(name), PDFName.of("DeviceCMYK"), tint]));
}

// ─── Tokens with source text ─────────────────────────────────────────────────

type Tok = { raw: string; kind: "num" | "name" | "str" | "hex" | "op" | "punct" };

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const delim = /[\s/[\]()<>{}%]/;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) i++;
    else if (c === "%") while (i < s.length && s[i] !== "\n" && s[i] !== "\r") i++;
    else if (c === "(") {
      const start = i;
      let depth = 0;
      for (; i < s.length; i++) {
        if (s[i] === "\\") {
          i++;
          continue;
        }
        if (s[i] === "(") depth++;
        else if (s[i] === ")" && --depth === 0) break;
      }
      i++;
      out.push({ raw: s.slice(start, i), kind: "str" });
    } else if (c === "<" && s[i + 1] === "<") {
      out.push({ raw: "<<", kind: "punct" });
      i += 2;
    } else if (c === ">" && s[i + 1] === ">") {
      out.push({ raw: ">>", kind: "punct" });
      i += 2;
    } else if (c === "<") {
      const j = s.indexOf(">", i);
      out.push({ raw: s.slice(i, j + 1), kind: "hex" });
      i = j + 1;
    } else if ("[]{}".includes(c)) {
      out.push({ raw: c, kind: "punct" });
      i++;
    } else if (c === "/") {
      let j = i + 1;
      while (j < s.length && !delim.test(s[j])) j++;
      out.push({ raw: s.slice(i, j), kind: "name" });
      i = j;
    } else {
      let j = i;
      while (j < s.length && !delim.test(s[j])) j++;
      const raw = s.slice(i, j);
      out.push({ raw, kind: /^[-+]?(\d+\.?\d*|\.\d+)$/.test(raw) ? "num" : "op" });
      i = j;
      if (raw === "ID") {
        const e = s.indexOf("EI", i);
        out.push({ raw: s.slice(i, e + 2), kind: "op" });
        i = e + 2;
      }
    }
  }
  return out;
}

// PDF string bytes: (literal) or <hex>
function strBytes(t: Tok): number[] {
  if (t.kind === "hex") {
    const h = t.raw.slice(1, -1).replace(/\s/g, "");
    const out: number[] = [];
    for (let i = 0; i < h.length; i += 2) out.push(parseInt((h[i] + (h[i + 1] ?? "0")), 16));
    return out;
  }
  const s = t.raw.slice(1, -1);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") {
      out.push(c.charCodeAt(0));
      continue;
    }
    const e = s[++i];
    const map: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
    if (e in map) out.push(map[e]);
    else if (/[0-7]/.test(e)) {
      let oct = e;
      while (oct.length < 3 && /[0-7]/.test(s[i + 1])) oct += s[++i];
      out.push(parseInt(oct, 8));
    } else if (e === "\r" || e === "\n") {
      if (e === "\r" && s[i + 1] === "\n") i++;
    } else out.push(e.charCodeAt(0));
  }
  return out;
}

// ─── Fonts ───────────────────────────────────────────────────────────────────

type FontInfo = {
  twoByte: boolean;
  font: opentype.Font;
  upm: number;
  /** Width in thousandths of the font size, by code */
  width: (code: number) => number;
  glyph: (code: number) => opentype.Glyph;
};

const lookup = <T,>(ctx: PDFContext, o: PDFObject | undefined): T | undefined =>
  (o instanceof PDFRef ? ctx.lookup(o) : o) as T | undefined;

function loadFont(ctx: PDFContext, fontDict: PDFDict): FontInfo {
  const sub = String(fontDict.get(PDFName.of("Subtype")));
  const twoByte = sub === "/Type0";
  const cid = twoByte
    ? lookup<PDFDict>(ctx, lookup<PDFArray>(ctx, fontDict.get(PDFName.of("DescendantFonts")))!.get(0))!
    : fontDict;
  const desc = lookup<PDFDict>(ctx, cid.get(PDFName.of("FontDescriptor")))!;
  const ff = lookup<PDFRawStream>(ctx, desc.get(PDFName.of("FontFile2")));
  if (!ff) throw new Error("Only embedded TrueType fonts are supported");
  const buf = inflateSync(ff.contents);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const upm = font.unitsPerEm;

  if (twoByte) {
    const enc = String(fontDict.get(PDFName.of("Encoding")));
    const map = String(cid.get(PDFName.of("CIDToGIDMap")) ?? "/Identity");
    if (enc !== "/Identity-H" || map !== "/Identity") throw new Error(`Unsupported CID font ${enc} ${map}`);
    const dw = Number(String(cid.get(PDFName.of("DW")) ?? 1000));
    const widths = new Map<number, number>();
    const w = lookup<PDFArray>(ctx, cid.get(PDFName.of("W")));
    if (w) {
      const a = w.asArray().map((x) => lookup<PDFObject>(ctx, x)!);
      for (let i = 0; i < a.length; ) {
        const first = (a[i] as PDFNumber).asNumber();
        if (a[i + 1] instanceof PDFArray) {
          (a[i + 1] as PDFArray).asArray().forEach((v, k) => widths.set(first + k, Number(String(v))));
          i += 2;
        } else {
          const last = (a[i + 1] as PDFNumber).asNumber();
          const v = (a[i + 2] as PDFNumber).asNumber();
          for (let c = first; c <= last; c++) widths.set(c, v);
          i += 3;
        }
      }
    }
    return {
      twoByte,
      font,
      upm,
      width: (c) => widths.get(c) ?? dw,
      glyph: (c) => font.glyphs.get(c),
    };
  }

  // Simple TrueType: code -> glyph via the font's cmap (Illustrator subsets
  // store a (3,0) table with codes 0xF000 + code or (1,0) with codes as is)
  const first = Number(String(fontDict.get(PDFName.of("FirstChar")) ?? 0));
  const ws = lookup<PDFArray>(ctx, fontDict.get(PDFName.of("Widths")))?.asArray().map((v) => Number(String(v))) ?? [];
  const cmap = (font.tables.cmap as unknown as { glyphIndexMap: Record<number, number> }).glyphIndexMap;
  const winAnsi: Record<number, number> = { 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x96: 0x2013, 0x97: 0x2014, 0x85: 0x2026 };
  return {
    twoByte,
    font,
    upm,
    width: (c) => ws[c - first] ?? 0,
    glyph: (c) => {
      const gid = cmap[c] ?? cmap[0xf000 + c] ?? cmap[winAnsi[c] ?? -1] ?? font.charToGlyphIndex(String.fromCharCode(winAnsi[c] ?? c));
      return font.glyphs.get(gid);
    },
  };
}

// ─── Main pass ───────────────────────────────────────────────────────────────

const mul = (a: number[], b: number[]) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

function contentOf(ctx: PDFContext, page: PDFPage): string {
  const c = page.node.get(PDFName.of("Contents"));
  const o = lookup<PDFObject>(ctx, c);
  const arr = o instanceof PDFArray ? o.asArray().map((r) => lookup<PDFRawStream>(ctx, r)!) : [o as PDFRawStream];
  return arr
    .map((s) => {
      try {
        return inflateSync(s.contents).toString("latin1");
      } catch {
        return Buffer.from(s.contents).toString("latin1");
      }
    })
    .join("\n");
}

export function prepressPage(doc: PDFDocument, page: PDFPage, opts: PrepressOptions): PrepressReport {
  const ctx = doc.context;
  const report: PrepressReport = { outlinedGlyphs: 0, pantone: {}, inkLimited: [], cutFixed: 0, pageClipsRemoved: 0 };
  const res = page.node.Resources()!;
  const dictOf = (key: string) => {
    let d = lookup<PDFDict>(ctx, res.get(PDFName.of(key)));
    if (!d) {
      d = ctx.obj({});
      res.set(PDFName.of(key), d);
    }
    return d;
  };
  const colorSpaces = lookup<PDFDict>(ctx, res.get(PDFName.of("ColorSpace")));
  const fontsRes = lookup<PDFDict>(ctx, res.get(PDFName.of("Font")));
  const fonts = new Map<string, FontInfo>();
  const fontOf = (name: string) => {
    if (!fonts.has(name)) fonts.set(name, loadFont(ctx, lookup<PDFDict>(ctx, fontsRes!.get(PDFName.of(name)))!));
    return fonts.get(name)!;
  };
  const isCutCs = (name: string) => {
    const cs = lookup<PDFArray>(ctx, colorSpaces?.get(PDFName.of(name)));
    return !!cs && String(cs.get(0)) === "/Separation" && /CutContour/i.test(String(cs.get(1)));
  };

  // Resources we add
  const pmsNames = new Map<string, string>(); // spot -> resource name
  const pmsRes = (spot: string, cmyk: number[]) => {
    if (!pmsNames.has(spot)) {
      const key = `CSPms${pmsNames.size}`;
      dictOf("ColorSpace").set(PDFName.of(key), separation(ctx, spot, cmyk));
      pmsNames.set(spot, key);
    }
    return pmsNames.get(spot)!;
  };
  let cutGs: string | null = null;
  const cutGsRes = () => {
    if (!cutGs) {
      cutGs = "GSCutOP";
      dictOf("ExtGState").set(PDFName.of(cutGs), ctx.obj({ Type: "ExtGState", OP: true, op: false, OPM: 1 }));
    }
    return cutGs;
  };

  const out: string[] = [];
  const toks = tokenize(contentOf(ctx, page));
  let args: Tok[] = [];

  // State: no CTM needed — outlines are written in the same coordinate system as the text
  let strokeCut = false;
  const strokeCutStack: boolean[] = [];
  // Start of the current path in out — to wrap the cut line in q … Q
  let pathStart = -1;
  // Current path is a single rectangle (for the page clip)
  let pathRects: number[][] = [];
  let pathOther = false;
  let clipPending = false;
  const mb = page.getMediaBox();
  const coversPage = (r: number[]) => {
    const [x0, x1] = [Math.min(r[0], r[0] + r[2]), Math.max(r[0], r[0] + r[2])];
    const [y0, y1] = [Math.min(r[1], r[1] + r[3]), Math.max(r[1], r[1] + r[3])];
    return x0 <= mb.x + 1 && y0 <= mb.y + 1 && x1 >= mb.x + mb.width - 1 && y1 >= mb.y + mb.height - 1;
  };

  // Text
  let inText = false;
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let font: FontInfo | null = null;
  let tfs = 1;
  let tc = 0;
  let tw = 0;
  let th = 1;
  let tl = 0;
  let trise = 0;
  let textPath: string[] = [];
  const textState: { tc: number; tw: number; th: number; tl: number; font: FontInfo | null; tfs: number; trise: number }[] = [];

  const emit = (...parts: string[]) => out.push(parts.join(" "));
  const rawArgs = () => args.map((a) => a.raw).join(" ");
  const nums = () => args.filter((a) => a.kind === "num").map((a) => Number(a.raw));

  const cmykOp = (op: "k" | "K") => {
    const v = nums();
    const key = v.map((x) => String(x)).join(" ");
    const spot = opts.pantone?.[key];
    if (spot) {
      const r = pmsRes(spot, v);
      report.pantone[spot] = (report.pantone[spot] ?? 0) + 1;
      return op === "k" ? `/${r} cs 1 scn` : `/${r} CS 1 SCN`;
    }
    const total = v.reduce((a, b) => a + b, 0);
    if (opts.inkLimit && total > opts.inkLimit + 1e-6) {
      const f = (opts.inkLimit - v[3]) / (v[0] + v[1] + v[2]);
      const nv = [v[0] * f, v[1] * f, v[2] * f, v[3]];
      report.inkLimited.push(`${key} -> ${nv.map((x) => n(x)).join(" ")}`);
      return `${nv.map((x) => n(x)).join(" ")} ${op}`;
    }
    return `${rawArgs()} ${op}`;
  };

  const showText = (strTok: Tok) => {
    if (!font) throw new Error("Text without font");
    const bytes = strBytes(strTok);
    const codes: number[] = [];
    if (font.twoByte) for (let i = 0; i + 1 < bytes.length; i += 2) codes.push((bytes[i] << 8) | bytes[i + 1]);
    else codes.push(...bytes);
    for (const code of codes) {
      const g = font.glyph(code);
      // Glyph matrix: [tfs*th 0 0 tfs 0 trise] × Tm
      const trm = mul([tfs * th, 0, 0, tfs, 0, trise], tm);
      const s = 1 / font.upm;
      const p = g.getPath(0, 0, font.upm); // font units, y axis down
      const tr = (x: number, y: number) => {
        const gx = x * s;
        const gy = -y * s;
        return `${n(trm[0] * gx + trm[2] * gy + trm[4])} ${n(trm[1] * gx + trm[3] * gy + trm[5])}`;
      };
      let cur = [0, 0];
      for (const c of p.commands) {
        if (c.type === "M") {
          textPath.push(`${tr(c.x, c.y)} m`);
          cur = [c.x, c.y];
        } else if (c.type === "L") {
          textPath.push(`${tr(c.x, c.y)} l`);
          cur = [c.x, c.y];
        } else if (c.type === "Q") {
          // quadratic -> cubic
          const c1 = [cur[0] + (2 / 3) * (c.x1 - cur[0]), cur[1] + (2 / 3) * (c.y1 - cur[1])];
          const c2 = [c.x + (2 / 3) * (c.x1 - c.x), c.y + (2 / 3) * (c.y1 - c.y)];
          textPath.push(`${tr(c1[0], c1[1])} ${tr(c2[0], c2[1])} ${tr(c.x, c.y)} c`);
          cur = [c.x, c.y];
        } else if (c.type === "C") {
          textPath.push(`${tr(c.x1, c.y1)} ${tr(c.x2, c.y2)} ${tr(c.x, c.y)} c`);
          cur = [c.x, c.y];
        } else if (c.type === "Z") textPath.push("h");
      }
      if (p.commands.length) report.outlinedGlyphs++;
      const w0 = font.width(code) / 1000;
      const space = !font.twoByte && code === 32 ? tw : 0;
      const tx = (w0 * tfs + tc + space) * th;
      tm = mul([1, 0, 0, 1, tx, 0], tm);
    }
  };
  const flushText = () => {
    if (textPath.length) emit(textPath.join("\n"), "\nf");
    textPath = [];
  };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind !== "op") {
      args.push(t);
      continue;
    }
    const op = t.raw;

    if (inText && opts.outlineText) {
      switch (op) {
        case "ET":
          flushText();
          inText = false;
          break;
        case "Tf":
          font = fontOf(args[0].raw.slice(1));
          tfs = Number(args[1].raw);
          break;
        case "Tc":
          tc = Number(args[0].raw);
          break;
        case "Tw":
          tw = Number(args[0].raw);
          break;
        case "Tz":
          th = Number(args[0].raw) / 100;
          break;
        case "TL":
          tl = Number(args[0].raw);
          break;
        case "Ts":
          trise = Number(args[0].raw);
          break;
        case "Tr":
          if (Number(args[0].raw) !== 0) throw new Error("Only fill text render mode is supported");
          break;
        case "Tm":
          tm = tlm = nums();
          break;
        case "Td":
        case "TD": {
          const [x, y] = nums();
          if (op === "TD") tl = -y;
          tm = tlm = mul([1, 0, 0, 1, x, y], tlm);
          break;
        }
        case "T*":
          tm = tlm = mul([1, 0, 0, 1, 0, -tl], tlm);
          break;
        case "Tj":
          showText(args[args.length - 1]);
          break;
        case "'":
          tm = tlm = mul([1, 0, 0, 1, 0, -tl], tlm);
          showText(args[args.length - 1]);
          break;
        case '"':
          tw = Number(args[0].raw);
          tc = Number(args[1].raw);
          tm = tlm = mul([1, 0, 0, 1, 0, -tl], tlm);
          showText(args[args.length - 1]);
          break;
        case "TJ":
          for (const a of args) {
            if (a.kind === "str" || a.kind === "hex") showText(a);
            else if (a.kind === "num") tm = mul([1, 0, 0, 1, (-Number(a.raw) / 1000) * tfs * th, 0], tm);
          }
          break;
        // Color and graphics state inside BT — emitted as is (before that, the accumulated
        // outlines are flushed so the color applies to the following glyphs)
        case "k":
        case "K":
          flushText();
          emit(cmykOp(op));
          break;
        default:
          flushText();
          emit(rawArgs(), op);
      }
      args = [];
      continue;
    }

    switch (op) {
      case "BT":
        if (opts.outlineText) {
          inText = true;
          tm = tlm = [1, 0, 0, 1, 0, 0];
          args = [];
          continue;
        }
        break;
      case "q":
        strokeCutStack.push(strokeCut);
        textState.push({ tc, tw, th, tl, font, tfs, trise });
        break;
      case "Q": {
        strokeCut = strokeCutStack.pop() ?? false;
        const s = textState.pop();
        if (s) ({ tc, tw, th, tl, font, tfs, trise } = s);
        break;
      }
      case "Tc":
        tc = Number(args[0].raw);
        break;
      case "Tw":
        tw = Number(args[0].raw);
        break;
      case "Tz":
        th = Number(args[0].raw) / 100;
        break;
      case "TL":
        tl = Number(args[0].raw);
        break;
      case "Tf":
        if (opts.outlineText) {
          font = fontOf(args[0].raw.slice(1));
          tfs = Number(args[1].raw);
          args = [];
          continue;
        }
        break;
      case "CS":
        strokeCut = isCutCs(args[0].raw.slice(1));
        break;
      case "K":
      case "RG":
      case "G":
        strokeCut = false;
        if (op === "K") {
          emit(cmykOp("K"));
          args = [];
          continue;
        }
        break;
      case "k":
        emit(cmykOp("k"));
        args = [];
        continue;
      case "m":
      case "re":
        if (pathStart < 0) {
          pathStart = out.length;
          pathRects = [];
          pathOther = false;
          clipPending = false;
        }
        if (op === "re") pathRects.push(nums());
        else pathOther = true;
        break;
      case "l":
      case "c":
      case "v":
      case "y":
      case "h":
        pathOther = true;
        break;
      case "W":
      case "W*":
        clipPending = true;
        break;
      case "S":
      case "s":
      case "B":
      case "B*":
      case "b":
      case "b*":
        if (opts.fixCut && strokeCut && pathStart >= 0) {
          out.splice(pathStart, 0, `q 0.25 w /${cutGsRes()} gs`);
          emit(rawArgs(), op);
          emit("Q");
          report.cutFixed++;
          pathStart = -1;
          args = [];
          continue;
        }
        pathStart = -1;
        break;
      case "n":
        if (opts.stripPageClip && clipPending && !pathOther && pathRects.length === 1 && coversPage(pathRects[0]) && pathStart >= 0) {
          out.splice(pathStart);
          report.pageClipsRemoved++;
          pathStart = -1;
          args = [];
          continue;
        }
        pathStart = -1;
        break;
      case "f":
      case "F":
      case "f*":
        pathStart = -1;
        break;
    }
    emit(rawArgs(), op);
    args = [];
  }

  const bytes = out.join("\n") + "\n";
  page.node.set(PDFName.of("Contents"), ctx.register(ctx.flateStream(bytes)));
  // Fonts are no longer needed
  if (opts.outlineText && report.outlinedGlyphs) res.delete(PDFName.of("Font"));
  return report;
}

// ─── Private data ────────────────────────────────────────────────────────────

/** Strips data that must not ship with public files: XMP metadata, Illustrator
 *  private data (PieceInfo, the embedded PostScript with the author and source
 *  file name), the Author field — and drops every object that is no longer
 *  reachable from the document (pdf-lib saves orphans otherwise). */
export function stripPrivateData(doc: PDFDocument) {
  const ctx = doc.context;
  doc.catalog.delete(PDFName.of("Metadata"));
  for (const page of doc.getPages())
    for (const k of ["Metadata", "PieceInfo", "LastModified", "Thumb"])
      page.node.delete(PDFName.of(k));
  const info = lookup<PDFDict>(ctx, ctx.trailerInfo.Info);
  if (info)
    for (const [k] of info.entries())
      if (!["/Title", "/Creator", "/Producer"].includes(String(k))) info.delete(k);

  // Reachable objects: from the catalog and the Info dictionary
  const seen = new Set<string>();
  const visit = (o: PDFObject | undefined) => {
    if (!o) return;
    if (o instanceof PDFRef) {
      const key = o.toString();
      if (seen.has(key)) return;
      seen.add(key);
      visit(ctx.lookup(o));
    } else if (o instanceof PDFDict) {
      for (const [, v] of o.entries()) visit(v);
    } else if (o instanceof PDFArray) {
      for (const v of o.asArray()) visit(v);
    } else if (o instanceof PDFRawStream || "dict" in (o as object)) {
      visit((o as unknown as { dict: PDFDict }).dict);
    }
  };
  visit(ctx.trailerInfo.Root);
  visit(ctx.trailerInfo.Info);
  for (const [ref] of ctx.enumerateIndirectObjects())
    if (!seen.has(ref.toString())) ctx.delete(ref);
}
