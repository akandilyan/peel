"use client";

// Dev only (*.dev.tsx, see next.config.ts): the ID badge auto framing run on
// the test portraits of scripts/portrait-samples.json, fetched into
// public/dev-portraits by scripts/fetch-portraits.mjs. A blind comparison: each
// card shows the badge photo of the current framing (faceCrop) and of the
// first one (eyes centered, chin to crown 60%, the eye line at 43%) as A and B
// in an order of their own; a vote shows which was which. Both get the same
// face, so it's the framing that's compared, not the detection. Votes stay in
// this browser (localStorage).

import { useEffect, useRef, useState } from "react";
import { detectFace } from "@/lib/face-detect";
import {
  MIN_DPI,
  PHOTO,
  clampCrop,
  cropRect,
  defaultCrop,
  faceCrop,
  framingIssue,
  headHeight,
  photoDpi,
  type BadgePhoto,
  type PhotoCrop,
  type PhotoFace,
} from "@/lib/id-badge";
import { withBase } from "@/lib/base-path";

type Sample = { id: string; kind: string; author: string };
type Result = {
  sample: Sample;
  photo: BadgePhoto;
  face: PhotoFace | null;
  /** The current framing */
  crop: PhotoCrop;
  /** The first framing, for the comparison */
  original: PhotoCrop;
  issue: ReturnType<typeof framingIssue>;
  ms: number;
};
type Vote = "new" | "original" | "same";
/** A vote with the new framing it was cast on: a framing changed since
 *  makes it stale */
type Ballot = { vote: Vote; crop: PhotoCrop };

const VOTES = "peel:portrait-votes";

/** The first auto framing: the eyes centered across, chin to crown 60% of the
 *  square, the eye line at 43% from its top. */
function originalCrop(photo: BadgePhoto, face: PhotoFace): PhotoCrop {
  const minSide = (PHOTO.sizeMm / 25.4) * MIN_DPI;
  const side = Math.max(headHeight(face) / 0.6, minSide);
  return clampCrop(photo, {
    zoom: Math.min(photo.width, photo.height) / side,
    x: face.eyes.x / photo.width,
    y: (face.eyes.y + (0.5 - 0.43) * side) / photo.height,
  });
}

/** The two framings give the same square */
const sameCrop = (a: PhotoCrop, b: PhotoCrop) =>
  Math.abs(a.zoom - b.zoom) < 0.02 && Math.abs(a.x - b.x) < 0.005 && Math.abs(a.y - b.y) < 0.005;

/** Which framing is A: fixed per photo, not always the same one */
const newIsA = (id: string) => [...id].reduce((h, c) => h + c.charCodeAt(0), 0) % 2 === 0;

function readVotes(): Record<string, Ballot> {
  try {
    return JSON.parse(localStorage.getItem(VOTES) ?? "{}");
  } catch {
    return {};
  }
}

export default function PortraitLab() {
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [votes, setVotes] = useState<Record<string, Ballot>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const samples: Sample[] = await (
        await fetch(withBase("/dev-portraits/manifest.json"))
      ).json();
      setTotal(samples.length);
      // After the first render: the server-rendered page has no votes
      setVotes(readVotes());
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
          original: face ? originalCrop(photo, face) : defaultCrop(photo),
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
    Object.assign(window, { portraitResults: results, portraitVotes: votes });
  }, [results, votes]);

  const vote = (r: Result, v: Vote | null) => {
    const next = { ...votes };
    if (v) next[r.sample.id] = { vote: v, crop: r.crop };
    else delete next[r.sample.id];
    setVotes(next);
    try {
      localStorage.setItem(VOTES, JSON.stringify(next));
    } catch {}
  };

  // The vote on the framing as it is now; one cast on an earlier one is stale
  const current = (r: Result) => {
    const b = votes[r.sample.id];
    return b?.crop && sameCrop(b.crop, r.crop) ? b.vote : null;
  };
  const compared = results.filter((r) => r.face && !sameCrop(r.crop, r.original));
  const tally = { new: 0, original: 0, same: 0 };
  for (const r of compared) {
    const v = current(r);
    if (v) tally[v]++;
  }
  const voted = tally.new + tally.original + tally.same;

  return (
    <main className="mx-auto max-w-[1400px] p-6">
      <h1 className="mb-1 text-2xl font-semibold">Auto framing: original vs new</h1>
      <p className="mb-2 text-sm text-muted-foreground">
        {results.length} of {total} photos · {compared.length} framed differently · pick the better
        badge photo, A or B; a vote shows which is which
      </p>
      <p className="mb-6 text-sm">
        Voted {voted} of {compared.length}
        {voted > 0 && (
          <>
            {" "}
            · new better: <b>{tally.new}</b> · original better: <b>{tally.original}</b> · same:{" "}
            <b>{tally.same}</b>
          </>
        )}
        {voted > 0 && (
          <button
            className="ml-3 text-xs text-muted-foreground underline"
            onClick={() => {
              setVotes({});
              try {
                localStorage.removeItem(VOTES);
              } catch {}
            }}
          >
            Reset votes
          </button>
        )}
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(620px,1fr))] gap-4">
        {results.map((r) => (
          <Card
            key={r.sample.id}
            result={r}
            vote={current(r)}
            stale={r.sample.id in votes && current(r) === null}
            onVote={(v) => vote(r, v)}
          />
        ))}
      </div>
    </main>
  );
}

