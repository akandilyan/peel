// ID badge: a CR80 plastic card (the ID-1 size of bank cards), printed on a
// dye-sublimation card printer. One design on both sides, so the badge reads
// whichever way it turns on the lanyard. Geometry follows the Figma file "Avride
// Pass": a 540 × 856 px frame, CR80 at 10 px per mm (the card's 53.98 mm rounds
// to 540 px; the design is centered).
// Three versions of the template (badgeStyles, tabs on the preview): Avride —
// the staff badge; HireArt — the same with the HireArt mark under the name and
// everything 20 px higher; Visitor — no photo, the name in the pixel font
// CHAOS16 (SIL OFL, src/data/glyphs-visitor.json) over VISITOR in lavender,
// centered on the card. Staff names are Akzidenz-Grotesk BQ Extended Medium in
// capitals (src/data/glyphs-badge.json, scripts/build-glyphs.py --font: only
// A–Z, space, hyphen, apostrophe and period — a licensed font, the repo is
// public).
// Units: mm, origin at the top left corner of the card, y axis down.

import akzidenzData from "@/data/glyphs-badge.json";
import chaosData from "@/data/glyphs-visitor.json";

// ─── Geometry ────────────────────────────────────────────────────────────────

const FRAME = { width: 540, height: 856 };

/** CR80 (ISO/IEC 7810 ID-1), portrait. */
export const BADGE = { widthMm: 53.98, heightMm: 85.6 };

const MM_PER_PX = BADGE.heightMm / FRAME.height;
/** Template x → card mm: the frame is centered on the card. */
const x = (px: number) => BADGE.widthMm / 2 + (px - FRAME.width / 2) * MM_PER_PX;
const mm = (px: number) => px * MM_PER_PX;

/** Card printers print edge to edge on pre-cut cards but can drift about a
 *  millimetre: keep content this far from the edge. */
export const SAFE_MM = 2;

/** Logo color on screen: the brand lavender (PMS 2715 C), lighter than the
 *  template's #6d52ff — that saturated a violet is out of the card printer's
 *  gamut. */
export const LOGO_COLOR = "#9885ff";

/** Logo color in the PDF. Card printers take RGB and convert it to the YMC
 *  panels through the driver's profile; light violets drift (mostly toward
 *  blue). Pick the swatch that matches LOGO_COLOR on a printed test card
 *  (scripts/logo-color-test.mts) and put its value here. */
export const LOGO_PRINT_COLOR = "#9885ff";

/** Avride logo: the paths sit in a 386 × 96 px box (the logo component's), the
 *  logo's ink 76 px from the top, centered. */
export const LOGO = {
  /** Paths in template pixels, from the logo box's top left corner. Even-odd fill. */
  paths: [
    "M53.1206 69.4768L44.8194 47.8273H63.0062L54.705 69.4768H53.1206Z",
    "M34.9339 26.1778L26.6326 47.8273L44.8194 47.8273L36.5182 26.1778H34.9339Z",
    "M81.2814 63.8849L93.5379 31.7698H102.921L115.177 63.8849H107.323L99.0216 42.2354H97.4372L89.136 63.8849H81.2814Z",
    "M133.509 31.7698L145.765 63.8849H155.149L167.405 31.7698H159.55L151.249 53.4193H149.665L141.364 31.7698H133.509Z",
    "M196.805 53.6979V63.8849H188.849V31.7698H196.805V31.7705H206.575C210.558 31.7705 213.669 32.7226 215.849 34.9111C217.712 36.7808 218.941 39.6136 218.941 42.8594C218.941 47.3129 216.874 50.0588 214.132 51.7108C213.704 51.9685 213.262 52.2009 212.808 52.4082L218.249 63.8849H209.661L205.139 53.6979H196.805ZM196.805 47.7535H205.745C209.104 47.7535 211.332 46.1357 211.332 42.9423C211.332 39.0509 208.59 37.6403 205.52 37.6403H196.805V47.7535Z",
    "M248.34 63.8849V31.7698H240.385V63.8849H248.34Z",
    "M291.688 31.7698C297.299 31.7698 300.405 33.1642 303.476 36.3695C306.1 39.108 307.832 43.0735 307.832 47.8273C307.832 54.3501 305.054 58.3597 301.409 61.1223C298.482 63.3401 295.575 63.8849 291.688 63.8849L273.935 63.8849V31.7698H291.688ZM281.891 37.6403V58.0144H290.14C295.635 58.0144 299.756 54.5529 299.756 48C299.756 40.0146 294.948 37.6403 290.14 37.6403H281.891Z",
    "M359.367 31.7698H328.238V63.8849H359.367V58.0144H336.194V50.7626H357.638V44.8921H336.194V37.6403H359.367V31.7698Z",
  ],
  scale: MM_PER_PX,
  x: x((FRAME.width - 386) / 2),
  y: mm(76 - 26.1778),
};

