// Displays sizes in millimeters or inches. Data is always in mm;
// units are only a display setting (Settings → Units).

export type Units = "mm" | "in";

const MM_PER_IN = 25.4;

/** A single value without units: mm rounded to whole numbers, inches to hundredths. */
function formatLength(mm: number, units: Units, mmDigits = 0): string {
  const v = units === "in" ? mm / MM_PER_IN : mm;
  const digits = units === "in" ? 2 : mmDigits;
  return String(Math.round(v * 10 ** digits) / 10 ** digits);
}

/** A value or a range: «64–82». */
function formatRange(
  min: number,
  max: number,
  units: Units,
  mmDigits = 0,
): string {
  const a = formatLength(min, units, mmDigits);
  const b = formatLength(max, units, mmDigits);
  return a === b ? a : `${a}–${b}`;
}

/** Size «W × H units», each side a number or [from, to]. */
export function formatSize(
  w: number | [number, number],
  h: number | [number, number],
  units: Units,
  mmDigits = 0,
): string {
  const side = (v: number | [number, number]) =>
    Array.isArray(v)
      ? formatRange(v[0], v[1], units, mmDigits)
      : formatLength(v, units, mmDigits);
  return `${side(w)} × ${side(h)} ${units}`;
}
