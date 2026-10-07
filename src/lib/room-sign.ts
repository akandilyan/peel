// Meeting room sign: a ring Ø 350 mm with the room's name in the middle, cut on
// a plotter from colored film and applied with transfer tape — nothing printed.
// Layout from the designer's "belgrade_meeting_room_stickers_print.pdf" (kept
// outside the repo): a 380 mm square sheet, the ring 22 pt wide on the circle's
// edge, the name in Inter SemiBold, 160 pt, centered on cap height. Changes
// from it: the Display optical size (opsz 32 — the designer set the text one, at
// 160 pt Display is the size's own cut), tracking −1% instead of −2.5% (Display
// is already set tighter), 110% leading instead of 120% (two lines read as one
// name) and the single-storey a (cv11), as on the business card.
//
// Fitting: the name stays on one line while it fits the safe circle; otherwise
// it breaks at a space into the two most even lines; if even that doesn't fit,
// the size goes down, to MIN_FONT_PT at most. A "/" breaks the line by hand.
// Units: mm, origin at the sheet's top left, y down (as in SVG); the glyphs are
// in font units, y up.

const PT_MM = 25.4 / 72;

export const ROOM_SIGN = {
  sheetMm: 380,
  /** The ring's outer edge — the sign's edge */
  diameterMm: 350,
  ringMm: 22 * PT_MM,
  fontPt: 160,
  minFontPt: 120,
  trackingEm: -0.01,
  leading: 1.1,
  /** At 110% an accented capital (Č, Š, Ž reach 0.94 em) under a descender
   *  (g, p, y: −0.21 em) would run into it; the leading opens up for such a
   *  name until the lines are this far apart (~5 mm at 160 pt). */
  minLineGapEm: 0.09,
  /** The lines' ink corners stay within this radius — the line between what
   *  the designer's sets keep on one line (Rio Grande at 140 pt, 125 mm) and
   *  what they break (Lost Maples at 140 pt, 139.6 mm; Nikola Tesla at 160 pt). */
  safeRadiusMm: 135,
  maxLines: 3,
};

export type RoomSignFilm = "white" | "black";

/** Films: Oracal 651 in white and black. */
export const roomSignFilms: {
  id: RoomSignFilm;
  name: string;
  material: string;
  screen: string;
}[] = [
  { id: "white", name: "White", material: "Oracal 651 010 White", screen: "#ffffff" },
  { id: "black", name: "Black", material: "Oracal 651 070 Black", screen: "#111111" },
];

export const defaultRoomSignFilm: RoomSignFilm = "black";

export interface RoomFont {
  unitsPerEm: number;
  capHeight: number;
  glyphs: Record<string, { advance: number; bounds: number[]; d: string }>;
  kerning: Record<string, number>;
}

/** Inter 600, opsz 32, cv11, Latin with Latin Extended-A (scripts/build-glyphs.py,
 *  latin-ext): 400 KB with kerning, so it's loaded with the page that needs it. */
export async function loadRoomFont(): Promise<RoomFont> {
  return (await import("@/data/glyphs-room.json")).default as unknown as RoomFont;
}

/** What can be typed: letters the font has, the comma between rooms and the "/"
 *  line break. Anything else (Cyrillic, emoji) is dropped as it's typed. */
export function typeableRooms(s: string, font: RoomFont): string {
  return [...s.normalize("NFC")]
    .map((ch) => (ch === "\n" || ch === "\t" ? " " : ch))
    .filter((ch) => ch === "," || ch === "/" || ch in font.glyphs)
    .join("");
}

/** Room names from the field: comma-separated, spaces collapsed; "/" stays in
 *  the name as a manual line break. */
export function parseRooms(input: string): string[] {
  return input
    .split(",")
    .map((s) =>
      s
        .split("/")
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" / "),
    )
    .filter(Boolean);
}

/** The name as it reads, without the manual break */
export const roomLabel = (name: string) => name.replace(/\s*\/\s*/g, " ");

