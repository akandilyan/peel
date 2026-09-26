// Logo color test card for the ID badge printer: a CR80 page with the badge logo
// in the base color and a grid of swatches around it — hue shifted toward red
// (card printers mostly drift violets toward blue) by rows, lightness by
// columns, each labelled with its hex. Print it on the badge printer with the
// usual driver settings, pick the swatch that looks like the base color on
// screen, and put its hex in LOGO_PRINT_COLOR (src/lib/id-badge.ts).
//
//   npx tsx scripts/logo-color-test.mts [base hex] [out.pdf]
//   npx tsx scripts/logo-color-test.mts 9885ff logo-color-test.pdf

import { readFileSync, writeFileSync } from "fs";
import { PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import { BADGE, LOGO } from "../src/lib/id-badge";
import { pathOps, type Point } from "../src/lib/business-card-pdf";

const base = (process.argv[2] ?? "9885ff").replace(/^#/, "").toLowerCase();
const out = process.argv[3] ?? "logo-color-test.pdf";
if (!/^[0-9a-f]{6}$/.test(base)) throw new Error(`Not a hex color: ${base}`);

/** Hue shifts, degrees of OKLCH hue: rows, toward red (up the hue circle). */
const HUES = [-10, 0, 10, 20, 30];
/** Lightness shifts, OKLCH L: columns, darker to lighter. */
const LIGHTS = [-0.08, -0.04, 0, 0.04, 0.08];

// ─── OKLCH (Björn Ottosson's OKLab) ──────────────────────────────────────────

type RGB = [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToRgb(hex: string): RGB {
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB;
}
function rgbToHex(rgb: RGB): string {
  return rgb
    .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0"))
    .join("");
}

function rgbToOklch([r, g, b]: RGB): [number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

function oklchToRgb(L: number, C: number, H: number): RGB {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(toGamma) as RGB;
}

/** In sRGB: chroma lowered until the color fits, keeping lightness and hue. */
function inGamut(L: number, C: number, H: number): RGB {
  for (let c = C; c > 0; c -= 0.002) {
    const rgb = oklchToRgb(L, c, H);
    if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return rgb;
  }
  return oklchToRgb(L, 0, H);
}

// ─── Text: Inter outlines of the business card ───────────────────────────────

type Glyph = { advance: number; d: string };
const inter = JSON.parse(readFileSync(new URL("../src/data/glyphs-card.json", import.meta.url), "utf8")) as {
  unitsPerEm: number;
  glyphs: Record<string, Glyph>;
};

// ─── Page ────────────────────────────────────────────────────────────────────

const PT = 72 / 25.4;
const W = BADGE.widthMm * PT;
const H = BADGE.heightMm * PT;
const X = (x: number) => x * PT;
const Y = (y: number) => H - y * PT;
const n = (v: number) => String(Math.round(v * 1000) / 1000);
const rg = (rgb: RGB) => `${rgb.map((c) => n(Math.min(1, Math.max(0, c)))).join(" ")} rg`;

/** Text centered on cx with its baseline at y, cap-ish size in mm. */
function text(s: string, cx: number, y: number, sizeMm: number): string[] {
  const k = sizeMm / inter.unitsPerEm;
  const width = [...s].reduce((w, ch) => w + (inter.glyphs[ch]?.advance ?? 0), 0) * k;
  let x = cx - width / 2;
  const ops: string[] = [];
  for (const ch of s) {
    const g = inter.glyphs[ch];
    if (!g) continue;
    const ox = x;
    if (g.d) ops.push(...pathOps(g.d, (gx, gy) => [X(ox + gx * k), Y(y - gy * k)]));
    x += g.advance * k;
  }
  return ops.length ? [...ops, "f"] : [];
}

const [L0, C0, H0] = rgbToOklch(hexToRgb(base));
const ops: string[] = [];

// The logo as the badge prints it now: base color, badge size and place
const logoMap: Point = (x, y) => [X(LOGO.x + x * LOGO.scale), Y(LOGO.y + y * LOGO.scale)];
ops.push("q", rg(hexToRgb(base)), ...LOGO.paths.flatMap((d) => [...pathOps(d, logoMap), "f*"]), "Q");

const cx = BADGE.widthMm / 2;
ops.push("q", "0 0 0 rg", ...text(`Logo color test  ·  base #${base.toUpperCase()}`, cx, 15.5, 1.9), "Q");

// Swatch grid
const MARGIN = 3.5;
const GAP = 1;
const cols = LIGHTS.length;
const cell = (BADGE.widthMm - 2 * MARGIN - (cols - 1) * GAP) / cols;
const LABEL = 2.2;
const top = 18.5;
HUES.forEach((dh, row) => {
  LIGHTS.forEach((dl, col) => {
    const rgb = inGamut(L0 + dl, C0, H0 + dh);
    const hex = rgbToHex(rgb);
    const x = MARGIN + col * (cell + GAP);
    const y = top + row * (cell + LABEL + GAP);
    ops.push("q", rg(rgb), `${n(X(x))} ${n(Y(y + cell))} ${n(cell * PT)} ${n(cell * PT)} re f`, "Q");
    // The base color: outlined
    if (dh === 0 && dl === 0)
      ops.push(
        "q",
        "0 0 0 RG",
        `${n(0.25 * PT)} w`,
        `${n(X(x - 0.35))} ${n(Y(y + cell + 0.35))} ${n((cell + 0.7) * PT)} ${n((cell + 0.7) * PT)} re S`,
        "Q",
      );
    ops.push("q", "0 0 0 rg", ...text(hex.toUpperCase(), x + cell / 2, y + cell + 1.9, 1.5), "Q");
  });
});

const bottom = top + HUES.length * (cell + LABEL + GAP);
ops.push(
  "q",
  "0.35 0.35 0.35 rg",
  ...text("Rows: redder downward  ·  columns: darker to lighter", cx, bottom + 2.2, 1.5),
  ...text("Pick the swatch that looks like the base on screen", cx, bottom + 4.6, 1.5),
  "Q",
);

const doc = await PDFDocument.create({ updateMetadata: false });
const page = doc.addPage([W, H]);
page.setTrimBox(0, 0, W, H);
page.node.set(
  PDFName.of("Contents"),
  doc.context.register(doc.context.flateStream(ops.join("\n") + "\n")),
);
doc.context.trailerInfo.Info = doc.context.register(
  doc.context.obj({
    Title: PDFHexString.fromText(`Logo color test #${base}`),
    Creator: PDFString.of("Peel"),
  }),
);
writeFileSync(out, await doc.save({ useObjectStreams: false }));
console.log(`Wrote ${out}: ${HUES.length} × ${cols} swatches around #${base}`);
