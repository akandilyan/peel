// ID badge PDF for a card printer: two identical pages (front and back) the size
// of the card — card printers print edge to edge on pre-cut cards, so there's no
// bleed and no crop marks. Everything is RGB, which is what card printer drivers
// take: the photo as sRGB JPEG, the logo in the brand lavender corrected for the
// printer (LOGO_PRINT_COLOR), the name as outlines in pure black — drivers send
// 0 0 0 to the resin K panel, so the text comes out sharp instead of a YMC mix.
// The HireArt mark is black too; VISITOR on the visitor badge (no photo) is in
// the logo's color.

import { PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import {
  BADGE,
  HIREART,
  LOGO,
  LOGO_PRINT_COLOR,
  badgeStyles,
  photoRect,
  cropRect,
  exportPixels,
  layoutName,
  type BadgeName,
  type BadgePhoto,
  type BadgeStyle,
  type PhotoCrop,
} from "./id-badge";
import { pathOps, type Point } from "./business-card-pdf";
import type { BuiltFile } from "@/components/peel/use-build";

const PT_PER_MM = 72 / 25.4;
/** JPEG quality of the photo: no visible artifacts at 300 dpi. */
const JPEG_QUALITY = 0.92;

const n = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** "#rrggbb" → PDF rg operands, 0…1. */
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => n(parseInt(hex.slice(i, i + 2), 16) / 255)).join(" ");

/** The framed part of the photo as JPEG bytes, square. */
async function croppedPhoto(photo: BadgePhoto, crop: PhotoCrop): Promise<Uint8Array> {
  const img = new Image();
  img.src = photo.url;
  await img.decode();
  const size = exportPixels(photo, crop);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const { sx, sy, side } = cropRect(photo, crop);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't encode the photo"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportIdBadge(
  name: BadgeName,
  photo: BadgePhoto | null,
  crop: PhotoCrop,
  style: BadgeStyle,
  fileName: string,
): Promise<BuiltFile> {
  const PHOTO = photoRect(style);
  const doc = await PDFDocument.create({ updateMetadata: false });
  const ctx = doc.context;
  const W = BADGE.widthMm * PT_PER_MM;
  const H = BADGE.heightMm * PT_PER_MM;
  // Card mm (top left, y down) → page points (bottom left, y up)
  const X = (x: number) => x * PT_PER_MM;
  const Y = (y: number) => H - y * PT_PER_MM;

  // The visitor badge has no photo
  const image = PHOTO && photo ? await doc.embedJpg(await croppedPhoto(photo, crop)) : null;
  const size = PHOTO ? PHOTO.sizeMm * PT_PER_MM : 0;
  const photoOps =
    PHOTO && image
      ? [
          "q",
          `${n(size)} 0 0 ${n(size)} ${n(X(PHOTO.x))} ${n(Y(PHOTO.y + PHOTO.sizeMm))} cm`,
          "/Photo Do",
          "Q",
        ]
      : [];
  const logoMap: Point = (x, y) => [X(LOGO.x + x * LOGO.scale), Y(LOGO.y + y * LOGO.scale)];
  const logoOps = [
    "q",
    `${rgb(LOGO_PRINT_COLOR)} rg`,
    ...LOGO.paths.flatMap((d) => [...pathOps(d, logoMap), "f*"]),
    "Q",
  ];
  const layout = layoutName(name, style);
  const glyphOps = (glyphs: typeof layout.glyphs) =>
    glyphs.flatMap((g) => pathOps(g.d, (x, y) => [X(g.x + x * g.scale), Y(g.y - y * g.scale)]));
  const nameOps = ["q", "0 0 0 rg", ...glyphOps(layout.glyphs), "f", "Q"];
  // VISITOR in the logo's print color
  const labelOps = layout.label.length
    ? ["q", `${rgb(LOGO_PRINT_COLOR)} rg`, ...glyphOps(layout.label), "f", "Q"]
    : [];
  // The HireArt mark in black, on the K panel like the name
  const hireartMap: Point = (x, y) => [
    X(HIREART.x + x * HIREART.scale),
    Y(HIREART.y + y * HIREART.scale),
  ];
  const markOps = badgeStyles[style].hireart
    ? ["q", "0 0 0 rg", ...pathOps(HIREART.d, hireartMap), "f", "Q"]
    : [];

  // One content stream and one image, shared by both pages: the same design
  // on both sides of the card
  const contents = ctx.register(
    ctx.flateStream(
      [...photoOps, ...logoOps, ...nameOps, ...labelOps, ...markOps].join("\n") + "\n",
    ),
  );
  const resources = ctx.obj({ XObject: image ? { Photo: image.ref } : {} });
  for (let i = 0; i < 2; i++) {
    const p = doc.addPage([W, H]);
    p.setTrimBox(0, 0, W, H);
    p.node.set(PDFName.of("Resources"), resources);
    p.node.set(PDFName.of("Contents"), contents);
  }

  ctx.trailerInfo.Info = ctx.register(
    ctx.obj({
      Title: PDFHexString.fromText(fileName.replace(/\.pdf$/, "")),
      Creator: PDFString.of("Peel"),
      Producer: PDFString.of("pdf-lib (https://github.com/Hopding/pdf-lib)"),
    }),
  );
  const bytes = await doc.save({ useObjectStreams: false });
  return { name: fileName, bytes, type: "application/pdf" };
}
