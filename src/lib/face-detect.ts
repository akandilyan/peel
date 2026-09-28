// Portrait detection for the ID badge photo, running in the browser — the
// photo never leaves it. Two MediaPipe tasks (Apache-2.0) on one Wasm runtime:
// Face Detector (BlazeFace short-range) finds the face, its eyes, mouth and
// ears; Image Segmenter (selfie segmenter) separates the person from the
// background, which gives the real top of the hair and where the shoulders
// are. The models and the runtime are served from our own site
// (public/mediapipe; the runtime is copied there by scripts/copy-mediapipe.mjs)
// and loaded on demand, with the first photo.

import type { FaceDetector, ImageSegmenter } from "@mediapipe/tasks-vision";
import { headHeight, type PhotoFace } from "./id-badge";
import { withBase } from "./base-path";

/** The models get the photo downscaled to this long side: they look at 128
 *  and 256 px anyway, more only slows them down. */
const DETECT_SIZE = 640;
/** Detections below this confidence are ignored */
const MIN_SCORE = 0.5;
/** A mask pixel with at least this confidence is the person */
const PERSON = 0.5;

type Mask = { data: Float32Array; width: number; height: number };

let models: Promise<{ faces: FaceDetector; person: ImageSegmenter | null }> | null = null;

function loadModels() {
  models ??= (async () => {
    const { FaceDetector, ImageSegmenter, FilesetResolver } = await import(
      "@mediapipe/tasks-vision"
    );
    const wasm = await FilesetResolver.forVisionTasks(withBase("/mediapipe/wasm"));
    const baseOptions = (model: string) => ({
      modelAssetPath: withBase(`/mediapipe/${model}.tflite`),
      delegate: "CPU" as const,
    });
    const [faces, person] = await Promise.all([
      quiet(() =>
        FaceDetector.createFromOptions(wasm, {
          baseOptions: baseOptions("blaze_face_short_range"),
          runningMode: "IMAGE",
          minDetectionConfidence: MIN_SCORE,
        }),
      ),
      // The silhouette only refines the framing: without it the face will do
      quiet(() =>
        ImageSegmenter.createFromOptions(wasm, {
          baseOptions: baseOptions("selfie_segmenter"),
          runningMode: "IMAGE",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        }),
      ).catch(() => null),
    ]);
    return { faces, person };
  })();
  // A failed load (offline, no Wasm) may succeed next time
  models.catch(() => (models = null));
  return models;
}

/** Runs fn with MediaPipe's info lines kept out of the console: its Wasm
 *  prints them to stderr, which lands in console.error ("INFO: Created
 *  TensorFlow Lite XNNPACK delegate for CPU."), and Next.js shows every
 *  console.error in dev as an error. Real errors still go through. */
function quiet<T>(fn: () => T): T {
  const error = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
    error(...args);
  };
  const restore = () => (console.error = error);
  try {
    const result = fn();
    // Loading a model is async: keep the filter until it's done
    if (result instanceof Promise) {
      result.finally(restore).catch(() => {});
      return result;
    }
    restore();
    return result;
  } catch (e) {
    restore();
    throw e;
  }
}

/** The person's confidence per pixel, at the canvas size. */
function personMask(person: ImageSegmenter, canvas: HTMLCanvasElement): Mask | null {
  let mask: Mask | null = null;
  quiet(() =>
    person.segment(canvas, (result) => {
      // One mask (the person) or two (background, person): the last one. The
      // data lives only for the callback: copied.
      const m = result.confidenceMasks?.at(-1);
      if (m) mask = { data: m.getAsFloat32Array().slice(), width: m.width, height: m.height };
    }),
  );
  return mask;
}

/** A part of the photo drawn for a model: its top-left and photo pixels per
 *  canvas pixel. */
type View = { canvas: HTMLCanvasElement; x: number; y: number; k: number };

/** The photo's region (photo pixels) drawn at most DETECT_SIZE on the long
 *  side; brighten — lifted shadows, for a face in the dark. */