/** A file-name slug: accents dropped, Đ → D, spaces → hyphens. */
export function roomSlug(name: string): string {
  return (
    roomLabel(name)
      .replace(/[Đđ]/g, (c) => (c === "Đ" ? "D" : "d"))
      .replace(/[Łł]/g, (c) => (c === "Ł" ? "L" : "l"))
      .replace(/[Øø]/g, (c) => (c === "Ø" ? "O" : "o"))
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "room"
  );
}

export interface PlacedRoomGlyph {
  d: string;
  /** Glyph origin on the baseline, mm */
  x: number;
  y: number;
  /** Ink bounds, font units: xMin, yMin, xMax, yMax */
  bounds: number[];
}

export interface RoomSignLayout {
  lines: string[];
  fontPt: number;
  /** mm per font unit */
  scale: number;
  glyphs: PlacedRoomGlyph[];
  /** The name doesn't fit even at MIN_FONT_PT */
  tooLong: boolean;
}

interface LineMetrics {
  text: string;
  placed: { d: string; x: number; bounds: number[] }[];
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// One line in font units: kerning, tracking, ink bounds
function measure(text: string, font: RoomFont): LineMetrics {
  const track = ROOM_SIGN.trackingEm * font.unitsPerEm;
  let x = 0;
  let left = Infinity;
  let right = -Infinity;
  let top = -Infinity;
  let bottom = Infinity;
  const placed: LineMetrics["placed"] = [];
  [...text].forEach((ch, i) => {
    const g = font.glyphs[ch];
    if (!g) return;
    if (i > 0) x += (font.kerning[text[i - 1] + ch] ?? 0) + track;
    if (g.d) {
      placed.push({ d: g.d, x, bounds: g.bounds });
      left = Math.min(left, x + g.bounds[0]);
      right = Math.max(right, x + g.bounds[2]);
      top = Math.max(top, g.bounds[3]);
      bottom = Math.min(bottom, g.bounds[1]);
    }
    x += g.advance;
  });
  if (!placed.length) return { text, placed, left: 0, right: 0, top: 0, bottom: 0 };
  return { text, placed, left, right, top, bottom };
}

// The leading two lines need, font units: a letter that stands under another
// (their ink overlaps across) keeps minLineGapEm below it. Lines are centered
// on their ink, as laid out.
function leadBetween(upper: LineMetrics, lower: LineMetrics, gap: number): number {
  const spans = (l: LineMetrics) => {
    const x0 = -(l.left + l.right) / 2;
    return l.placed.map((g) => ({
      from: x0 + g.x + g.bounds[0],
      to: x0 + g.x + g.bounds[2],
      top: g.bounds[3],
      bottom: g.bounds[1],
    }));
  };
  const below = spans(lower);
  let need = 0;
  for (const a of spans(upper))
    for (const b of below)
      if (a.from < b.to && b.from < a.to) need = Math.max(need, b.top - a.bottom + gap);
  return need;
}

// Baselines (font units, y up, from the circle's center) of the lines centered
// on cap height; the leading opens up where a letter would come too close to
// the one above it
function baselines(lines: LineMetrics[], font: RoomFont): number[] {
  const n = lines.length;
  const gap = ROOM_SIGN.minLineGapEm * font.unitsPerEm;
  const lead = Math.max(
    ROOM_SIGN.leading * font.unitsPerEm,
    ...lines.slice(1).map((l, i) => leadBetween(lines[i], l, gap)),
  );
  const firstFromCenter = (font.capHeight + (n - 1) * lead) / 2 - font.capHeight;
  return Array.from({ length: n }, (_, i) => firstFromCenter - i * lead);
}

// The farthest ink corner from the center, font units: the size at which the
// block fits scales with it
function reach(lines: LineMetrics[], font: RoomFont): number {
  const bs = baselines(lines, font);
  return Math.max(
    ...lines.map((l, i) => {
      const half = (l.right - l.left) / 2;
      const y = Math.max(Math.abs(bs[i] + l.top), Math.abs(bs[i] + l.bottom));
      return Math.hypot(half, y);
    }),
  );
}

// Every way to break the words into `n` lines
function splits(words: string[], n: number): string[][] {
  if (n === 1) return [[words.join(" ")]];
  const out: string[][] = [];
  for (let i = 1; i <= words.length - n + 1; i++)
    for (const rest of splits(words.slice(i), n - 1))
      out.push([words.slice(0, i).join(" "), ...rest]);
  return out;
}

export function layoutRoomSign(name: string, font: RoomFont): RoomSignLayout {
  const { sheetMm, fontPt, minFontPt, safeRadiusMm } = ROOM_SIGN;
  const emMm = (pt: number) => (pt * PT_MM) / font.unitsPerEm;
  const fitPt = (lines: LineMetrics[]) =>
    Math.min(fontPt, safeRadiusMm / (reach(lines, font) * emMm(1)));

  // Candidates: the manual breaks as typed, or one line, or two lines at any
  // space. One line wins while it fits at full size; otherwise the most even
  // break (the smallest reach — the largest size, "El Camino / Real").
  const manual = name.includes("/");
  const words = roomLabel(name).split(" ").filter(Boolean);
  const options: string[][] = manual
    ? [name.split("/").map((s) => s.trim()).filter(Boolean).slice(0, ROOM_SIGN.maxLines)]
    : [[words.join(" ")], ...(words.length > 1 ? splits(words, 2) : [])];
  const measured = options.map((o) => o.map((t) => measure(t, font)));
  const single = measured[0];
  const best =
    manual || fitPt(single) >= fontPt
      ? single
      : measured.reduce((a, b) => (reach(b, font) < reach(a, font) ? b : a));
  const bestPt = fitPt(best);

  const pt = Math.max(bestPt, minFontPt);
  const scale = emMm(pt);
  const c = sheetMm / 2;
  const bs = baselines(best, font);
  const glyphs = best.flatMap((l, i) => {
    // Each line centered on its ink
    const x0 = c - ((l.left + l.right) / 2) * scale;
    const y = c - bs[i] * scale;
    return l.placed.map((g) => ({ d: g.d, x: x0 + g.x * scale, y, bounds: g.bounds }));
  });
  return {
    lines: best.map((l) => l.text),
    fontPt: Math.round(pt * 10) / 10,
    scale,
    glyphs,
    tooLong: bestPt < minFontPt,
  };
}

/** The sign's file name: space-meeting-room-sign-black_chevapi.pdf, or for a
 *  set, …_5-rooms.pdf / .zip */
export function roomSignFileName(
  id: string,
  film: RoomSignFilm,
  rooms: string[],
  ext: "pdf" | "zip",
): string {
  const what = rooms.length === 1 ? roomSlug(rooms[0]) : `${rooms.length}-rooms`;
  return `${id}-${film}_${what}.${ext}`;
}

/** The field's text with every room cut to what fits: a letter that would take
 *  a name below MIN_FONT_PT isn't typed (a pasted name is cut at the end).
 *  clipped — something was cut. */
export function fitRoomsInput(input: string, font: RoomFont): { value: string; clipped: boolean } {
  let clipped = false;
  const fits = (seg: string) => {
    const [name] = parseRooms(seg);
    return !name || !layoutRoomSign(name, font).tooLong;
  };
  const value = input
    .split(",")
    .map((seg) => {
      if (fits(seg)) return seg;
      clipped = true;
      // The longest start of the segment that fits
      const chars = [...seg];
      let lo = 0;
      let hi = chars.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(chars.slice(0, mid).join(""))) lo = mid;
        else hi = mid - 1;
      }
      return chars.slice(0, lo).join("");
    })
    .join(",");
  return { value, clipped };
}
