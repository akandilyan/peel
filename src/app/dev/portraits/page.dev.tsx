"use client";

// Dev only (*.dev.tsx, see next.config.ts): the ID badge auto framing run on
// the test portraits of scripts/portrait-samples.json, fetched into
// public/dev-portraits by scripts/fetch-portraits.mjs. Each card: the photo
// with what the detector found (eyes, head middle, hair top, chin guess,
// shoulders, the square), the badge photo it gives, and what's off with the
// photo itself, if anything.

import { useEffect, useRef, useState } from "react";
import { detectFace } from "@/lib/face-detect";
import {
  HEAD_FRAMING,
  MIN_DPI,
  PHOTO,
  cropRect,
  defaultCrop,
  faceCrop,
  headHeight,
  photoDpi,
  type BadgePhoto,
  type PhotoCrop,
  type PhotoFace,
} from "@/lib/id-badge";
import { withBase } from "@/lib/base-path";

type Sample = { id: string; kind: string; author: string };

/** What's off with a photo for the badge, however it's framed: the head runs
 *  off the photo's edge (cut); the face is so small the square gets blurry
 *  before it's big enough (small: under ~70% of its size at MIN_DPI); the
 *  head is so big no framing leaves room under the chin (tight). */
type FramingIssue = "cut" | "small" | "tight";

type Result = {
  sample: Sample;
  photo: BadgePhoto;
  face: PhotoFace | null;
  crop: PhotoCrop;
  issue: FramingIssue | null;
  ms: number;
};

function framingIssue(photo: BadgePhoto, face: PhotoFace): FramingIssue | null {
  const H = headHeight(face);
  const chin = face.eyes.y + H / 2;
  // The skull, without the hair: a head is about 0.7 of its height wide
  const crown = face.eyes.y - H / 2;
  const slack = 0.08 * H;
  if (
    crown < -slack ||
    chin > photo.height + slack ||
    face.headX - 0.35 * H < -slack ||
    face.headX + 0.35 * H > photo.width + slack
  )
    return "cut";
  const top = face.hairTop ?? face.eyes.y - 0.58 * H;
  const wanted = (chin - top) / HEAD_FRAMING.head;
  if (wanted < 0.7 * (PHOTO.sizeMm / 25.4) * MIN_DPI) return "small";
  if (wanted > 1.4 * Math.min(photo.width, photo.height)) return "tight";
  return null;
}

export default function PortraitLab() {
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const samples: Sample[] = await (
        await fetch(withBase("/dev-portraits/manifest.json"))
      ).json();
      setTotal(samples.length);
      // One at a time: the models run on one Wasm instance
      for (const sample of samples) {
        const url = withBase(`/dev-portraits/${sample.id}.jpg`);
        const bitmap = await createImageBitmap(await (await fetch(url)).blob());
        const photo = { url, width: bitmap.width, height: bitmap.height };
        bitmap.close();
        const t = performance.now();
        const face = await detectFace(url).catch(() => null);
        const ms = Math.round(performance.now() - t);
        if (cancelled) return;
        const result: Result = {
          sample,
          photo,
          face,
          crop: face ? faceCrop(photo, face) : defaultCrop(photo),
          issue: face ? framingIssue(photo, face) : null,
          ms,
        };
        setResults((r) => [...r, result]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // For a look from the console or a script
  useEffect(() => {
    Object.assign(window, { portraitResults: results });
  }, [results]);

  return (
    <main className="mx-auto max-w-[1400px] p-6">
      <h1 className="mb-1 text-2xl font-semibold">Auto framing on test portraits</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {results.length} of {total} · cyan — head middle, yellow — hair top (silhouette), orange —
        chin (guess), green — shoulders&apos; middle, violet — the badge square
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-4">
        {results.map((r) => (
          <Card key={r.sample.id} result={r} />
        ))}
      </div>
    </main>
  );
}

function Card({ result }: { result: Result }) {
  const { sample, photo, face, crop, issue, ms } = result;
  const dpi = Math.round(photoDpi(photo, crop));
  const rows: [string, string][] = [
    ["Face", face ? "found" : "none — default framing"],
    ["Issue", issue ?? "—"],
    ["Hair top", face ? (face.hairTop === null ? "guessed" : "silhouette") : "—"],
    ["Shoulders", face ? (face.torsoX === null ? "not found" : "silhouette") : "—"],
    ["Zoom", `${Math.round(crop.zoom * 100)}%`],
    ["Print", `${dpi} dpi${dpi < MIN_DPI ? " · below the printer's" : ""}`],
    ["Photo", `${photo.width} × ${photo.height} px`],
    ["Time", `${ms} ms`],
  ];
  return (
    <section className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{sample.kind}</h2>
        <span className="truncate text-xs text-muted-foreground">
          {sample.id} · {sample.author}
        </span>
      </div>
      <div className="flex gap-3">
        <Annotated result={result} />
        <div className="flex flex-col gap-2">
          <Crop photo={photo} crop={crop} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

/** The photo with the detector's marks and the square over it. */
function Annotated({ result }: { result: Result }) {
  const { photo, face, crop } = result;
  const { sx, sy, side } = cropRect(photo, crop);
  const H = face ? headHeight(face) : 0;
  const stroke = Math.max(photo.width, photo.height) / 250;
  const line = (x1: number, y1: number, x2: number, y2: number, color: string) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={stroke} />
  );
  return (
    <svg
      viewBox={`0 0 ${photo.width} ${photo.height}`}
      className="h-[240px] w-[240px] shrink-0 rounded bg-muted"
      preserveAspectRatio="xMidYMid meet"
    >
      <image href={photo.url} width={photo.width} height={photo.height} />
      <rect
        x={sx}
        y={sy}
        width={side}
        height={side}
        fill="none"
        stroke="#9885FF"
        strokeWidth={stroke * 1.5}
      />
      {face && (
        <>
          {line(face.headX, sy, face.headX, sy + side, "cyan")}
          {face.hairTop !== null && line(sx, face.hairTop, sx + side, face.hairTop, "yellow")}
          {line(sx, face.eyes.y + H / 2, sx + side, face.eyes.y + H / 2, "orange")}
          <circle cx={face.eyes.x} cy={face.eyes.y} r={stroke * 2} fill="red" />
          {face.torsoX !== null && (
            <circle cx={face.torsoX} cy={face.eyes.y + H} r={stroke * 3} fill="lime" />
          )}
        </>
      )}
    </svg>
  );
}

/** The badge photo: the square as it goes on the card. */
function Crop({ photo, crop }: { photo: BadgePhoto; crop: PhotoCrop }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.src = photo.url;
    img.onload = () => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      const { sx, sy, side } = cropRect(photo, crop);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 320, 320);
    };
  }, [photo, crop]);
  return <canvas ref={canvas} width={320} height={320} className="h-40 w-40 rounded" />;
}
