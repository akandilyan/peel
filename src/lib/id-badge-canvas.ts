// ID badge side drawn with canvas 2D, in card mm: the texture of the 3D preview
// and the flat fallback. Same layout as the PDF (id-badge-pdf.ts), plus what the
// preview needs while the badge is edited on the card: the caret and selection in
// the name, the empty photo square.

import {
  BADGE,
  HIREART,
  LOGO,
  LOGO_COLOR,
  badgeStyles,
  photoRect,
  cropRect,
  type BadgePhoto,
  type NameLayout,
  type BadgeStyle,
  type PhotoRect,
  type PhotoCrop,
} from "./id-badge";

export interface BadgeDrawing {
  style: BadgeStyle;
  name: NameLayout;
  photo: { image: HTMLImageElement; photo: BadgePhoto; crop: PhotoCrop } | null;
  /** The example photo shown until one is added (square) */
  example: HTMLImageElement | null;
  /** Caret or selection in a name line: character indexes in the printed line */
  caret: { line: number; start: number; end: number; visible: boolean } | null;
  /** A file is dragged over the card */
  dropTarget: boolean;
  /** The photo is selected (framed), 0…1 as it eases in: a ring around it */
  selected?: number;
  /** The add-photo button under the pointer, 0…1 as it eases in: it grows
   *  and darkens */
  addHover?: number;
}

/** Brand violet at low strength: the selection and the drop target. */
const HIGHLIGHT = "rgba(109, 82, 255, 0.22)";
const HINT = "#a3a3a3";
/** Brand violet, stronger than the logo's lavender: the caret and the selected
 *  photo's ring */
const ACCENT = "#6d52ff";

const paths = new Map<string, Path2D>();
const path = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

export function drawBadge(ctx: CanvasRenderingContext2D, d: BadgeDrawing) {
  // White card; the corners are cut by the card outline (3D) or the frame (flat)
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, BADGE.widthMm, BADGE.heightMm);

  ctx.save();
  ctx.translate(LOGO.x, LOGO.y);
  ctx.scale(LOGO.scale, LOGO.scale);
  ctx.fillStyle = LOGO_COLOR;
  for (const p of LOGO.paths) ctx.fill(path(p), "evenodd");
  ctx.restore();

  if (badgeStyles[d.style].hireart) {
    ctx.save();
    ctx.translate(HIREART.x, HIREART.y);
    ctx.scale(HIREART.scale, HIREART.scale);
    ctx.fillStyle = "#000";
    ctx.fill(path(HIREART.d));
    ctx.restore();
  }

  const rect = photoRect(d.style);
  if (rect) drawPhoto(ctx, d, rect);

  // Selection under the text
  const c = d.caret;
  const caretLine = c ? d.name.lines[c.line] : undefined;
  if (c && caretLine && !caretLine.hint && c.end > c.start) {
    ctx.fillStyle = HIGHLIGHT;
    ctx.fillRect(
      caretLine.stops[c.start],
      caretLine.top + (caretLine.bottom - caretLine.top) * 0.15,
      caretLine.stops[c.end] - caretLine.stops[c.start],
      (caretLine.bottom - caretLine.top) * 0.7,
    );
  }

  const fillGlyphs = (glyphs: NameLayout["glyphs"]) => {
    for (const g of glyphs) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.scale(g.scale, -g.scale);
      ctx.fill(path(g.d));
      ctx.restore();
    }
  };
  for (const line of d.name.lines) {
    ctx.fillStyle = line.hint ? HINT : "#000";
    fillGlyphs(line.glyphs);
  }
  ctx.fillStyle = LOGO_COLOR;
  fillGlyphs(d.name.label);

  if (c && caretLine && c.visible && c.start === c.end) {
    // A placeholder keeps the caret at its start
    const at = caretLine.stops[caretLine.hint ? 0 : c.start] ?? caretLine.stops[0];
    const h = caretLine.bottom - caretLine.top;
    ctx.fillStyle = ACCENT;
    ctx.fillRect(at - 0.12, caretLine.top + h * 0.12, 0.24, h * 0.76);
  }

  if (rect) drawSelected(ctx, d, rect);
}

/** The photo, or until one is added the example with the upload button. */
function drawPhoto(ctx: CanvasRenderingContext2D, d: BadgeDrawing, rect: PhotoRect) {
  const { x, y, sizeMm } = rect;
  if (d.photo) {
    const { sx, sy, side } = cropRect(d.photo.photo, d.photo.crop);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(d.photo.image, sx, sy, side, side, x, y, sizeMm, sizeMm);
  } else {
    // The example is an abstracted portrait: it reads as a stand-in as it is
    if (d.example) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(d.example, x, y, sizeMm, sizeMm);
    } else {
      ctx.fillStyle = "#f4f4f5";
      ctx.fillRect(x, y, sizeMm, sizeMm);
    }
    drawAddPhoto(ctx, rect, d.addHover ?? 0);
  }
  if (d.dropTarget) {
    ctx.fillStyle = HIGHLIGHT;
    ctx.fillRect(x, y, sizeMm, sizeMm);
  }

}

/** The selected photo: a violet line set off from it by a gap, fading in
 *  with the selection. */
function drawSelected(ctx: CanvasRenderingContext2D, d: BadgeDrawing, rect: PhotoRect) {
  const amount = d.selected ?? 0;
  if (!d.photo || amount <= 0) return;
  const gap = 0.35;
  const width = 0.45;
  const off = gap + width / 2;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = width;
  ctx.strokeRect(rect.x - off, rect.y - off, rect.sizeMm + off * 2, rect.sizeMm + off * 2);
  ctx.restore();
}

/** A round dark button with a white upload arrow in the middle of the photo
 *  square: add a photo here. */
function drawAddPhoto(ctx: CanvasRenderingContext2D, rect: PhotoRect, hover: number) {
  const cx = rect.x + rect.sizeMm / 2;
  const cy = rect.y + rect.sizeMm / 2;
  const grow = 1 + 0.12 * hover;
  const r = 4.2 * grow;
  const icon = 4 * grow;
  ctx.save();
  ctx.fillStyle = `rgba(23, 23, 23, ${0.55 + 0.2 * hover})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Lucide's arrow-up on a 24-unit grid: upload
  ctx.translate(cx - icon / 2, cy - icon / 2);
  ctx.scale(icon / 24, icon / 24);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2.25;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(path("m5 12 7-7 7 7"));
  ctx.stroke(path("M12 19V5"));
  ctx.restore();
}