/** HireArt mark under the name on the HireArt badge, 160.8 × 36 px at (186, 776)
 *  as in the template (a touch left of center: the round icon balances it).
 *  Black, nonzero fill; paths in template px from its top left corner. */
export const HIREART = {
  d: "M8.90137 32.8916C9.75894 32.8916 10.4561 33.5887 10.4561 34.4463C10.4559 35.3038 9.75884 36 8.90137 36C8.0441 35.9997 7.34782 35.3036 7.34766 34.4463C7.34766 33.5889 8.044 32.8919 8.90137 32.8916ZM17.5625 0C27.2638 0 35.1299 7.86559 35.1299 17.5625L35.1211 17.5537C35.121 26.5983 28.2914 34.0394 19.5059 35.0088L19.5059 24.7178C19.5057 22.7214 16.6914 22.4893 16.6914 22.4893C16.3386 22.4223 15.883 22.3505 15.4766 22.2031C14.6548 21.9217 13.9264 21.426 13.377 20.8008C13.0956 20.4881 12.8639 20.1213 12.7031 19.7373C12.6764 19.6659 12.6488 19.5904 12.6221 19.5146L12.9443 19.3311C13.1095 19.5589 13.2929 19.76 13.5117 19.9297C14.0566 20.3584 14.6952 20.6351 15.3428 20.7334C15.6688 20.787 15.968 20.7832 16.3789 20.7832L24.5791 20.8008C25.2088 20.8052 25.8216 21.0822 26.2012 21.5869C27.5143 23.3241 30.3009 22.8912 30.9131 20.8057C31.0158 20.4529 31.0742 20.046 31.0742 19.5771C31.0742 19.5771 31.0608 18.326 30.0469 17.4551L26.2236 14.6816C23.3204 12.3813 21.3457 9.53125 21.3457 9.53125L20.0234 9.53125C19.099 9.53115 18.4426 8.62497 18.7285 7.74512L19.3271 5.90918C19.4923 5.40003 19.4249 4.82787 19.0811 4.41699C18.4825 3.69823 17.3836 3.69816 16.7852 4.41699C16.4412 4.82791 16.3747 5.39999 16.54 5.90918L17.2139 7.98145C17.2898 8.38342 17.1649 8.79896 16.8701 9.09375C16.3073 9.661 15.3914 9.661 14.8242 9.09375C14.5296 8.79897 14.4046 8.38333 14.4805 7.98145L15.1504 5.92676C15.1569 5.909 15.4968 4.9653 14.8154 4.31934C14.1544 3.65829 13.0292 3.74776 12.4932 4.58301C12.2432 4.96706 12.2117 5.45356 12.3545 5.88672L12.8545 7.41895C13.0376 8.004 13.0248 8.63383 12.8193 9.20996L12.377 10.4697C11.4255 9.68808 10.6838 9.53613 8.16016 9.53613L5.2168 9.53613C5.2168 9.53613 6.07043 13.6585 11.3633 14.583L9.5 20.6826L9.50488 20.6846C10.9966 21.1849 12.0732 22.5875 12.0732 24.249L12.0771 24.249C12.0771 26.3259 10.3933 28.0098 8.31641 28.0098C7.96812 28.0097 7.63304 27.9604 7.31152 27.8711L7.30469 27.8691L6.3291 31.0654C2.46106 27.8406 0 22.9893 0 17.5625C2.97581e-05 7.86561 7.86113 2.97594e-05 17.5625 0ZM13.6143 28.2959C14.9906 28.296 16.1064 29.4116 16.1064 30.7881C16.1064 32.1644 14.9906 33.2802 13.6143 33.2803C12.2378 33.2803 11.1221 32.1645 11.1221 30.7881C11.1221 29.4116 12.2377 28.2959 13.6143 28.2959ZM155.409 13.4893L155.78 13.4893C155.976 12.6138 156.191 11.8761 156.418 11.2598C156.601 10.7641 157.08 10.4386 157.611 10.4385L160.523 10.4385L160.523 14.8604L155.405 14.8604L155.405 22.8467C155.405 24.4051 155.977 25.1825 157.656 25.1826C158.513 25.1826 159.457 24.937 160.193 24.6914L160.81 29.6846C159.336 30.1357 158.353 30.4218 156.223 30.4219C151.721 30.4219 149.835 27.4337 149.835 23.749L149.839 23.749L149.839 5.44434L155.409 5.44434L155.409 13.4893ZM99.5039 9.90625C105.483 9.90715 108.306 13.4274 108.306 18.791C108.306 19.6126 108.265 20.3897 108.185 21.4121L95.0391 21.4121C95.3651 24.5206 96.8393 25.9149 99.4609 25.915C102.083 25.915 102.9 24.6867 103.392 23.2129L108.06 24.4814C107.202 27.8401 104.95 30.377 99.4209 30.377C93.5654 30.3769 89.5548 27.2636 89.5547 20.5508C89.5547 13.8383 93.1984 9.90712 99.5039 9.90625ZM47.8506 18.4062L48.2744 18.4062C48.5424 17.245 48.8332 16.3651 49.1592 15.7041C49.3781 15.2577 49.8467 14.9855 50.3467 14.9854L58.0342 14.9854L58.0342 5.2793L63.9297 5.2793L63.9297 29.8457L58.0342 29.8457L58.0342 20.2646L47.8369 20.2646L47.8369 29.8457L41.9414 29.8457L41.9414 5.2793L47.8506 5.2793L47.8506 18.4062ZM73.0332 29.8457L67.4629 29.8457L67.4629 11.0146L73.0332 11.0146L73.0332 29.8457ZM88.5723 16.6201L87.4238 16.6201C83.5381 16.6202 82.4307 17.7679 82.4307 21.207L82.4307 29.8457L76.8604 29.8457L76.8604 11.0146L82.1445 11.0146L82.1445 16.7451L82.5957 16.7451C83.8239 11.3407 85.4632 10.2325 88 10.2324L88.5723 10.2324L88.5723 16.6201ZM134.313 29.8457L128.008 29.8457L126.328 24.4004L116.827 24.4004L115.148 29.8457L109.046 29.8457L117.646 5.2793L125.756 5.2793L134.313 29.8457ZM147.611 16.6201L146.463 16.6201C142.573 16.6202 141.47 17.7679 141.47 21.207L141.47 29.8457L135.899 29.8457L135.899 11.0146L141.184 11.0146L141.184 16.7451L141.635 16.7451C142.863 11.3406 144.503 10.2324 147.039 10.2324L147.611 10.2324L147.611 16.6201ZM118.176 20.0996L124.975 20.0996L122.107 10.3535L121.124 10.3535L118.176 20.0996ZM99.3408 14.083C96.8038 14.083 95.3698 15.3916 95.084 18.585L103.19 18.585C103.106 15.5568 101.878 14.083 99.3408 14.083ZM17.9424 12.7783C18.6346 12.7784 19.1973 13.3419 19.1973 14.0342C19.197 14.7262 18.6345 15.2889 17.9424 15.2891C17.2502 15.2891 16.6877 14.7263 16.6875 14.0342C16.6875 13.3418 17.25 12.7783 17.9424 12.7783ZM70.2461 2.78223C71.8517 2.78249 73.1533 4.0847 73.1533 5.69043C73.1532 7.29607 71.8516 8.59739 70.2461 8.59766C68.6402 8.59766 67.338 7.29623 67.3379 5.69043C67.3379 4.08454 68.6401 2.78223 70.2461 2.78223Z",
  scale: MM_PER_PX,
  x: x(186),
  y: mm(776),
};