function view(
  img: ImageBitmap,
  r: { x: number; y: number; w: number; h: number },
  brighten = false,
): View {
  const k = Math.max(1, Math.max(r.w, r.h) / DETECT_SIZE);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(r.w / k));
  canvas.height = Math.max(1, Math.round(r.h / k));
  const ctx = canvas.getContext("2d")!;
  if (brighten) ctx.filter = "brightness(1.8) contrast(1.15)";
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return { canvas, x: r.x, y: r.y, k };
}

/** The largest face in a view that passes accept (its nose on the person's
 *  silhouette), in photo pixels. */
function faceIn(
  faces: FaceDetector,
  v: View,
  accept: (p: { x: number; y: number }) => boolean,
): PhotoFace | null {
  const { detections } = quiet(() => faces.detect(v.canvas));
  const area = (d: (typeof detections)[number]) =>
    (d.boundingBox?.width ?? 0) * (d.boundingBox?.height ?? 0);
  const toPhoto = (p: { x: number; y: number }) => ({
    x: v.x + p.x * v.canvas.width * v.k,
    y: v.y + p.y * v.canvas.height * v.k,
  });
  const face = detections
    .filter((d) => d.keypoints.length >= 4 && accept(toPhoto(d.keypoints[2])))
    .sort((a, b) => area(b) - area(a))[0];
  if (!face) return null;

  // Keypoints, normalized: right eye, left eye, nose tip, mouth, right ear,
  // left ear
  const [r, l, , m, re, le] = face.keypoints.map(toPhoto);
  const eyes = { x: (r.x + l.x) / 2, y: (r.y + l.y) / 2 };
  const eyeSpan = Math.hypot(l.x - r.x, l.y - r.y);
  // The ears mark the skull's middle: nearer the head's center than the eyes
  // when it's turned. Not farther than a pupil span from the eyes, in case an
  // ear is guessed badly.
  const earsX = re && le ? (re.x + le.x) / 2 : eyes.x;
  return {
    eyes,
    eyeSpan,
    eyeToMouth: Math.hypot(m.x - eyes.x, m.y - eyes.y),
    headX: eyes.x + Math.max(-eyeSpan, Math.min(eyeSpan, earsX - eyes.x)),
    hairTop: null,
    torsoX: null,
  };
}

/** The share of the mask that is the person. */
function share(mask: Mask) {
  let n = 0;
  for (const v of mask.data) if (v >= PERSON) n++;
  return n / mask.data.length;
}

/** Where the tallest person's head is, from the mask: a square over the top
 *  of the silhouette, in photo pixels. The face detector sees the whole photo
 *  at 128 px, so a far or small face gets lost; looked for in this square at
 *  full resolution, it's found. */
function headRegion(mask: Mask, k: number) {
  const { data, width: w, height: h } = mask;
  const rows: number[] = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (data[y * w + x] >= PERSON) n++;
    rows.push(n);
  }
  // A few pixels in a row: not a stray speck
  const top = rows.findIndex((n) => n >= 3);
  if (top < 0) return null;
  let bottom = h - 1;
  while (bottom > top && rows[bottom] < 3) bottom--;
  const tall = bottom - top;
  if (tall < 12) return null;
  // The head: the silhouette's middle across its top tenth
  let sum = 0;
  let n = 0;
  for (let y = top; y < top + Math.max(2, tall * 0.1); y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] >= PERSON) {
        sum += x;
        n++;
      }
    }
  }
  const side = Math.max(tall * 0.4, 24);
  return {
    x: (sum / n - side / 2) * k,
    y: (top - side * 0.1) * k,
    w: side * k,
    h: side * k,
  };
}

/** The main face on the photo — the largest one — or null when there's none.
 *  In photo pixels. Looked for on the whole photo, then brightened (a face in
 *  the dark), then at the top of the person's silhouette (a far or small
 *  face). */
