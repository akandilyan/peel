// Business card sides as SVG markup in mm (viewBox = the card trim): textures of
// the 3D preview and the flat fallback draw from the same layout as the PDF.

import {
  CARD,
  CORNER_MM,
  LOGO,
  cardStyles,
  glyphTransform,
  type CardDesign,
  type CardField,
  type CardLayout,
} from "./business-card";

const r = (v: number) => Math.round(v * 10000) / 10000;

/** Card background; rounded corners are cut out (transparent), like the die cut. */
function background(fill: string, design: CardDesign): string {
  const rx = design.rounded ? ` rx="${r(CORNER_MM)}"` : "";
  return `<rect width="${r(CARD.widthMm)}" height="${r(CARD.heightMm)}"${rx} fill="${fill}"/>`;
}

export function frontSvg(design: CardDesign): string {
  const logo = LOGO.paths.map((d) => `<path d="${d}"/>`).join("");
  return (
    background(cardStyles[design.style].front.screen, design) +
    `<g transform="translate(${r(LOGO.x)} ${r(LOGO.y)}) scale(${LOGO.scale})" fill="#fff" fill-rule="evenodd">${logo}</g>`
  );
}

export function backSvg(
  layout: CardLayout,
  hinted: Set<CardField>,
  design: CardDesign,
): string {
  const style = cardStyles[design.style];
  const ink = style.text === "white" ? "#fff" : "#000";
  // Example text standing in for empty required fields: half-strength ink
  const hint = style.text === "white" ? "rgba(255,255,255,0.5)" : "#a3a3a3";
  const text = (Object.entries(layout.lines) as [CardField, CardLayout["lines"][CardField]][])
    .map(([k, line]) => {
      const glyphs = line!.glyphs
        .map((g) => `<path d="${g.d}" transform="${glyphTransform(g)}"/>`)
        .join("");
      return `<g fill="${hinted.has(k) ? hint : ink}">${glyphs}</g>`;
    })
    .join("");
  // QR: one path, a rectangle per horizontal run of dark modules
  const { qr } = layout;
  const m = qr.moduleMm;
  let d = "";
  for (let row = 0; row < qr.modules; row++)
    for (let c = 0; c < qr.modules; c++) {
      if (!qr.isDark(row, c)) continue;
      let end = c;
      while (end + 1 < qr.modules && qr.isDark(row, end + 1)) end++;
      const w = (end - c + 1) * m;
      d += `M${r(qr.x + c * m)} ${r(qr.y + row * m)}h${r(w)}v${r(m)}h${r(-w)}z`;
      c = end;
    }
  return (
    background(style.back?.screen ?? "#fff", design) +
    text +
    // A hairline stroke in the fill color closes seams between rows
    `<path d="${d}" fill="${ink}" stroke="${ink}" stroke-width="0.01"/>`
  );
}

/** A standalone SVG document of one side, rendered at the given pixel width. */
export function sideDocument(inner: string, widthPx: number): string {
  const heightPx = Math.round((widthPx * CARD.heightMm) / CARD.widthMm);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${r(CARD.widthMm)} ${r(CARD.heightMm)}">${inner}</svg>`;
}