// ─── Name style ──────────────────────────────────────────────────────────────

type Glyph = { advance: number; bounds: number[]; d: string };
type GlyphFont = {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  glyphs: Record<string, Glyph>;
  kerning: Record<string, number>;
};

/** A version of the template: how it sets the name, where the photo sits. */
interface BadgeStyleSpec {
  name: string;
  font: GlyphFont;
  /** Template sizes, px: the first that fits the block wins */
  sizes: { font: number; leading: number }[];
  /** Letter spacing, em */
  tracking: number;
  /** A name longer than the last size allows shrinks down to this share of it */
  minFit: number;
  /** Name block: top (of two lines at the first size) and width, px */
  top: number;
  width: number;
  /** A line under the name, in the logo color (VISITOR): the name and it make
   *  one block centered on the card, as the template's auto layout; sizes at
   *  the name's first size, scaled with it */
  label?: { text: string; size: number; leading: number; gap: number };
  /** Capitals with accents dropped (É → E) — the outlines have A–Z only */
  capitals: boolean;
  /** Photo square top, px; none — no photo */
  photoTop: number | null;
  /** The HireArt mark under the name */
  hireart?: boolean;
}

/** The template's versions ("Template", "Template Hireart", "Template Visitor"
 *  in the Figma file). */
export type BadgeStyle = "avride" | "hireart" | "visitor";

