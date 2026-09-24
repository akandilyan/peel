// Number export: one multi-page PDF or a ZIP with a PDF per number.
// A port of export.js from the Fleet Decals plugin.

import { zipSync } from "fflate";
import { createDocument } from "./decal-pdf";
import { layoutNumberPdf } from "./glyph-layout";
import { fileNameFor, formatNumber, type NumberPreset } from "./numbers";

export class Cancelled extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "Cancelled";
  }
}

export interface ExportResult {
  name: string;
  bytes: Uint8Array;
  type: string;
  count: number;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_");

export async function exportDecals({
  numbers,
  preset,
  layer,
  mode,
  copies = 1,
  prefix,
  onProgress = () => {},
  isCancelled = () => false,
}: {
  numbers: number[];
  preset: NumberPreset;
  /** Name of the number layer (for Car — CAR_NAME, as in the plugin). */
  layer: string;
  mode: "pdf" | "zip";
  /** File name prefix — the decal id, so it's clear whose number it is:
   *  robot-lidar-id_1000-1499.zip, containing robot-lidar-id_1000_1.pdf */
  prefix?: string;
  /** Decals per number (2 for a robot, one per lidar side); in a row: 1000, 1000, 1001, 1001 */
  copies?: number;
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}): Promise<ExportResult> {
  if (!numbers.length) throw new Error("Nothing to export");
  const list = numbers.flatMap((n) => Array.from({ length: copies }, () => n));
  const total = list.length;
  const labels = list.map((n) => formatNumber(n, preset));
  const pages = list.map((n, i) => layoutNumberPdf(labels[i], n, preset));
  const pre = prefix ? `${prefix}_` : "";
  const name = (ext: "pdf" | "zip") =>
    `${pre}${fileNameFor(numbers, preset, ext)}`;
  // Progress and cancel check after each page; every 10 pages yield the thread to the UI
  const step = async (i: number) => {
    onProgress(i + 1, total);
    if (isCancelled()) throw new Cancelled();
    if (i % 10 === 9) await tick();
  };

  if (mode === "pdf" || total === 1) {
    const fileName = name("pdf");
    const bytes = await createDocument(pages, fileName.replace(/\.pdf$/, ""), {
      layer,
      onPage: step,
    });
    return { name: fileName, bytes, type: "application/pdf", count: total };
  }

  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < total; i++) {
    // Copies as separate files: robot-lidar-id_1000_1.pdf, …_1000_2.pdf
    const copy = copies > 1 ? `_${(i % copies) + 1}` : "";
    files[`${pre}${safe(labels[i])}${copy}.pdf`] = await createDocument(
      [pages[i]],
      labels[i],
      { layer },
    );
    await step(i);
  }
  // PDFs are already compressed — store them in the ZIP uncompressed
  const bytes = zipSync(files, { level: 0 });
  return {
    name: name("zip"),
    bytes,
    type: "application/zip",
    count: total,
  };
}
