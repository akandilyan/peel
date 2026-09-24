// Number layout from font outlines — a port of layout.js from the Fleet Decals plugin.
// Inter Variable outlines are prebuilt with overlaps merged, so the cut line
// never crosses itself (same as in the PDF):
// - glyphs.json — wght 500, opsz 14, from the plugin (Windshield ID);
// - glyphs-robot.json — wght 500, opsz 32, scripts/build-glyphs.py (Lidar ID).
// Units: mm, origin at top left (SVG), font in em units, y axis up.

import glyphsCar from "@/data/glyphs.json";
import glyphsRobot from "@/data/glyphs-robot.json";
import { sizeFor, type NumberPreset } from "./numbers";

type GlyphData = { advance: number; bounds: number[]; d: string };
type GlyphSet = {
  unitsPerEm: number;
  capHeight: number;
  glyphs: Record<string, GlyphData>;
  kerning: Record<string, number>;
};
const glyphSets: Record<NumberPreset["glyphSet"], GlyphSet> = {
  "opsz14": glyphsCar as GlyphSet,
  "opsz32": glyphsRobot as GlyphSet,
};

export interface PlacedGlyph {
  ch: string;
  d: string;
  /** SVG transform: shift to the baseline and flip the y axis. */
  transform: string;
}

export interface NumberLayout {
  widthMm: number;
  heightMm: number;
  /** Actual size of the digits (what ends up on the car), mm. */
  inkMm: { width: number; height: number };
  glyphs: PlacedGlyph[];
}

// Letter spacing in font units (in the preset — a fraction of the font size)
const tracking = (preset: NumberPreset, glyphs: GlyphSet) =>
  (preset.letterSpacingEm ?? 0) * glyphs.unitsPerEm;

export function layoutNumber(
  text: string,
  n: number,
  preset: NumberPreset,
): NumberLayout {
  const { width, height } = sizeFor(n, preset);
  const glyphs = glyphSets[preset.glyphSet];
  const { glyphs: glyphMap, kerning } = glyphs;
  const scale = preset.fontSizeMm / glyphs.unitsPerEm;

  // Glyph positions with kerning, in font units
  let x = 0;
  const placed = [...text].map((ch, i) => {
    const g = glyphMap[ch];
    if (!g) throw new Error(`No glyph for "${ch}"`);
    if (i > 0) x += (kerning[text[i - 1] + ch] ?? 0) + tracking(preset, glyphs);
    const item = { ch, g, x };
    x += g.advance;
    return item;
  });

  // Horizontally — centered on the outline edges, vertically — centered on cap height
  const inkLeft = Math.min(...placed.map((p) => p.x + p.g.bounds[0]));
  const inkRight = Math.max(...placed.map((p) => p.x + p.g.bounds[2]));
  const originX = (width - (inkRight - inkLeft) * scale) / 2 - inkLeft * scale;
  const baseline = (height + glyphs.capHeight * scale) / 2;

  const inkBottom = Math.min(...placed.map((p) => p.g.bounds[1]));
  const inkTop = Math.max(...placed.map((p) => p.g.bounds[3]));

  return {
    widthMm: width,
    heightMm: height,
    inkMm: {
      width: (inkRight - inkLeft) * scale,
      height: (inkTop - inkBottom) * scale,
    },
    glyphs: placed.map((p) => ({
      ch: p.ch,
      d: p.g.d,
      transform: `translate(${originX + p.x * scale} ${baseline}) scale(${scale} ${-scale})`,
    })),
  };
}

// ─── PDF layout (a one-to-one port of layout.js) ────────────────────────────
// Units: PDF points, origin at bottom left, y axis up (same as the font).

const PT_PER_MM = 72 / 25.4;
const mmToPt = (mm: number) => mm * PT_PER_MM;

export interface PdfPageLayout {
  label: string;
  width: number;
  height: number;
  /** Points per font unit. */
  scale: number;
  items: { d: string; x: number; y: number }[];
  /** Cut frame along the decal edge (inset 0, no rounding, as in the Car preset). */
  frame: { x: number; y: number; width: number; height: number };
}

export function layoutNumberPdf(
  label: string,
  n: number,
  preset: NumberPreset,
): PdfPageLayout {
  const { width: widthMm, height: heightMm } = sizeFor(n, preset);
  const width = mmToPt(widthMm);
  const height = mmToPt(heightMm);
  const glyphs = glyphSets[preset.glyphSet];
  const { glyphs: glyphMap, kerning } = glyphs;
  // Preset font size: for Car 98 pt = 34.57 mm
  const scale = mmToPt(preset.fontSizeMm) / glyphs.unitsPerEm;

  let x = 0;
  const placed = [...label].map((ch, i) => {
    const g = glyphMap[ch];
    if (!g) throw new Error(`No glyph for "${ch}"`);
    if (i > 0) x += (kerning[label[i - 1] + ch] ?? 0) + tracking(preset, glyphs);
    const item = { ch, g, x };
    x += g.advance;
    return item;
  });

  const inkLeft = Math.min(...placed.map((p) => p.x + p.g.bounds[0]));
  const inkRight = Math.max(...placed.map((p) => p.x + p.g.bounds[2]));
  const originX = (width - (inkRight - inkLeft) * scale) / 2 - inkLeft * scale; // bounds-center
  const baseline = (height - glyphs.capHeight * scale) / 2; // cap-center

  return {
    label,
    width,
    height,
    scale,
    items: placed.map((p) => ({
      d: p.g.d,
      x: originX + p.x * scale,
      y: baseline,
    })),
    frame: { x: 0, y: 0, width, height },
  };
}
