// Static decal export: N decals in one PDF (one per page) or a
// ZIP with a separate PDF for each. The source is a single-page PDF from
// public/decals/source (scripts/regenerate-sources.mts).

import { zipSync } from "fflate";
import { PDFDocument, PDFPage } from "pdf-lib";
import { Cancelled, type ExportResult } from "./export-decals";

export async function exportStatic({
  src,
  copies,
  fileBase,
  mode,
  onProgress = () => {},
  isCancelled = () => false,
}: {
  /** URL of the source PDF */
  src: string;
  /** How many decals (page copies) */
  copies: number;
  /** File name without extension */
  fileBase: string;
  mode: "pdf" | "zip";
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}): Promise<ExportResult> {
  const base = (src.split("/").pop() ?? "decal").replace(/\.pdf$/, "");
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Couldn't load ${src}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pageCount = (await PDFDocument.load(bytes)).getPageCount();
  const total = pageCount * copies;

  if (mode === "pdf" || total === 1) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    // Copies in a row. Each new page is a shallow
    // copy: same content and resources, so layers, spot colors and profile are shared,
    // and the file doesn't grow with the number of copies.
    const originals = doc.getPages();
    let at = 0;
    for (const page of originals) {
      at++;
      for (let k = 1; k < copies; k++) {
        const node = page.node.clone(doc.context);
        const ref = doc.context.register(node);
        doc.insertPage(at++, PDFPage.of(node, ref, doc));
      }
      onProgress(at, total);
      if (isCancelled()) throw new Cancelled();
    }
    const out = await doc.save({ useObjectStreams: false });
    return {
      name: `${fileBase}.pdf`,
      bytes: out,
      type: "application/pdf",
      count: total,
    };
  }

  // ZIP: one decal — one file. The page file is built once and added
  // as many times as there are copies.
  const files: Record<string, Uint8Array> = {};
  let done = 0;
  for (let i = 0; i < pageCount; i++) {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    for (let j = pageCount - 1; j >= 0; j--) if (j !== i) doc.removePage(j);
    const page = await doc.save({ useObjectStreams: false });
    const side = pageCount > 1 ? `_page-${i + 1}` : "";
    for (let k = 1; k <= copies; k++) {
      files[`${base}${side}${copies > 1 ? `_${k}` : ""}.pdf`] = page;
      onProgress(++done, total);
    }
    if (isCancelled()) throw new Cancelled();
  }
  return {
    name: `${fileBase}.zip`,
    // PDFs are already compressed — store them in the ZIP uncompressed
    bytes: zipSync(files, { level: 0 }),
    type: "application/zip",
    count: total,
  };
}
