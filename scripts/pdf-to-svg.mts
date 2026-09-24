// Source PDF preview as SVG — for vector layouts without raster images or fonts.
// Run: npx tsx scripts/pdf-to-svg.mts <in.pdf> <out.svg> [page, from 1]
//
// Supports: q/Q/cm, paths m/l/c/v/y/h/re, fill f/f*/F, stroke S/s/B/b,
// colors k/K, g/G, rg/RG, spot color /CS … SCN (CutContour is drawn in magenta),
// line width w, clip W n. SVG coordinates are points, as on the PDF page.

import { readFileSync, writeFileSync } from "fs";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { inflateSync } from "zlib";

const [input, output, pageArg] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: pdf-to-svg <in.pdf> <out.svg> [page]");

const doc = await PDFDocument.load(readFileSync(input));
const page = doc.getPages()[Number(pageArg ?? 1) - 1];
const { width: W, height: H } = page.getMediaBox();
const c = page.node.Contents();
const streams = c instanceof PDFArray ? c.asArray().map((r) => doc.context.lookup(r)) : [c];
const text = streams
  .map((s) => {
    const raw = (s as PDFRawStream).contents;
    try { return inflateSync(raw).toString("latin1"); } catch { return Buffer.from(raw).toString("latin1"); }
  })
  .join("\n");

const n = (v: number) => String(Math.round(v * 1000) / 1000);
const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
const cmyk = (c: number, m: number, y: number, k: number) => toHex((1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k));
const CUT = "#EC008C";

type State = { ctm: number[]; fill: string; stroke: string; lw: number; clip: string | null };
let st: State = { ctm: [1, 0, 0, 1, 0, 0], fill: "#000", stroke: "#000", lw: 1, clip: null };
const stack: State[] = [];
const mul = (a: number[], b: number[]) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
// PDF point (y axis up) -> SVG (y axis down)
const P = (x: number, y: number) => {
  const X = st.ctm[0] * x + st.ctm[2] * y + st.ctm[4];
  const Y = st.ctm[1] * x + st.ctm[3] * y + st.ctm[5];
  return `${n(X)} ${n(H - Y)}`;
};
const scale = () => Math.sqrt(Math.abs(st.ctm[0] * st.ctm[3] - st.ctm[1] * st.ctm[2]));

const out: string[] = [];
const clips: string[] = [];
let d: string[] = [];
let cur = [0, 0];
let pendingClip = false;
let args: number[] = [];
let strokeIsCut = false;

const toks = text.match(/\/[^\s/[\]()<>]+|[-+]?\d*\.?\d+(?:e[-+]?\d+)?|[A-Za-z'"*]+|\[|\]/g) ?? [];
for (const t of toks) {
  if (/^[-+]?\d*\.?\d/.test(t)) { args.push(Number(t)); continue; }
  const a = args;
  switch (t) {
    case "q": stack.push({ ...st }); break;
    case "Q": st = stack.pop() ?? st; break;
    case "cm": st.ctm = mul(a.slice(-6), st.ctm); break;
    case "m": d.push(`M ${P(a[0], a[1])}`); cur = [a[0], a[1]]; break;
    case "l": d.push(`L ${P(a[0], a[1])}`); cur = [a[0], a[1]]; break;
    case "c": d.push(`C ${P(a[0], a[1])} ${P(a[2], a[3])} ${P(a[4], a[5])}`); cur = [a[4], a[5]]; break;
    case "v": d.push(`C ${P(cur[0], cur[1])} ${P(a[0], a[1])} ${P(a[2], a[3])}`); cur = [a[2], a[3]]; break;
    case "y": d.push(`C ${P(a[0], a[1])} ${P(a[2], a[3])} ${P(a[2], a[3])}`); cur = [a[2], a[3]]; break;
    case "h": d.push("Z"); break;
    case "re": {
      const [x, y, w, h] = a.slice(-4);
      d.push(`M ${P(x, y)} L ${P(x + w, y)} L ${P(x + w, y + h)} L ${P(x, y + h)} Z`);
      break;
    }
    case "W": case "W*": pendingClip = true; break;
    case "k": st.fill = cmyk(a[0], a[1], a[2], a[3]); break;
    case "K": st.stroke = cmyk(a[0], a[1], a[2], a[3]); strokeIsCut = false; break;
    case "g": st.fill = toHex(a[0], a[0], a[0]); break;
    case "G": st.stroke = toHex(a[0], a[0], a[0]); strokeIsCut = false; break;
    case "rg": st.fill = toHex(a[0], a[1], a[2]); break;
    case "RG": st.stroke = toHex(a[0], a[1], a[2]); strokeIsCut = false; break;
    // Spot color on a stroke — in our layouts this is the CutContour cut line
    case "CS": strokeIsCut = true; break;
    case "SCN": case "SC": if (strokeIsCut) st.stroke = CUT; break;
    case "w": st.lw = a[0]; break;
    case "n": case "f": case "F": case "f*": case "S": case "s": case "B": case "B*": case "b": case "b*": {
      if (t === "s" || t === "b" || t === "b*") d.push("Z");
      const path = d.join(" ");
      if (pendingClip) {
        const id = `c${clips.length}`;
        clips.push(`<clipPath id="${id}"><path d="${path}"/></clipPath>`);
        st.clip = id;
        pendingClip = false;
      }
      if (t !== "n" && path) {
        const fill = ["f", "F", "f*", "B", "B*", "b", "b*"].includes(t) ? st.fill : "none";
        const stroke = ["S", "s", "B", "B*", "b", "b*"].includes(t) ? st.stroke : "none";
        const rule = t.endsWith("*") ? ' fill-rule="evenodd"' : "";
        const sw = stroke !== "none" ? ` stroke="${stroke}" stroke-width="${n(st.lw * scale())}"` : "";
        const clip = st.clip ? ` clip-path="url(#${st.clip})"` : "";
        out.push(`<path d="${path}" fill="${fill}"${rule}${sw}${clip}/>`);
      }
      d = [];
      break;
    }
  }
  args = [];
}

writeFileSync(
  output,
  `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}">` +
    (clips.length ? `<defs>${clips.join("")}</defs>` : "") +
    out.join("") +
    "</svg>\n",
);
console.log(`${output}: ${out.length} paths`);