// Staff names: Akzidenz-Grotesk BQ Extended Medium in capitals, 8% letter
// spacing, 140% leading; short names at 40 px, long ones at 36 (down to 28)
const akzidenz = {
  font: akzidenzData as unknown as GlyphFont,
  sizes: [
    { font: 40, leading: 56 },
    { font: 36, leading: 50.4 },
  ],
  tracking: 0.08,
  minFit: 28 / 36,
  width: 440,
  capitals: true,
};

export const badgeStyles: Record<BadgeStyle, BadgeStyleSpec> = {
  // The name block at 660 px, the photo at 200
  avride: { name: "Avride", ...akzidenz, top: 660, photoTop: 200 },
  // 20 px higher, the HireArt mark at 776
  hireart: { name: "HireArt", ...akzidenz, top: 640, photoTop: 180, hireart: true },
  // CHAOS16 at 96 px, 100% leading, down to 48 for long names; VISITOR the
  // same size, 11 px under the name; the block centered on the card (at 279
  // with two lines)
  visitor: {
    name: "Visitor",
    font: chaosData as unknown as GlyphFont,
    sizes: [{ font: 96, leading: 96 }],
    tracking: 0,
    minFit: 0.5,
    width: 440,
    capitals: true,
    top: FRAME.height / 2 - (2 * 96 + 11 + 96) / 2,
    label: { text: "VISITOR", size: 96, leading: 96, gap: 11 },
    photoTop: null,
  },
};

export const defaultBadgeStyle: BadgeStyle = "avride";

/** The photo: a 400 px square, centered; its top depends on the style. */
export const PHOTO = {
  x: x((FRAME.width - 400) / 2),
  sizeMm: mm(400),
};

export type PhotoRect = { x: number; y: number; sizeMm: number };

/** The photo square of a style; none on the visitor badge. */
export function photoRect(style: BadgeStyle): PhotoRect | null {
  const top = badgeStyles[style].photoTop;
  return top === null ? null : { x: PHOTO.x, y: mm(top), sizeMm: PHOTO.sizeMm };
}

/** Card printers print at 300 dpi: less and the photo gets soft. Below
 *  MIN_DPI it's visibly blurry. */
export const PRINT_DPI = 300;
export const MIN_DPI = 200;
/** The photo goes into the PDF at up to twice the printer's resolution. */
const MAX_EXPORT_DPI = 2 * PRINT_DPI;

// ─── Name ────────────────────────────────────────────────────────────────────

export interface BadgeName {
  first: string;
  last: string;
}

export type BadgeField = keyof BadgeName;

export const emptyName: BadgeName = { first: "", last: "" };

/** The preview until a name is entered: Johnny Cab, the robot cab driver from
 *  Total Recall (1990), as on the business card. */
export const exampleName: BadgeName = { first: "Johnny", last: "Cab" };

export interface PlacedGlyph {
  d: string;
  /** Glyph origin on the baseline, mm */
  x: number;
  y: number;
  /** mm per font unit */
  scale: number;
}