function Card({
  result,
  vote,
  stale,
  onVote,
}: {
  result: Result;
  vote: Vote | null;
  /** Voted on an earlier framing: vote again */
  stale: boolean;
  onVote: (v: Vote | null) => void;
}) {
  const { sample, photo, face, crop, original, issue, ms } = result;
  const identical = !face || sameCrop(crop, original);
  const aIsNew = newIsA(sample.id);
  const [a, b] = aIsNew ? [crop, original] : [original, crop];
  const shown = identical || vote !== null;
  const name = (isNew: boolean) => (isNew ? "New" : "Original");
  const pick = (side: "a" | "b" | "same") =>
    onVote(side === "same" ? "same" : (side === "a") === aIsNew ? "new" : "original");
  const picked =
    vote === "same" ? "same" : vote === null ? null : (vote === "new") === aIsNew ? "a" : "b";

  const rows: [string, string][] = [
    ["Face", face ? "found" : "none — default framing"],
    ["Issue", issue ?? "—"],
    ["Hair top", face ? (face.hairTop === null ? "guessed" : "silhouette") : "—"],
    ["Shoulders", face ? (face.torsoX === null ? "not found" : "silhouette") : "—"],
    [
      "Zoom",
      shown
        ? `new ${Math.round(crop.zoom * 100)}% · original ${Math.round(original.zoom * 100)}%`
        : "after the vote",
    ],
    ["Print", `${Math.round(photoDpi(photo, crop))} dpi (new)`],
    ["Photo", `${photo.width} × ${photo.height} px · ${ms} ms`],
  ];

  return (
    <section className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {sample.kind}
          {stale && !identical && (
            <span className="ml-2 text-xs font-normal text-amber-500">changed since your vote</span>
          )}
        </h2>
        <span className="truncate text-xs text-muted-foreground">
          {sample.id} · {sample.author}
        </span>
      </div>
      <div className="flex gap-3">
        <Annotated result={result} a={a} b={b} />
        {(["a", "b"] as const).map((side) => {
          const c = side === "a" ? a : b;
          const isNew = (side === "a") === aIsNew;
          return (
            <div key={side} className="flex flex-col items-center gap-1">
              <Crop photo={photo} crop={c} selected={picked === side} />
              <span className="text-xs">
                {side.toUpperCase()}
                {shown && !identical && <span className="text-muted-foreground"> · {name(isNew)}</span>}
              </span>
              {!identical && (
                <button
                  className={`rounded px-2 py-0.5 text-xs ${picked === side ? "bg-foreground text-background" : "bg-muted"}`}
                  onClick={() => (picked === side ? onVote(null) : pick(side))}
                >
                  {side.toUpperCase()} is better
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {identical ? (
          <span className="text-xs text-muted-foreground">
            {face ? "Both framings give the same square" : "No face: both use the default"}
          </span>
        ) : (
          <div className="flex gap-2">
            <button
              className={`rounded px-2 py-0.5 text-xs ${picked === "same" ? "bg-foreground text-background" : "bg-muted"}`}
              onClick={() => pick("same")}
            >
              Same
            </button>
            {vote && (
              <button className="text-xs text-muted-foreground underline" onClick={() => onVote(null)}>
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** The photo with the detector's marks and both squares (A solid, B dashed). */
function Annotated({ result, a, b }: { result: Result; a: PhotoCrop; b: PhotoCrop }) {
  const { photo, face } = result;
  const H = face ? headHeight(face) : 0;
  const stroke = Math.max(photo.width, photo.height) / 250;
  const line = (x1: number, y1: number, x2: number, y2: number, color: string) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={stroke} />
  );
  const square = (c: PhotoCrop, dashed: boolean) => {
    const { sx, sy, side } = cropRect(photo, c);
    return (
      <rect
        x={sx}
        y={sy}
        width={side}
        height={side}
        fill="none"
        stroke="#9885FF"
        strokeWidth={stroke * 1.5}
        strokeDasharray={dashed ? `${stroke * 4} ${stroke * 3}` : undefined}
      />
    );
  };
  return (
    <svg
      viewBox={`0 0 ${photo.width} ${photo.height}`}
      className="h-[200px] w-[200px] shrink-0 rounded bg-muted"
      preserveAspectRatio="xMidYMid meet"
    >
      <image href={photo.url} width={photo.width} height={photo.height} />
      {square(a, false)}
      {square(b, true)}
      {face && (
        <>
          {line(face.headX, 0, face.headX, photo.height, "cyan")}
          {face.hairTop !== null && line(0, face.hairTop, photo.width, face.hairTop, "yellow")}
          {line(0, face.eyes.y + H / 2, photo.width, face.eyes.y + H / 2, "orange")}
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
function Crop({
  photo,
  crop,
  selected,
}: {
  photo: BadgePhoto;
  crop: PhotoCrop;
  selected: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.src = photo.url;
    img.onload = () => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      const { sx, sy, side } = cropRect(photo, crop);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, 360, 360);
    };
  }, [photo, crop]);
  return (
    <canvas
      ref={canvas}
      width={360}
      height={360}
      className={`h-[180px] w-[180px] rounded ${selected ? "outline outline-2 outline-offset-2 outline-foreground" : ""}`}
    />
  );
}
