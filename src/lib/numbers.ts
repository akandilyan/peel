// Number parsing following the Fleet Decals plugin rules.
// Numbers and ranges separated by comma, semicolon, space or line break.
// Range: "-", "–", "—" or "..". Numbers 1–9999, duplicates are removed,
// reversed ranges are flipped, at most 1000 decals at a time.

const MAX_DECALS = 1000;

export interface ParseResult {
  numbers: number[];
  errors: string[];
}

export function sanitizeNumbersInput(raw: string): string {
  // Let through only what the plugin understands: digits, separators, ranges, the V prefix.
  return raw.replace(/[^0-9vV,;\s\-–—.]/g, "");
}

export function parseNumbers(raw: string, { partial = false } = {}): ParseResult {
  const errors: string[] = [];
  const out = new Set<number>();
  const cleaned = raw.replace(/[vV]/g, "");
  const tokens = cleaned.split(/[,;\s]+/).filter(Boolean);

  tokens.forEach((tok, i) => {
    const isLast = i === tokens.length - 1;
    const m = tok.match(/^(\d+)(?:(?:-|–|—|\.\.)(\d*))?$/);
    if (!m) {
      errors.push(`“${tok}” is not a number or range`);
      return;
    }
    const a = Number(m[1]);
    const hasRange = tok.length > m[1].length;
    if (hasRange && m[2] === "") {
      if (!(partial && isLast)) errors.push(`Range “${tok}” has no end`);
      return;
    }
    const b = hasRange ? Number(m[2]) : a;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (lo < 1 || hi > 9999) {
      errors.push(`${tok}: numbers go from 1 to 9999`);
      return;
    }
    for (let n = lo; n <= hi && out.size <= MAX_DECALS; n++) out.add(n);
  });

  const numbers = [...out].sort((x, y) => x - y);
  if (numbers.length > MAX_DECALS) {
    errors.push(`Up to ${MAX_DECALS} decals at a time`);
    numbers.length = MAX_DECALS;
  }
  return { numbers, errors };
}

export interface NumberPreset {
  prefix: string;
  minDigits: number;
  heightMm: number;
  /** Width by number of digits. */
  widthByDigits: Record<number, number>;
  /** Font size in mm. For Car exactly 98 pt, as in the plugin. */
  fontSizeMm: number;
  /** Inter Variable wght 500 outline set: opsz 14 or 32 (glyph-layout.ts). */
  glyphSet: "opsz14" | "opsz32";
  /** Letter spacing, a fraction of the font size (0.05 = +5%). */
  letterSpacingEm?: number;
}

export const numberPresets: Record<"car" | "robot", NumberPreset> = {
  car: { prefix: "V", minDigits: 3, heightMm: 45, widthByDigits: { 3: 110, 4: 135 }, fontSizeMm: (98 * 25.4) / 72, glyphSet: "opsz14" },
  // Per the designer's reference lidar ID file (number 1000): Inter Variable
  // wght 500 opsz 32, font size 30.4 mm, letter spacing +5% — outlines and digit pitch
  // match the reference within 0.01 mm.
  // Numbers are three or four digits: the 88 mm sheet matches the reference, 68 mm is
  // one digit (20 mm) narrower; margins of the widest numbers (444, 4444) are equal.
  robot: {
    prefix: "",
    minDigits: 3,
    heightMm: 36,
    widthByDigits: { 3: 68, 4: 88 },
    fontSizeMm: 30.4,
    glyphSet: "opsz32",
    letterSpacingEm: 0.05,
  },
};

export function formatNumber(n: number, preset: NumberPreset) {
  return preset.prefix + String(n).padStart(preset.minDigits, "0");
}

export function sizeFor(n: number, preset: NumberPreset) {
  const digits = Math.max(preset.minDigits, String(n).length);
  const keys = Object.keys(preset.widthByDigits).map(Number).sort((a, b) => a - b);
  const key = keys.find((k) => k >= digits) ?? keys[keys.length - 1];
  return { width: preset.widthByDigits[key], height: preset.heightMm };
}

/** File name: V199.pdf, V100-V199.zip if contiguous, V042-V300_3pcs.pdf if scattered. */
export function fileNameFor(numbers: number[], preset: NumberPreset, ext: "pdf" | "zip") {
  if (numbers.length === 0) return `decals.${ext}`;
  const f = (n: number) => formatNumber(n, preset);
  if (numbers.length === 1) return `${f(numbers[0])}.${ext}`;
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  const contiguous = last - first + 1 === numbers.length;
  return contiguous
    ? `${f(first)}-${f(last)}.${ext}`
    : `${f(first)}-${f(last)}_${numbers.length}pcs.${ext}`;
}