/** A line of the name as laid out: for drawing, and for the caret when the
 *  name is typed right on the card. */
export interface NameLine {
  field: BadgeField;
  /** As printed (printedText) */
  text: string;
  /** A placeholder or the example, drawn in grey */
  hint: boolean;
  glyphs: PlacedGlyph[];
  /** Caret x, mm, before each character and after the last (text.length + 1) */
  stops: number[];
  /** The line box, mm */
  top: number;
  bottom: number;
}

export interface NameLayout {
  lines: NameLine[];
  /** All glyphs of all lines */
  glyphs: PlacedGlyph[];
  /** Font size in template px, for Details */
  sizePx: number;
  /** Doesn't fit even at the smallest size */
  tooLong: boolean;
  /** The label line under the name (VISITOR), in the logo color */
  label: PlacedGlyph[];
}

/** As printed: single spaces; in the capitals style uppercase with accents
 *  dropped (É → E). */
export function printedText(text: string, style: BadgeStyle): string {
  return printedPrefix(text, style).trimEnd();
}

/** printedText without trimming the end: what a typed prefix prints as, for
 *  mapping the caret between the input and the card. */
function printedPrefix(text: string, style: BadgeStyle): string {
  return printedChars(text, style).trimStart().replace(/\s+/g, " ");
}

/** Characters as printed, spaces as typed. */
function printedChars(text: string, style: BadgeStyle): string {
  return badgeStyles[style].capitals
    ? text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’‘]/g, "'")
        .toUpperCase()
    : // Accented letters as one glyph each (é, not e + ◌́)
      text.normalize("NFC");
}

/** A typed value without what the badge can't print — Cyrillic, digits,
 *  symbols never get into the name; accented Latin stays (it prints as the
 *  plain letter). */
export function typeableText(value: string, style: BadgeStyle): string {
  const { glyphs } = badgeStyles[style].font;
  return [...value]
    .filter((ch) => /\s/.test(ch) || [...printedChars(ch, style)].every((c) => glyphs[c]))
    .join("");
}

/** Caret in the input → character index in the printed line. */
export function printedIndex(value: string, caret: number, style: BadgeStyle): number {
  return Math.min(
    printedText(value, style).length,
    printedPrefix(value.slice(0, caret), style).length,
  );
}

/** Character index in the printed line → caret in the input. */
export function inputIndex(value: string, index: number, style: BadgeStyle): number {
  for (let i = 0; i <= value.length; i++)
    if (printedPrefix(value.slice(0, i), style).length >= index) return i;
  return value.length;
}

/** Characters without an outline. */
function missingChars(text: string, style: BadgeStyle): string[] {
  const { font } = badgeStyles[style];
  return [...new Set([...printedText(text, style)].filter((ch) => !font.glyphs[ch]))];
}

/** Width of a line in font units, without the letter spacing after the last
 *  letter — the line centers on its ink. */
function advanceWidth(text: string, style: BadgeStyle): number {
  const { font, tracking } = badgeStyles[style];
  let w = 0;
  [...text].forEach((ch, i) => {
    const g = font.glyphs[ch];
    if (!g) return;
    if (i > 0) w += (font.kerning[text[i - 1] + ch] ?? 0) + tracking * font.unitsPerEm;
    w += g.advance;
  });
  return w;
}

/** The name block on the card, mm: where a click starts typing the name. Two
 *  lines of the style's first size tall. */
export function nameZone(style: BadgeStyle) {
  const s = badgeStyles[style];
  return {
    x: BADGE.widthMm / 2 - mm(s.width) / 2,
    y: mm(s.top),
    width: mm(s.width),
    height: mm(2 * s.sizes[0].leading),
  };
}

/** Lines centered in the name block, one under another; one line alone sits in
 *  the middle of the two-line block. */
