"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TabsSubtle, TabsSubtleItem } from "@/components/ui/tabs-subtle";
import {
  BADGE,
  MAX_ZOOM,
  badgeStyles,
  nameZone,
  photoRect,
  clampCrop,
  cropRect,
  exampleName,
  inputIndex,
  layoutNameLines,
  namePlaceholder,
  printedIndex,
  printedText,
  typeableText,
  type BadgeField,
  type BadgeName,
  type BadgePhoto,
  type BadgeStyle,
  type PhotoCrop,
} from "@/lib/id-badge";
import { drawBadge, type BadgeDrawing } from "@/lib/id-badge-canvas";
import { Slider } from "@/components/ui/slider";
import { withBase } from "@/lib/base-path";
import type { CardPoint, CardScene, CardSpec } from "./business-card-3d";
import { BACKDROP } from "./business-card-preview";
import { newSpin, sideAt, yawFor } from "./business-card-spin";

// ID badge preview, the business card's 3D card on native Fluid parts (CardGroup /
// Card on the brand backdrop, title and size in the header, controls in the
// footer: the template versions as TabsSubtle in the middle, as the business
// card's Front / Back, the zoom slider left of them and the photo buttons right).
// CUSTOM: the badge is edited right on the card, by zones found with a
// raycast, so it works at any angle:
// - a drag anywhere turns the card;
// - the photo: a click, zooming (pinch — ctrl + wheel — or the footer slider) or
//   a new photo starts framing: a drag moves the photo until a click off it or
//   Esc; empty — click to pick a file; a file dropped on the stage replaces it;
// - the name: click and type — the input is hidden, the caret and selection are
//   drawn in the card texture; Enter or ↓ goes to the last name; a character
//   the badge can't print is dropped and the card shakes "no".
// While something is edited the card stops swaying and tilting. The card fades
// in once three.js has loaded and drawn it; without WebGL the same drawing is a
// flat canvas.

/** Stand-in photo: an abstracted, striped portrait, 600 px. */
const EXAMPLE_PHOTO = "/id-badge/example-photo.png";

/** ISO/IEC 7810 ID-1 corners. */
const CORNER_MM = 3.18;

const BADGE_CARD: CardSpec = {
  widthMm: BADGE.widthMm,
  heightMm: BADGE.heightMm,
  // CR80 is 30 mil
  depthMm: 0.76,
  cornerMm: CORNER_MM,
  // PVC with the printer's clear overlay: a soft gloss
  roughness: [0.6, 0.6],
  edgeColor: "#f5f5f5",
  envMapIntensity: 0.3,
  sameSides: true,
  framing: 1.18,
};

const STYLES = Object.keys(badgeStyles) as BadgeStyle[];

const FIELDS: { key: BadgeField; label: string; autoComplete: string }[] = [
  { key: "first", label: "First name", autoComplete: "given-name" },
  { key: "last", label: "Last name", autoComplete: "family-name" },
];

const MAX_PITCH = 0.5;
const FLICK = 0.12;
/** Pointer travel that turns a click into a drag, px. */
const CLICK_SLOP = 4;
const BLINK_MS = 530;
/** Arrow keys move the photo by this share of the square. */
const KEY_STEP = 0.02;

type Zone = "photo" | "name" | "card" | "none";

const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
/** Which zone of the card a point is in; the photo and name move with the style. */
function zoneOf(p: CardPoint | null, style: BadgeStyle): Zone {
  if (!p) return "none";
  const photo = photoRect(style);
  const name = nameZone(style);
  if (photo && inside(p, { x: photo.x, y: photo.y, w: photo.sizeMm, h: photo.sizeMm }))
    return "photo";
  if (inside(p, { x: name.x, y: name.y, w: name.width, h: name.height })) return "name";
  return "card";
}

