// Source PDF preview as SVG — for vector layouts without raster images or fonts.
// Run: npx tsx scripts/pdf-to-svg.mts <in.pdf> <out.svg> [page, from 1]
// What it supports: scripts/pdf-svg.mts.

import { readFileSync, writeFileSync } from "fs";
import { PDFDocument } from "pdf-lib";
import { pageToSvg } from "./pdf-svg.mjs";

const [input, output, pageArg] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: pdf-to-svg <in.pdf> <out.svg> [page]");

const doc = await PDFDocument.load(readFileSync(input));
const { svg, paths } = pageToSvg(doc, doc.getPages()[Number(pageArg ?? 1) - 1]);
writeFileSync(output, svg);
console.log(`${output}: ${paths} paths`);
