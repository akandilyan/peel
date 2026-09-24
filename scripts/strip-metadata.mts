// Removes private data (author, XMP metadata, Illustrator private data, orphan
// objects) from the PDFs that ship with the site. regenerate-sources.mts does
// this on its own; run this for files added by hand.
// Usage: npx tsx scripts/strip-metadata.mts [file.pdf ...]   (default: public/decals/source/*.pdf)

import { readdirSync, readFileSync, writeFileSync } from "fs";
import { PDFDocument } from "pdf-lib";
import { stripPrivateData } from "./prepress.mjs";

const dir = "public/decals/source/";
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(dir).filter((f) => f.endsWith(".pdf")).map((f) => dir + f);

for (const f of files) {
  const before = readFileSync(f);
  const doc = await PDFDocument.load(before, { updateMetadata: false });
  stripPrivateData(doc);
  const after = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  writeFileSync(f, after);
  console.log(`${f}: ${Math.round(before.length / 1024)} → ${Math.round(after.length / 1024)} KB`);
}