export async function detectFace(url: string): Promise<PhotoFace | null> {
  // A bitmap, not an <img>: it decodes without the page drawing (a background
  // tab too) and applies the EXIF orientation, as the photo is shown
  const img = await createImageBitmap(await (await fetch(url)).blob());
  try {
    const { width, height } = img;
    const whole = { x: 0, y: 0, w: width, h: height };
    const { faces, person } = await loadModels();
    const full = view(img, whole);
    const found = person ? personMask(person, full.canvas) : null;
    // A mask with next to no person in it missed them: no mask then
    const mask = found && share(found) > 0.005 ? found : null;

    // A face off the silhouette is something else: a poster, a screen, a
    // pattern. Without the mask every face goes.
    const k = mask ? width / mask.width : 1;
    const onPerson = (p: { x: number; y: number }) => {
      if (!mask) return true;
      const x = Math.round(p.x / k);
      const y = Math.round(p.y / k);
      // Off the photo (a head cut by its edge): no mask to ask
      if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return true;
      return mask.data[y * mask.width + x] >= PERSON;
    };
    let face = faceIn(faces, full, onPerson) ?? faceIn(faces, view(img, whole, true), onPerson);
    const region = !face && mask ? headRegion(mask, k) : null;
    if (region) {
      // Clipped to the photo: the square may run over its edges
      const x = Math.max(0, region.x);
      const y = Math.max(0, region.y);
      const r = {
        x,
        y,
        w: Math.min(width, region.x + region.w) - x,
        h: Math.min(height, region.y + region.h) - y,
      };
      if (r.w > 8 && r.h > 8)
        face = faceIn(faces, view(img, r), onPerson) ?? faceIn(faces, view(img, r, true), onPerson);
    }
    if (!face) return null;
    return mask ? { ...face, ...silhouette(mask, face, k) } : face;
  } finally {
    img.close();
  }
}

/** The top of the hair above the face and the middle of the shoulders, from
 *  the person mask. k — photo pixels per mask pixel. Null where the mask
 *  doesn't say for sure. */
function silhouette(mask: Mask, face: PhotoFace, k: number): Pick<PhotoFace, "hairTop" | "torsoX"> {
  const { data, width: w, height: h } = mask;
  const at = (x: number, y: number) => data[y * w + x] >= PERSON;
  const H = headHeight(face) / k;
  const eyeY = Math.min(h - 1, Math.round(face.eyes.y / k));
  const headX = face.headX / k;
  const col = (x: number) => Math.max(0, Math.min(w - 1, Math.round(x)));

  // Hair: in the columns over the head, walk up from the eye line while the
  // mask says person; the 10th percentile of those tops skips stray spikes
  const tops: number[] = [];
  for (let x = col(headX - 0.3 * H); x <= col(headX + 0.3 * H); x++) {
    if (!at(x, eyeY)) continue;
    let y = eyeY;
    while (y > 0 && at(x, y - 1)) y--;
    tops.push(y);
  }
  tops.sort((a, b) => a - b);
  const top = tops.length ? tops[Math.floor(tops.length * 0.1)] : null;
  // Hair running off the photo's top, or a top too near or far from the eyes
  // (they sit at about half the head's height), isn't the head's top
  const rise = top === null ? 0 : eyeY - top;
  const hairTop = top !== null && top > 1 && rise > 0.3 * H && rise < 0.9 * H ? top * k : null;

  // Shoulders: the person's middle in a band under the chin, across a few head
  // heights so someone standing next to them stays out
  let sum = 0;
  let count = 0;
  const chin = Math.round(eyeY + H / 2);
  for (let y = chin; y < Math.min(h, chin + 0.5 * H); y++) {
    for (let x = col(headX - 1.5 * H); x <= col(headX + 1.5 * H); x++) {
      if (at(x, y)) {
        sum += x;
        count++;
      }
    }
  }
  // Enough of a torso to go by: at least a head's width across the band
  const torsoX = count > 0.6 * H * 0.5 * H ? (sum / count) * k : null;
  return { hairTop, torsoX };
}
