// Business card: fields, checks, the vCard in the QR code and the layout of the
// back side. Geometry follows the Figma template (Avride Business Card): a
// 1050 × 600 px frame is a 3.5 × 2 in card at 300 px per inch.
// Text is Inter Variable SemiBold (wght 600, opsz 32 — what Figma picks for 48 px),
// outlines from src/data/glyphs-card.json (scripts/build-glyphs.py).
// Units: mm, origin at the top left corner of the card (trim), y axis down.

import {
  AsYouType,
  isPossiblePhoneNumber,
  isValidPhoneNumber,
} from "libphonenumber-js/min";
import qrcode from "qrcode-generator";
import glyphData from "@/data/glyphs-card.json";

export interface CardFields {
  name: string;
  role: string;
  email: string;
  phone: string;
  /** Office id from `offices`, "other" — the free-form address, "" — none */
  office: string;
  /** Free-form address, used when office is "other" */
  address: string;
  linkedin: string;
}

export type CardField = keyof CardFields;

/** Avride offices: the address goes into the vCard field by field, so contact
 *  apps show it the local way. Written the USPS way: one unit (Suite). */
export interface Office {
  id: string;
  name: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

/** An office address on one line, as it reads in contacts. */
export const officeAddress = (o: Office) =>
  `${o.street}, ${o.city}, ${o.region} ${o.postalCode}, ${o.country}`;

export const offices: Office[] = [
  {
    id: "austin",
    name: "Austin",
    street: "8300 MoPac Expy, Suite 300",
    city: "Austin",
    region: "TX",
    postalCode: "78759",
    country: "United States",
  },
];

export const emptyCard: CardFields = {
  name: "",
  role: "",
  email: "",
  phone: "",
  office: "",
  address: "",
  linkedin: "",
};

/** Placeholder values, and the preview until something is entered: Johnny Cab,
 *  the robot cab driver from Total Recall (1990). 555-01XX numbers are reserved
 *  for fiction; 512 is Austin. */
export const exampleCard: CardFields = {
  name: "Johnny Cab",
  role: "Autonomous Driver",
  email: "johnny.cab@avride.ai",
  phone: "+1 (512) 555-0142",
  office: "",
  address: "",
  linkedin: "",
};

const REQUIRED: CardField[] = ["name", "role", "email"];
/** Fields printed on the card: only characters the outlines have. */
const PRINTED: CardField[] = ["name", "role", "email", "phone"];

// ─── Geometry ────────────────────────────────────────────────────────────────

const MM_PER_PX = 25.4 / 300;
const px = (v: number) => v * MM_PER_PX;

export const CARD = {
  widthMm: px(1050),
  heightMm: px(600),
  /** 1/8 in on every side, the US print standard. */
  bleedMm: 25.4 / 8,
};

/** Rounded corners: 1/8 in (3.175 mm), the standard corner-rounding die of US
 *  print shops. The template's 32 px (2.7 mm) has no die; 1/8 in is 37.5 px on
 *  its grid. */
export const CORNER_MM = 25.4 / 8;

// Colors: spot inks of the brand. On screen — the template's color; in the PDF —
// the spot color with its CMYK equivalent (Pantone Color Bridge, approximate).
export interface SpotInk {
  screen: string;
  spot: string;
  cmyk: [number, number, number, number];
}

/** PMS 2705 C — the brand lavender. */
export const LAVENDER: SpotInk = {
  screen: "#b1a5ff",
  spot: "PANTONE 2705 C",
  cmyk: [0.38, 0.35, 0, 0],
};

/** PMS 2715 C — a deeper lavender: white text reads better on it. */
export const LAVENDER_DEEP: SpotInk = {
  screen: "#9885ff",
  spot: "PANTONE 2715 C",
  cmyk: [0.48, 0.52, 0, 0],
};

/** Card designs from the template. The logo is white on every front; the back
 *  is either white paper with black text or the lavender with white text. */
export type CardStyle = "classic" | "lavender" | "solid";

export interface CardStyleSpec {
  name: string;
  front: SpotInk;
  /** Back ink; none — white paper */
  back: SpotInk | null;
  /** Text and QR code on the back */
  text: "black" | "white";
  /** For Details: which inks go on the press */
  print: string;
}

export const cardStyles: Record<CardStyle, CardStyleSpec> = {
  classic: {
    name: "Classic",
    front: LAVENDER,
    back: null,
    text: "black",
    print: "PMS 2705 C · Black",
  },
  lavender: {
    name: "Lavender",
    front: LAVENDER,
    back: LAVENDER,
    text: "white",
    print: "PMS 2705 C, both sides",
  },
  solid: {
    name: "Solid lavender",
    front: LAVENDER_DEEP,
    back: LAVENDER_DEEP,
    text: "white",
    print: "PMS 2715 C, both sides",
  },
};

/** How the card looks, apart from the person's details. */
export interface CardDesign {
  style: CardStyle;
  rounded: boolean;
}

export const defaultDesign: CardDesign = { style: "classic", rounded: true };

const FONT_PX = 48;
const LINE_GAP_PX = 12;
const MARGIN_PX = 80;
/** QR code: 20 mm (the template's 14.6 mm is too small for a vCard), in the
 *  bottom right corner on the same 80 px margins. */
const QR_SIZE_PX = 20 / MM_PER_PX;
const QR_PX = {
  x: 1050 - MARGIN_PX - QR_SIZE_PX,
  y: 600 - MARGIN_PX - QR_SIZE_PX,
  size: QR_SIZE_PX,
};
/** Room between the lower text block and the QR code. */
const QR_GAP_PX = 40;
const TOP_MAX_WIDTH = px(1050 - 2 * MARGIN_PX);
const BOTTOM_MAX_WIDTH = px(QR_PX.x - QR_GAP_PX - MARGIN_PX);

/** Avride logo of the front side, 486 × 64 px, centered on the card; white on lavender. */
export const LOGO = {
  width: px(486),
  height: px(64),
  /** Paths in template pixels, from the logo's top left corner. Even-odd fill. */
  paths: [
    "M39.3415 63.3204L27.2552 31.7482H53.7344L41.6482 63.3204H39.3415Z",
    "M12.8623 0.176006L0.77599 31.7482L27.2552 31.7482L15.169 0.176006H12.8623Z",
    "M80.3423 55.1655L98.1873 8.331H111.849L129.694 55.1655H118.258L106.171 23.5933H103.865L91.7783 55.1655H80.3423Z",
    "M156.384 8.331L174.228 55.1655H187.89L205.735 8.331H194.299L182.213 39.9032H179.906L167.82 8.331H156.384Z",
    "M248.539 40.3094V55.1655H236.957V8.331H248.539V8.33198H262.765C268.563 8.33198 273.094 9.72039 276.268 12.912C278.98 15.6387 280.769 19.7698 280.769 24.5032C280.769 30.998 277.759 35.0024 273.767 37.4116C273.145 37.7875 272.501 38.1264 271.84 38.4286L279.762 55.1655H267.258L260.674 40.3094H248.539ZM248.539 31.6406H261.556C266.446 31.6406 269.69 29.2812 269.69 24.6242C269.69 18.9492 265.698 16.8921 261.228 16.8921H248.539V31.6406Z",
    "M323.574 55.1655V8.331H311.991V55.1655H323.574Z",
    "M386.686 8.33094C394.855 8.33094 399.377 10.3644 403.849 15.0389C407.669 19.0325 410.19 24.8155 410.19 31.7482C410.19 41.2605 406.146 47.1079 400.839 51.1367C396.578 54.371 392.346 55.1655 386.686 55.1655L360.839 55.1655V8.33094H386.686ZM372.421 16.8921V46.6043H384.432C392.432 46.6043 398.432 41.5563 398.432 32C398.432 20.3547 391.432 16.8921 384.432 16.8921H372.421Z",
    "M485.224 8.331H439.901V55.1655H485.224V46.6044H451.484V36.0288H482.706V27.4677H451.484V16.8921H485.224V8.331Z",
  ],
  /** Template pixels → mm on the card. */
  scale: MM_PER_PX,
  x: px((1050 - 486) / 2),
  // 10 px above the center, as in the template
  y: px((600 - 64) / 2 - 10),
};

// ─── Text ────────────────────────────────────────────────────────────────────

type Glyph = { advance: number; bounds: number[]; d: string };
const font = glyphData as unknown as {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  glyphs: Record<string, Glyph>;
  kerning: Record<string, number>;
};

const FONT_MM = px(FONT_PX);
/** mm per font unit */
const SCALE = FONT_MM / font.unitsPerEm;
/** Letter spacing −0.5 px (the template's heading-sm), in font units. */
const TRACKING = (-0.5 / FONT_PX) * font.unitsPerEm;
/** A long email shrinks to fit its block, down to this share of the font size
 *  (70% of 48 px is about 8 pt). */
const MIN_EMAIL_SCALE = 0.7;

export interface PlacedGlyph {
  d: string;
  /** Glyph origin on the baseline, mm */
  x: number;
  y: number;
  /** mm per font unit */
  scale: number;
}

export interface TextLine {
  glyphs: PlacedGlyph[];
  widthMm: number;
}

/** Characters without an outline (not Latin). */
function missingChars(text: string): string[] {
  return [...new Set([...text].filter((ch) => !font.glyphs[ch]))];
}

/** A line in a line box as tall as the font (leading 100%, as in the template):
 *  the baseline sits where Figma and CSS put it. A smaller size (fit < 1) keeps
 *  that baseline, so the line stays in place. */
function layoutLine(
  text: string,
  left: number,
  top: number,
  fit = 1,
): TextLine {
  const baseline =
    top +
    (FONT_MM - (font.ascender - font.descender) * SCALE) / 2 +
    font.ascender * SCALE;
  const scale = SCALE * fit;
  let x = 0;
  const glyphs: PlacedGlyph[] = [];
  [...text].forEach((ch, i) => {
    const g = font.glyphs[ch];
    if (!g) return;
    if (i > 0) x += font.kerning[text[i - 1] + ch] ?? 0;
    if (g.d) glyphs.push({ d: g.d, x: left + x * scale, y: baseline, scale });
    x += g.advance + TRACKING;
  });
  return { glyphs, widthMm: (x - TRACKING) * scale };
}

/** Rows of a name or a role: one if it fits the text column, otherwise two with
 *  a balanced break (like CSS text-wrap: balance) — the longer row as short as
 *  possible, no lone word left on the second one. */
function splitRows(text: string, column: number): string[] {
  const words = text.split(" ");
  const width = (t: string) => layoutLine(t, 0, 0).widthMm;
  if (width(text) <= column || words.length < 2) return [text];
  let best: string[] = [];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const rows = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const w = Math.max(...rows.map(width));
    if (w < bestWidth) {
      best = rows;
      bestWidth = w;
    }
  }
  return best;
}

