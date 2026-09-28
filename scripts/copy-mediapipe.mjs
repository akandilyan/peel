// Copies the MediaPipe Wasm runtime from node_modules to public/mediapipe/wasm
// (gitignored: 22 MB of binaries the package already ships), so face detection
// loads from our own site. Runs before dev and build (package.json).
import { cpSync, mkdirSync } from "node:fs";

const from = "node_modules/@mediapipe/tasks-vision/wasm";
const to = "public/mediapipe/wasm";
mkdirSync(to, { recursive: true });
// forVisionTasks() picks the SIMD build or the fallback without it
for (const name of ["vision_wasm_internal", "vision_wasm_nosimd_internal"]) {
  for (const ext of [".js", ".wasm"]) cpSync(`${from}/${name}${ext}`, `${to}/${name}${ext}`);
}