export function layoutNameLines(
  input: { field: BadgeField; text: string; hint?: boolean }[],
  style: BadgeStyle,
): NameLayout {
  const s = badgeStyles[style];
  const { font } = s;
  const zone = nameZone(style);
  const tracking = s.tracking * font.unitsPerEm;
  const lines = input.map((l) => ({ ...l, text: printedText(l.text, style) }));
  const widest = Math.max(0, ...lines.map((l) => advanceWidth(l.text, style)));
  const pxPerUnit = (size: number) => size / font.unitsPerEm;
  // The first template size that fits, otherwise the small one shrunk to fit
  let size = s.sizes.find((z) => widest * mm(pxPerUnit(z.font)) <= zone.width);
  let tooLong = false;
  if (!size) {
    const small = s.sizes[s.sizes.length - 1];
    const fit = zone.width / (widest * mm(pxPerUnit(small.font)));
    tooLong = fit < s.minFit;
    const k = Math.max(fit, s.minFit);
    size = { font: small.font * k, leading: small.leading * k };
  }
  const scale = mm(pxPerUnit(size.font));
  // The label shrinks with the name, its gap too: the block keeps its
  // proportions
  const k = size.font / s.sizes[0].font;
  const label = s.label && {
    text: s.label.text,
    size: s.label.size * k,
    leading: s.label.leading * k,
    gap: s.label.gap * k,
  };
  // With a label the name and it are one block centered on the card; otherwise
  // the lines center in the name block
  const top = label
    ? BADGE.heightMm / 2 -
      mm(lines.length * size.leading + (lines.length ? label.gap : 0) + label.leading) / 2
    : zone.y + (zone.height - lines.length * mm(size.leading)) / 2;
  // Baseline of a line box: the font's ascender and descender centered in it
  const baselineIn = (leading: number, fontPx: number) =>
    mm((leading - ((font.ascender - font.descender) * fontPx) / font.unitsPerEm) / 2 +
      (font.ascender * fontPx) / font.unitsPerEm);
  const laid: NameLine[] = lines.map(({ field, text, hint }, row) => {
    const lineTop = top + mm(row * size.leading);
    const baseline = lineTop + baselineIn(size.leading, size.font);
    let pen = BADGE.widthMm / 2 - (advanceWidth(text, style) * scale) / 2;
    const glyphs: PlacedGlyph[] = [];
    const stops = [pen];
    [...text].forEach((ch, i) => {
      const g = font.glyphs[ch];
      if (i > 0) {
        // The caret sits in the middle of the gap between letters
        const gap = ((font.kerning[text[i - 1] + ch] ?? 0) + tracking) * scale;
        stops.push(pen + gap / 2);
        pen += gap;
      }
      if (!g) return;
      if (g.d) glyphs.push({ d: g.d, x: pen, y: baseline, scale });
      pen += g.advance * scale;
    });
    if (text) stops.push(pen);
    return {
      field,
      text,
      hint: Boolean(hint),
      glyphs,
      stops,
      top: lineTop,
      bottom: lineTop + mm(size.leading),
    };
  });
  const labelGlyphs: PlacedGlyph[] = [];
  if (label) {
    const labelTop = top + mm(lines.length * size.leading + (lines.length ? label.gap : 0));
    const unit = mm(pxPerUnit(label.size));
    const baseline = labelTop + baselineIn(label.leading, label.size);
    let pen = BADGE.widthMm / 2 - (advanceWidth(label.text, style) * unit) / 2;
    [...label.text].forEach((ch, i) => {
      const g = font.glyphs[ch];
      if (i > 0) pen += ((font.kerning[label.text[i - 1] + ch] ?? 0) + tracking) * unit;
      if (g?.d) labelGlyphs.push({ d: g.d, x: pen, y: baseline, scale: unit });
      pen += (g?.advance ?? 0) * unit;
    });
  }
  return {
    lines: laid,
    glyphs: laid.flatMap((l) => l.glyphs),
    sizePx: size.font,
    tooLong,
    label: labelGlyphs,
  };
}

/** The name as printed: the first name on top, the last name under it. */
export function layoutName(name: BadgeName, style: BadgeStyle): NameLayout {
  return layoutNameLines(
    (["first", "last"] as BadgeField[])
      .map((field) => ({ field, text: name[field] }))
      .filter((l) => printedText(l.text, style)),
    style,
  );
}

/** A typed value cut to what fits the badge at the smallest size: typing past
 *  the limit adds nothing, a long paste keeps its start. The limit is width, not
 *  a character count — letters differ a lot (I against W). */