/** Rows laid out one under another as one TextLine; its width is the widest row. */
function layoutRows(rows: string[], left: number, top: number, step: number): TextLine {
  const lines = rows.map((r, i) => layoutLine(r, left, top + i * step));
  return {
    glyphs: lines.flatMap((l) => l.glyphs),
    widthMm: Math.max(...lines.map((l) => l.widthMm)),
  };
}

/** Fits a line into maxWidth by shrinking it, no smaller than minFit. */
function layoutFitted(
  text: string,
  left: number,
  top: number,
  maxWidth: number,
  minFit: number,
): TextLine {
  const line = layoutLine(text, left, top);
  if (line.widthMm <= maxWidth) return line;
  return layoutLine(text, left, top, Math.max(minFit, maxWidth / line.widthMm));
}

/** SVG transform of a glyph: font units, y axis up → mm on the card. */
export const glyphTransform = (g: PlacedGlyph) =>
  `translate(${g.x} ${g.y}) scale(${g.scale} ${-g.scale})`;

// ─── Checks ──────────────────────────────────────────────────────────────────

const clean = (fields: CardFields): CardFields => {
  const out = { ...fields };
  for (const k of Object.keys(out) as CardField[])
    out[k] = out[k].trim().replace(/\s+/g, " ");
  return out;
};