let webgl: boolean | undefined;
const noSubscribe = () => () => {};
function webglAvailable(): boolean {
  if (webgl === undefined) {
    try {
      webgl = Boolean(document.createElement("canvas").getContext("webgl2"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function IdBadgePreview({
  label,
  sizeLabel,
  style,
  onStyleChange,
  name,
  onNameChange,
  photo,
  crop,
  onCropChange,
  onFile,
  onRejected,
  footerEnd,
}: {
  label: string;
  sizeLabel: string;
  style: BadgeStyle;
  onStyleChange: (style: BadgeStyle) => void;
  name: BadgeName;
  onNameChange: (name: BadgeName) => void;
  /** None on a style without a photo */
  photo: BadgePhoto | null;
  crop: PhotoCrop;
  onCropChange: (crop: PhotoCrop) => void;
  /** A file picked in the empty square or dropped on the stage */
  onFile: (file: File) => void;
  /** Typed characters the badge can't print were dropped (or not) */
  onRejected: (rejected: boolean) => void;
  /** Photo buttons, right of the zoom slider */
  footerEnd?: ReactNode;
}) {
  const hasWebgl = useSyncExternalStore(noSubscribe, webglAvailable, () => null);
  const reducedMotion = useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
  const [ready, setReady] = useState(false);
  const spin = useRef(newSpin());
  const sceneEl = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const flat = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CardScene | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputs = useRef<Record<BadgeField, HTMLInputElement | null>>({ first: null, last: null });

  // Editing state: the focused name field and its selection (input indexes)
  const [focus, setFocus] = useState<BadgeField | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [caretOn, setCaretOn] = useState(true);
  const [dropTarget, setDropTarget] = useState(false);
  const [framing, setFraming] = useState(false);
  // A new photo starts framing at once: it usually needs moving and zooming
  const [framedUrl, setFramedUrl] = useState(photo?.url);
  if (photo?.url !== framedUrl) {
    setFramedUrl(photo?.url);
    setFraming(Boolean(photo));
  }
  const root = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState("default");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [example, setExample] = useState<HTMLImageElement | null>(null);

  // The example photo, until a photo is added
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = withBase(EXAMPLE_PHOTO);
    void img.decode().then(
      () => !cancelled && setExample(img),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // The photo as an image element for the canvas
  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    const img = new Image();
    img.src = photo.url;
    void img.decode().then(
      () => !cancelled && setImage(img),
      () => {},
    );
    return () => {
      cancelled = true;
      setImage(null);
    };
  }, [photo]);

  // The caret blinks while a field has focus; a change shows it at once
  // (syncSelection) and restarts the blink
  useEffect(() => {
    if (!focus) return;
    const t = setInterval(() => setCaretOn((v) => !v), BLINK_MS);
    return () => clearInterval(t);
  }, [focus, selection, name]);

  // Name lines as shown: the example until something is entered; while typing,
  // both lines with placeholders in the empty ones; otherwise as printed
  const editing = focus !== null;
  const empty = !printedText(name.first, style) && !printedText(name.last, style);
  const specs =
    !editing && empty
      ? FIELDS.map((f) => ({ field: f.key, text: exampleName[f.key], hint: true }))
      : FIELDS.filter((f) => f.key === "first" || editing || printedText(name.last, style)).map(
          (f) =>
            printedText(name[f.key], style)
              ? { field: f.key, text: name[f.key] }
              : { field: f.key, text: namePlaceholder[f.key], hint: true },
        );
  const layout = layoutNameLines(specs, style);
  const caretLine = focus ? layout.lines.findIndex((l) => l.field === focus) : -1;
  const drawing: BadgeDrawing = {
    style,
    name: layout,
    photo: photo && image ? { image, photo, crop } : null,
    example,
    caret:
      focus && caretLine >= 0
        ? {
            line: caretLine,
            start: printedIndex(name[focus], Math.min(selection.start, selection.end), style),
            end: printedIndex(name[focus], Math.max(selection.start, selection.end), style),
            visible: caretOn,
          }
        : null,
    dropTarget,
    framing: framing && Boolean(photo),
  };
  // ─── Picking ───────────────────────────────────────────────────────────────

  const pick = (clientX: number, clientY: number): CardPoint | null => {
    if (ready && scene.current) return scene.current.pick(clientX, clientY);
    const rect = flat.current?.getBoundingClientRect();
    if (!rect?.width) return null;
    const p = {
      side: "front" as const,
      x: ((clientX - rect.left) / rect.width) * BADGE.widthMm,
      y: ((clientY - rect.top) / rect.height) * BADGE.heightMm,
    };
    return inside(p, { x: 0, y: 0, w: BADGE.widthMm, h: BADGE.heightMm }) ? p : null;
  };
  const latest = useRef({
    drawing,
    photo,
    crop,
    onCropChange,
    name,
    style,
    pick: (() => null) as (x: number, y: number) => CardPoint | null,
  });
  useLayoutEffect(() => {
    latest.current = { drawing, photo, crop, onCropChange, name, style, pick };
  });

  // The 3D scene: three.js is fetched on demand, created once per mount
  useEffect(() => {
    if (!hasWebgl || !sceneEl.current) return;
    let cancelled = false;
    const el = sceneEl.current;
    void import("./business-card-3d").then(({ createCardScene }) => {
      if (cancelled) return;
      const s = createCardScene(el, spin.current, {
        card: BADGE_CARD,
        onSide: () => {},
        onReady: () => setReady(true),
      });
      s.setRounded(true);
      s.drawSides((ctx) => drawBadge(ctx, latest.current.drawing));
      scene.current = s;
    });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [hasWebgl]);
  useEffect(() => {
    scene.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion, ready]);


  // Redraw on every change: the 3D texture (next frame) and the flat canvas,
  // before paint so the flat card never shows blank
  useLayoutEffect(() => {
    scene.current?.drawSides((ctx) => drawBadge(ctx, drawing));
    const canvas = flat.current;
    if (!canvas || ready) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(canvas.width / BADGE.widthMm, 0, 0, canvas.height / BADGE.heightMm, 0, 0);
    drawBadge(ctx, drawing);
  });

  const interactive = hasWebgl === true && ready;

  // ─── Name ──────────────────────────────────────────────────────────────────

  const focusField = (field: BadgeField, caret: number) => {
    const el = inputs.current[field];
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(caret, caret);
    syncSelection(el);
  };
  /** A click in the name block: the line under it, the caret nearest to it. */
  const focusNameAt = (p: CardPoint) => {
    const lines = layout.lines;
    const line =
      lines.find((l) => p.y >= l.top && p.y <= l.bottom) ??
      (p.y > lines[lines.length - 1].bottom ? undefined : lines[0]);
    const field: BadgeField = line?.field ?? "last";
    const value = name[field];
    let caret = value.length;
    if (line && !line.hint) {
      let best = 0;
      line.stops.forEach((x, i) => {
        if (Math.abs(x - p.x) < Math.abs(line.stops[best] - p.x)) best = i;
      });
      caret = inputIndex(value, best, style);
    }
    focusField(field, caret);
  };
  const onFieldKeyDown = (field: BadgeField, e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    if (field === "first" && (e.key === "Enter" || e.key === "ArrowDown")) {
      e.preventDefault();
      focusField("last", name.last.length);
    } else if (field === "last" && (e.key === "ArrowUp" || (e.key === "Backspace" && atStart))) {
      e.preventDefault();
      focusField("first", name.first.length);
    } else if (e.key === "Enter" || e.key === "Escape") {
      el.blur();
    }
  };
  const syncSelection = (el: HTMLInputElement) => {
    setSelection({ start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 });
    setCaretOn(true);
  };

  // ─── Pointer ───────────────────────────────────────────────────────────────

  // Framing: a click on the photo, zooming it or a new photo starts it — the
  // photo gets an outline and a drag moves the photo instead of turning the
  // card. A click off the photo, Esc or a click outside the preview ends it.
  const startFraming = () => setFraming(true);
  const stopFraming = () => setFraming(false);
  // While something on the card is edited it faces the camera and holds still
  useEffect(() => {
    const s = spin.current;
    s.hold = (framing && photo !== null) || focus !== null;
    if (!s.hold) return;
    s.targetYaw = yawFor(sideAt(s.targetYaw), s.targetYaw);
    s.targetPitch = 0;
  }, [framing, focus, photo]);
  useEffect(() => {
    if (!framing) return;
    // The zoom slider and the photo buttons are inside: they keep framing
    const onDown = (e: globalThis.PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) stopFraming();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  });

  const gesture = useRef<{
    /** pending — a click or, once the pointer travels, a turn */
    mode: "pending" | "turn" | "photo" | null;
    zone: Zone;
    x: number;
    y: number;
    t: number;
    velocity: number;
    moved: boolean;
    last: CardPoint | null;
  }>({ mode: null, zone: "none", x: 0, y: 0, t: 0, velocity: 0, moved: false, last: null });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = pick(e.clientX, e.clientY);
    const zone = zoneOf(p, style);
    const g = gesture.current;
    Object.assign(g, { zone, x: e.clientX, y: e.clientY, t: e.timeStamp, velocity: 0, moved: false, last: p });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (framing && zone === "photo" && photo) {
      g.mode = "photo";
      return;
    }
    stopFraming();
    // Keep the focus in the name: a click there moves the caret instead
    if (zone === "name") e.preventDefault();
    g.mode = "pending";
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = spin.current;
    const g = gesture.current;
    const rect = e.currentTarget.getBoundingClientRect();
    s.hover =
      e.pointerType === "mouse"
        ? {
            x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
            y: ((e.clientY - rect.top) / rect.height) * 2 - 1,
          }
        : null;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > CLICK_SLOP) g.moved = true;

    if (g.mode === "photo" && photo) {
      const p = pick(e.clientX, e.clientY);
      const rect = photoRect(style);
      if (p && g.last && rect) {
        // The photo follows the pointer on the card: card mm → photo pixels
        const k = cropRect(photo, crop).side / rect.sizeMm;
        onCropChange(
          clampCrop(photo, {
            ...crop,
            x: crop.x - ((p.x - g.last.x) * k) / photo.width,
            y: crop.y - ((p.y - g.last.y) * k) / photo.height,
          }),
        );
      }
      g.last = p;
      return;
    }
    // A drag anywhere on the stage, the photo and the name too, turns the card
    if (g.mode === "pending" && g.moved && interactive) {
      g.mode = "turn";
      s.dragging = true;
      setCursor("grabbing");
    }
    if (g.mode === "turn") {
      // Dragging across the whole stage turns the card by about 200°
      const dYaw = ((e.clientX - g.x) / rect.width) * Math.PI * 1.1;
      s.targetYaw += dYaw;
      if (e.pointerType === "mouse")
        s.targetPitch = Math.max(
          -MAX_PITCH,
          Math.min(MAX_PITCH, s.targetPitch + ((e.clientY - g.y) / rect.width) * Math.PI),
        );
      g.velocity = dYaw / (Math.max(1, e.timeStamp - g.t) / 1000);
      g.x = e.clientX;
      g.y = e.clientY;
      g.t = e.timeStamp;
      return;
    }
    if (g.mode) return;
    // Hover: the cursor tells what a click will do; a drag always turns
    const zone = zoneOf(pick(e.clientX, e.clientY), style);
    setCursor(
      zone === "name"
        ? "text"
        : zone === "photo"
          ? framing && photo
            ? "move"
            : "pointer"
          : interactive
            ? "grab"
            : "default",
    );
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = spin.current;
    const g = gesture.current;
    const mode = g.mode;
    g.mode = null;
    if (mode === "pending" && !g.moved) {
      if (g.zone === "name" && g.last) focusNameAt(g.last);
      else if (g.zone === "photo") {
        if (photo) startFraming();
        else fileInput.current?.click();
      }
    } else if (mode === "turn") {
      s.dragging = false;
      setCursor("grab");
      // A pause before release means no flick
      const velocity = e.timeStamp - g.t > 80 ? 0 : g.velocity;
      const projected = s.targetYaw + velocity * FLICK;
      s.targetYaw = yawFor(sideAt(projected), projected);
      s.targetPitch = 0;
    }
  };

  // Pinch on a trackpad (and ctrl + wheel) over the photo zooms around the
  // pointer: the point under it stays put. Plain wheel scrolls the page.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { photo: p, crop: c, onCropChange: change, style: st } = latest.current;
      if (!p || !e.ctrlKey) return;
      const at = latest.current.pick(e.clientX, e.clientY);
      const PHOTO = photoRect(st);
      if (zoneOf(at, st) !== "photo" || !at || !PHOTO) return;
      e.preventDefault();
      setFraming(true);
      const u = (at.x - PHOTO.x) / PHOTO.sizeMm - 0.5;
      const v = (at.y - PHOTO.y) / PHOTO.sizeMm - 0.5;
      const zoom = Math.min(MAX_ZOOM, Math.max(1, c.zoom * Math.exp(-e.deltaY * 0.01)));
      const before = cropRect(p, c).side;
      const after = before * (c.zoom / zoom);
      change(
        clampCrop(p, {
          zoom,
          x: c.x + (u * (before - after)) / p.width,
          y: c.y + (v * (before - after)) / p.height,
        }),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard on the stage: arrows move the photo, + / − zoom
  const onStageKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Escape") stopFraming();
    if (!photo) return;
    const step = KEY_STEP * cropRect(photo, crop).side * (e.shiftKey ? 5 : 1);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    let next: PhotoCrop | null = null;
    if (moves[e.key]) {
      const [dx, dy] = moves[e.key];
      next = { ...crop, x: crop.x + dx / photo.width, y: crop.y + dy / photo.height };
    } else if (e.key === "+" || e.key === "=") next = { ...crop, zoom: crop.zoom * 1.1 };
    else if (e.key === "-") next = { ...crop, zoom: crop.zoom / 1.1 };
    if (!next) return;
    e.preventDefault();
    onCropChange(clampCrop(photo, next));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropTarget(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div ref={root} className="contents">
      <CardGroup
        fluidHover={false}
        className={`rounded-xl border border-transparent bg-origin-border ${BACKDROP}`}
      >
        <Card>
          <CardHeader>
            <div className="flex items-baseline justify-between gap-4">
              <CardTitle>{label}</CardTitle>
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {sizeLabel}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div
              ref={stage}
              tabIndex={0}
              aria-label={`ID badge preview. Drag to turn the card, click the name to type it${photo ? ", click the photo to frame it; arrow keys move it, + and − zoom" : photoRect(style) ? ", click the photo square to add a photo" : ""}.`}
              className="relative h-[400px] touch-none rounded-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-ring sm:h-[500px]"
              style={{ cursor }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => {
                spin.current.hover = null;
              }}
              onKeyDown={onStageKeyDown}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes("Files")) return;
                e.preventDefault();
                setDropTarget(true);
              }}
              onDragLeave={() => setDropTarget(false)}
              onDrop={onDrop}
            >
              {/* Flat card: only without WebGL. With it the stage stays empty
                  until the 3D card has drawn and then fades in — swapping a flat
                  card for the 3D one blinks (size, tilt and light differ). */}
              {hasWebgl === false && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <canvas
                    ref={flat}
                    className="h-[84.7%]"
                    style={{
                      aspectRatio: `${BADGE.widthMm} / ${BADGE.heightMm}`,
                      borderRadius: `${pct(CORNER_MM, BADGE.widthMm)} / ${pct(CORNER_MM, BADGE.heightMm)}`,
                    }}
                  />
                </div>
              )}
              <div
                ref={sceneEl}
                className={`absolute inset-0 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
              />
              {framing && photo && (
                <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12px] text-muted-foreground">
                  Drag to move the photo · Esc or click outside when done
                </p>
              )}
              {/* The name inputs: invisible, over the name block so the page
                  doesn't jump when a phone keyboard opens; 16 px keeps iOS from
                  zooming in */}
              <div
                className="pointer-events-none absolute inset-x-0 overflow-hidden opacity-0"
                style={{ top: "75%", height: "10%" }}
              >
                {FIELDS.map((f) => (
                  <input
                    key={f.key}
                    ref={(el) => {
                      inputs.current[f.key] = el;
                    }}
                    aria-label={f.label}
                    name={f.key}
                    autoComplete={f.autoComplete}
                    spellCheck={false}
                    className="absolute inset-x-0 top-0 text-[16px]"
                    value={name[f.key]}
                    onChange={(e) => {
                      // Characters the badge can't print never get in: taken
                      // out of the input right away, the caret stays in place
                      const el = e.target;
                      const value = typeableText(el.value, style);
                      const rejected = value !== el.value;
                      if (rejected) {
                        // The card shakes its head
                        spin.current.shakeAt = performance.now();
                        const caret =
                          typeableText(el.value.slice(0, el.selectionStart ?? el.value.length), style)
                            .length;
                        el.value = value;
                        el.setSelectionRange(caret, caret);
                      }
                      onRejected(rejected);
                      onNameChange({ ...latest.current.name, [f.key]: value });
                      syncSelection(el);
                    }}
                    onSelect={(e) => syncSelection(e.currentTarget)}
                    onFocus={(e) => {
                      setFocus(f.key);
                      syncSelection(e.currentTarget);
                    }}
                    onBlur={(e) => {
                      // Moving between the two lines keeps editing
                      const next = e.relatedTarget as HTMLElement | null;
                      if (next && Object.values(inputs.current).includes(next as HTMLInputElement))
                        return;
                      setFocus(null);
                    }}
                    onKeyDown={(e) => onFieldKeyDown(f.key, e)}
                  />
                ))}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          </CardContent>
          {/* The versions in the middle; with a photo, the zoom slider left of
              them and the photo buttons right (no photo yet — the empty square
              on the card takes a click or a dropped file). On a phone the tabs
              take their own row on top. */}
          <CardFooter className="grid grid-cols-2 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="min-w-0 justify-self-stretch">
              {/* Scrubber: pips at 5% steps would be 61 dots. Zooming starts
                  framing, so the next drag on the photo moves it. */}
              {photo && (
                <div className="max-w-[200px]">
                  <Slider
                    variant="scrubber"
                    label="Zoom"
                    value={crop.zoom}
                    min={1}
                    max={MAX_ZOOM}
                    step={0.05}
                    formatValue={(v) => `${Math.round(v * 100)}%`}
                    onChange={(v) => {
                      setFraming(true);
                      onCropChange(clampCrop(photo, { ...crop, zoom: v as number }));
                    }}
                  />
                </div>
              )}
            </div>
            <div className="order-first col-span-2 justify-self-center sm:order-none sm:col-span-1">
              <TabsSubtle
                selectedIndex={STYLES.indexOf(style)}
                onSelect={(i) => onStyleChange(STYLES[i])}
              >
                {STYLES.map((st, i) => (
                  <TabsSubtleItem key={st} index={i} label={badgeStyles[st].name} />
                ))}
              </TabsSubtle>
            </div>
            <div className="flex items-center gap-1 justify-self-end">
              {photo && footerEnd}
            </div>
          </CardFooter>
        </Card>
      </CardGroup>
    </div>
  );
}