export function fitField(
  name: BadgeName,
  field: BadgeField,
  value: string,
  style: BadgeStyle,
): string {
  // Only a longer value can overflow; shortening always goes through
  if (value.length <= name[field].length) return value;
  let v = value;
  while (v && layoutName({ ...name, [field]: v }, style).tooLong) v = v.slice(0, -1);
  return v;
}

/** Placeholders of empty lines while the name is typed, as in the template. */
export const namePlaceholder: BadgeName = { first: "Name", last: "Surname" };

/** SVG transform of a glyph: font units, y axis up → mm on the card. */
export const glyphTransform = (g: PlacedGlyph) =>
  `translate(${g.x} ${g.y}) scale(${g.scale} ${-g.scale})`;

export function checkName(
  name: BadgeName,
  style: BadgeStyle,
): {
  errors: Partial<Record<BadgeField, string>>;
  complete: boolean;
} {
  const errors: Partial<Record<BadgeField, string>> = {};
  for (const k of ["first", "last"] as BadgeField[]) {
    const missing = missingChars(name[k], style);
    if (missing.length) errors[k] = `Latin letters only: remove ${missing.join(" ")}`;
  }
  if (!Object.keys(errors).length && layoutName(name, style).tooLong) {
    // Blame the longer line
    const width = (t: string) => advanceWidth(printedText(t, style), style);
    const k = width(name.first) >= width(name.last) ? "first" : "last";
    errors[k] = "Too long to fit the badge";
  }
  // The last name is optional: some people go by one name
  return {
    errors,
    complete: !Object.keys(errors).length && Boolean(printedText(name.first, style)),
  };
}

// ─── Photo ───────────────────────────────────────────────────────────────────

/** An uploaded photo: an object URL of the file, it never leaves the browser. */
export interface BadgePhoto {
  url: string;
  /** Pixels as displayed (EXIF orientation applied) */
  width: number;
  height: number;
}

/** Framing of the photo in its square: zoom 1 — the photo just covers the
 *  square; x, y — the point of the photo (0…1 of its width and height) at the
 *  square's center. */
export interface PhotoCrop {
  zoom: number;
  x: number;
  y: number;
}

export const MAX_ZOOM = 4;

/** Half the visible part of the photo, as a share of its width and height. */
function halfView(photo: BadgePhoto, zoom: number) {
  const side = Math.min(photo.width, photo.height) / zoom;
  return { hx: side / photo.width / 2, hy: side / photo.height / 2, side };
}

/** Keeps the square covered: zoom in range, the center no closer to the photo's
 *  edge than half the view. */
export function clampCrop(photo: BadgePhoto, crop: PhotoCrop): PhotoCrop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
  const { hx, hy } = halfView(photo, zoom);
  const clamp = (v: number, h: number) => Math.min(1 - h, Math.max(h, v));
  return { zoom, x: clamp(crop.x, hx), y: clamp(crop.y, hy) };
}

/** A new photo's framing: whole width of a portrait shot, a bit above center —
 *  where the face usually is. */
export function defaultCrop(photo: BadgePhoto): PhotoCrop {
  return clampCrop(photo, { zoom: 1, x: 0.5, y: 0.4 });
}

/** The part of the photo in the square, in photo pixels. */
export function cropRect(photo: BadgePhoto, crop: PhotoCrop) {
  const { hx, hy, side } = halfView(photo, crop.zoom);
  return {
    sx: (crop.x - hx) * photo.width,
    sy: (crop.y - hy) * photo.height,
    side,
  };
}

/** Resolution of the photo on the card at this zoom. */
export function photoDpi(photo: BadgePhoto, crop: PhotoCrop): number {
  return cropRect(photo, crop).side / (PHOTO.sizeMm / 25.4);
}

/** Pixel size of the photo going into the PDF: the crop's own pixels, capped. */
export function exportPixels(photo: BadgePhoto, crop: PhotoCrop): number {
  const cap = Math.round((PHOTO.sizeMm / 25.4) * MAX_EXPORT_DPI);
  return Math.max(1, Math.min(cap, Math.round(cropRect(photo, crop).side)));
}

export function badgeFileName(id: string, style: BadgeStyle, name: BadgeName): string {
  const slug = `${name.first} ${name.last}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${id}-${style}${slug ? `_${slug}` : ""}.pdf`;
}