const EMAIL = /^[a-z0-9._%+-]+@avride\.ai$/i;

// ─── Formatting as you type ──────────────────────────────────────────────────

/** Most digits in a phone number (E.164). */
const MAX_PHONE_DIGITS = 15;

/** Phone as you type: US numbers as on the template, +1 (512) 555-0142, the rest
 *  in the international format, +44 20 7946 0958. Digits without a plus are a US
 *  number. Only digits and the leading plus are kept from the input. */
export function formatPhone(raw: string): string {
  let d = raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  if (!d || d === "+") return d;
  if (!d.startsWith("+")) d = (d.startsWith("1") ? "+" : "+1") + d;
  if (d.startsWith("+1")) {
    const national = d.slice(2, 12);
    return national ? `+1 ${new AsYouType("US").input(national)}` : "+1";
  }
  return new AsYouType().input(d.slice(0, MAX_PHONE_DIGITS + 1));
}

export const EMAIL_DOMAIN = "@avride.ai";

/** Email as you type: the domain is always there — typing the name gives
 *  name@avride.ai, deleting into the domain keeps it, an empty name clears the
 *  field. A different domain stays as typed, so its error shows. */
export function formatEmail(raw: string, prev: string): string {
  let v = raw.replace(/\s/g, "");
  // Backspace right after the @ took the @ itself: take the character before it
  // instead, as if the domain were one fixed piece
  const bare = EMAIL_DOMAIN.slice(1);
  if (
    !v.includes("@") &&
    prev.endsWith(EMAIL_DOMAIN) &&
    v.toLowerCase().endsWith(bare) &&
    v.length === prev.length - 1
  )
    v = v.slice(0, -bare.length).slice(0, -1);
  const at = v.indexOf("@");
  const local = at < 0 ? v : v.slice(0, at);
  const domain = at < 0 ? "" : v.slice(at);
  // No @ yet, or a (partly deleted) @avride.ai
  if (at < 0 || EMAIL_DOMAIN.startsWith(domain.toLowerCase()))
    return local ? local + EMAIL_DOMAIN : "";
  return v;
}

const LINKEDIN = "linkedin.com/in/";

/** LinkedIn as you type: a pasted link or a typed handle becomes
 *  linkedin.com/in/handle; deleting into the prefix clears the field. */
export function formatLinkedin(raw: string, prev: string): string {
  const v = raw.trim();
  if (!v) return "";
  const m = v.match(/linkedin\.com\/in\/([^/?#\s]*)/i);
  if (m) return LINKEDIN + m[1];
  if (LINKEDIN.startsWith(v.toLowerCase()) && v.length < prev.length) return "";
  if (/^@?[A-Za-z0-9_%-]+$/.test(v)) return LINKEDIN + v.replace(/^@/, "");
  return v;
}

/** LinkedIn profile handle from a link or the handle itself. */
function linkedinHandle(v: string): string | null {
  const m = v.match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (m) return m[1];
  return /^@?[A-Za-z0-9_%-]+$/.test(v) ? v.replace(/^@/, "") : null;
}

/** Content errors per field. Empty required fields aren't errors — Download
 *  simply stays off until they're filled, as with Numbers. An unfinished value
 *  (email, phone, LinkedIn) is an error only after its field is left (touched):
 *  no red while typing. */
export function checkCard(
  fields: CardFields,
  touched: ReadonlySet<CardField> = new Set(),
): {
  errors: Partial<Record<CardField, string>>;
  complete: boolean;
} {
  const f = clean(fields);
  const errors: Partial<Record<CardField, string>> = {};
  for (const k of PRINTED) {
    const missing = missingChars(f[k]);
    if (missing.length) errors[k] = `Latin letters only: remove ${missing.join(" ")}`;
  }
  // Unfinished values block Download; the message waits until the field is left
  const unfinished = new Set<CardField>();
  if (f.email && !errors.email && !EMAIL.test(f.email)) {
    unfinished.add("email");
    if (touched.has("email")) errors.email = "Use your @avride.ai email";
  }
  // Possible — the right number of digits; valid — also a real area code and
  // exchange for the country (a typo like +1 (512) 055-… is caught)
  if (f.phone && !errors.phone && !isValidPhoneNumber(f.phone)) {
    unfinished.add("phone");
    if (touched.has("phone"))
      errors.phone = isPossiblePhoneNumber(f.phone)
        ? "Check the number"
        : "Incomplete number";
  }
  if (f.linkedin && !linkedinHandle(f.linkedin)) {
    unfinished.add("linkedin");
    if (touched.has("linkedin"))
      errors.linkedin = "Paste the profile link or the handle";
  }

  // Printed lines must fit their block
  const layout = layoutCard(f);
  for (const [k, line] of Object.entries(layout.lines) as [CardField, TextLine][])
    // A hair of tolerance: a shrunk line lands right on the limit
    if (!errors[k] && line.widthMm > layout.maxWidth[k]! + 1e-6)
      errors[k] = "Too long to fit the card";

  const complete =
    REQUIRED.every((k) => f[k]) &&
    Object.keys(errors).length === 0 &&
    unfinished.size === 0;
  return { errors, complete };
}

// ─── vCard and QR code ───────────────────────────────────────────────────────

// vCard 3.0 text values: backslash, comma, semicolon and line breaks escaped.
const esc = (v: string) => v.replace(/([\\,;])/g, "\\$1").replace(/\n/g, "\\n");

/** ADR: an office field by field (;;street;city;region;postal code;country),
 *  or the free-form address in the street part. */
function adr(f: CardFields): string {
  const office = offices.find((o) => o.id === f.office);
  if (office)
    return `ADR:;;${[office.street, office.city, office.region, office.postalCode, office.country].map(esc).join(";")}`;
  return f.office === "other" && f.address ? `ADR:;;${esc(f.address)}` : "";
}

/** The vCard kept short, so the QR code has fewer modules: no TYPE parameters
 *  (but the LinkedIn label), trailing empty components left out (N, ADR). CRLF line breaks and https:// in
 *  the links stay — the spec and contact apps rely on them. */
export function vCard(fields: CardFields): string {
  const f = clean(fields);
  const parts = f.name.split(" ");
  const family = parts.length > 1 ? parts.pop()! : "";
  const given = parts.join(" ");
  const handle = f.linkedin && linkedinHandle(f.linkedin);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(family)};${esc(given)}`,
    `FN:${esc(f.name)}`,
    "ORG:Avride",
    `TITLE:${esc(f.role)}`,
    `EMAIL:${f.email}`,
    f.phone && `TEL:${f.phone.replace(/[^\d+]/g, "")}`,
    // One free-form line: in the street part
    adr(f),
    "URL:https://avride.ai",
    // Labeled "LinkedIn" in Contacts instead of "homepage"; without the label
    // support (Android) it stays a plain link
    handle && `URL;TYPE=LinkedIn:https://linkedin.com/in/${handle}`,
    "END:VCARD",
  ];
  return lines.filter(Boolean).join("\r\n");
}

// Byte mode in UTF-8 (the library's default keeps only the low byte of each character)
const utf8 = new TextEncoder();
qrcode.stringToBytes = (s: string) => Array.from(utf8.encode(s));

/** Below this module size phone cameras start to struggle with a printed code. */
export const MIN_MODULE_MM = 0.3;

export interface QrLayout {
  x: number;
  y: number;
  size: number;
  modules: number;
  moduleMm: number;
  isDark: (row: number, col: number) => boolean;
}

function layoutQr(data: string): QrLayout {
  // Level L: a vCard is long, and the code is only 20 mm — higher levels make
  // the modules too small to print
  const qr = qrcode(0, "L");
  qr.addData(data, "Byte");
  qr.make();
  const modules = qr.getModuleCount();
  const size = px(QR_PX.size);
  return {
    x: px(QR_PX.x),
    y: px(QR_PX.y),
    size,
    modules,
    moduleMm: size / modules,
    isDark: (r, c) => qr.isDark(r, c),
  };
}

// ─── Back side ───────────────────────────────────────────────────────────────

export interface CardLayout {
  /** Printed lines by field; an empty phone has no line. */
  lines: Partial<Record<CardField, TextLine>>;
  maxWidth: Partial<Record<CardField, number>>;
  qr: QrLayout;
}

/** Back side: name and role at the top (each on up to two rows), phone and
 *  email at the bottom (the lower
 *  block sits on the bottom margin, so without a phone the email stays in place),
 *  QR code in the bottom right corner. */
export function layoutCard(fields: CardFields): CardLayout {
  const f = clean(fields);
  const left = px(MARGIN_PX);
  const step = px(FONT_PX + LINE_GAP_PX);
  const top = px(MARGIN_PX);
  const bottomLine = px(600 - MARGIN_PX - FONT_PX);
  // Top block: name, then role, each on one or two rows. When either wraps, the
  // gap between them doubles (24 px) so the name reads apart from the role.
  const nameRows = splitRows(f.name, BOTTOM_MAX_WIDTH);
  const roleRows = splitRows(f.role, BOTTOM_MAX_WIDTH);
  const wrapGap = nameRows.length > 1 || roleRows.length > 1 ? px(LINE_GAP_PX) : 0;
  const roleTop = top + nameRows.length * step + wrapGap;
  // Rows reaching down to the QR code (283 px) must stay in the text column;
  // rows above it may run the full width
  const qrTop = px(QR_PX.y);
  const limit = (lastRowTop: number) =>
    lastRowTop + FONT_MM > qrTop ? BOTTOM_MAX_WIDTH : TOP_MAX_WIDTH;
  const lines: CardLayout["lines"] = {
    name: layoutRows(nameRows, left, top, step),
    role: layoutRows(roleRows, left, roleTop, step),
    email: layoutFitted(f.email, left, bottomLine, BOTTOM_MAX_WIDTH, MIN_EMAIL_SCALE),
  };
  if (f.phone) lines.phone = layoutLine(f.phone, left, bottomLine - step);
  return {
    lines,
    maxWidth: {
      name: limit(top + (nameRows.length - 1) * step),
      role: limit(roleTop + (roleRows.length - 1) * step),
      email: BOTTOM_MAX_WIDTH,
      phone: BOTTOM_MAX_WIDTH,
    },
    qr: layoutQr(vCard(f)),
  };
}

/** File name: decal id, design and the person's name —
 *  team-business-card-classic_johnny-cab.pdf */
export function cardFileName(
  id: string,
  fields: CardFields,
  style: CardStyle,
): string {
  const slug = clean(fields)
    .name.normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${id}-${style}${slug ? `_${slug}` : ""}.pdf`;
}
