"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Decal } from "@/data/decals";
import {
  ROOM_SIGN,
  ROOM_SIGN_FILMS,
  layoutRoomSign,
  loadRoomFont,
  parseRooms,
  roomLabel,
  fitRoomName,
  typeableRoom,
  type RoomFont,
} from "@/lib/room-sign";
import { letterOutlines, loadCutScope, type CutScope } from "@/lib/room-sign-cut";
import { formatLengthWithUnits, formatSize } from "@/lib/units";
import { DetailsTable, SizeValue } from "./decal-details";
import { DecalPreview, type PreviewPage } from "./decal-preview";
import { DownloadIsland, type ExportMode } from "./download-island";
import { RoomList } from "./room-list";
import { ScreenLayout } from "./screen-layout";
import { useBuild } from "./use-build";
import { useUnits } from "./units-menu";

// Meeting room sign: room names in, a cut-only PDF out — a page per room. The
// name fits itself (src/lib/room-sign.ts); the preview is the cut line, as the
// PDF's. One file for white or black film: the film is picked when ordering.

// Shown until a room is typed: plainly a stand-in, as "Text" in the designer's
// template, not a room that looks already typed
const EXAMPLE = "Room name";

/** The sign's font: 400 KB, loaded with the page */
function useRoomFont(): RoomFont | null {
  const [font, setFont] = useState<RoomFont | null>(null);
  useEffect(() => {
    let alive = true;
    void loadRoomFont().then((f) => alive && setFont(f));
    return () => {
      alive = false;
    };
  }, []);
  return font;
}

/** paper.js for the letters' merged cut line, loaded after the page */
function useCutScope(): CutScope | null {
  const [scope, setScope] = useState<CutScope | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCutScope().then((s) => alive && setScope(s));
    return () => {
      alive = false;
    };
  }, []);
  return scope;
}

export function RoomSignBody({
  decal,
  input,
  onInputChange,
  mode,
  onModeChange,
  header,
}: {
  decal: Decal;
  input: string;
  onInputChange: (value: string) => void;
  mode: ExportMode;
  onModeChange: (mode: ExportMode) => void;
  header: ReactNode;
}) {
  const build = useBuild();
  const units = useUnits();
  const font = useRoomFont();
  // The field whose last change was cut: the name reached the longest that fits
  const [clippedAt, setClippedAt] = useState<number | null>(null);
  // One field per room, stored as lines; at least one (the placeholder)
  const fields = input ? input.split("\n") : [""];
  // The room shown in the preview: the focused field's once it has a name,
  // else the one paged to
  const [focused, setFocused] = useState<number | null>(null);
  const [paged, setPaged] = useState(0);
  const shown =
    focused !== null && parseRooms(fields[focused] ?? "").length
      ? parseRooms(fields.slice(0, focused).join("\n")).length
      : paged;
  const scope = useCutScope();
  // Merged letter outlines by room name: worked out once per name
  const outlines = useRef(new Map<string, string[]>());
  const rooms = parseRooms(input);
  const count = rooms.length;
  const layouts = font ? rooms.map((r) => layoutRoomSign(r, font)) : [];
  const tooLong = rooms.filter((_, i) => layouts[i]?.tooLong);
  const canDownload = !!font && count > 0 && tooLong.length === 0;
  const mm = (v: number) => formatLengthWithUnits(v, units);

  const getPage = (i: number): PreviewPage => {
    const name = rooms[i] ?? EXAMPLE;
    const layout = font ? (layouts[i] ?? layoutRoomSign(name, font)) : null;
    let letters: string[] | undefined;
    if (layout && scope) {
      letters = outlines.current.get(name);
      if (!letters) {
        letters = letterOutlines(layout, scope);
        outlines.current.set(name, letters);
      }
    }
    return {
      label: count ? roomLabel(name) : "Example",
      widthMm: ROOM_SIGN.sheetMm,
      heightMm: ROOM_SIGN.sheetMm,
      sizeLabel: `Ø ${mm(ROOM_SIGN.diameterMm)}`,
      content: {
        type: "room",
        room: { layout, letters },
      },
    };
  };

  return (
    <ScreenLayout
      header={header}
      preview={
        <DecalPreview
          count={count}
          getPage={getPage}
          index={shown}
          onIndexChange={(i) => {
            setPaged(i);
            setFocused(null);
          }}
        />
      }
      details={
        <DetailsTable
          rows={[
            [
              "Size",
              <SizeValue
                key="size"
                main={`Ø ${mm(ROOM_SIGN.diameterMm)}`}
                sub={`Ring ${mm(Math.round(ROOM_SIGN.ringMm * 10) / 10)} · Sheet ${formatSize(ROOM_SIGN.sheetMm, ROOM_SIGN.sheetMm, units)}`}
              />,
            ],
            ["Production", "Cut from film, nothing printed"],
            // The same cut file for either: the film is picked when ordering
            ["Material", ROOM_SIGN_FILMS],
            ["Placement", decal.placement ?? "—"],
          ]}
        />
      }
      island={
        <DownloadIsland
          quantity={
            <RoomList
              fields={fields}
              onFieldsChange={(next) => {
                build.reset();
                let cut: number | null = null;
                const fitted = next.map((f, i) => {
                  if (!font) return f;
                  const r = fitRoomName(typeableRoom(f, font), font);
                  if (r.clipped) cut = i;
                  return r.value;
                });
                setClippedAt(cut);
                onInputChange(fitted.length === 1 && !fitted[0] ? "" : fitted.join("\n"));
              }}
              onFocusField={(i) => {
                // An empty field keeps showing the room before it
                setPaged(shown);
                setFocused(i);
              }}
            />
          }
          // In the caption, not under the field: there it can scroll out of view
          caption={
            clippedAt === null
              ? "A / breaks the line by hand. Latin letters only."
              : "That’s as long as a name fits. A / breaks the line by hand."
          }
          items={count}
          mode={mode}
          onModeChange={(m) => {
            build.reset();
            onModeChange(m);
          }}
          disabled={!canDownload}
          build={build}
          onDownload={() =>
            void build.start({
              kind: "generate",
              total: count,
              run: async (onProgress, isCancelled) => {
                const { exportRoomSigns } = await import("@/lib/room-sign-pdf");
                return exportRoomSigns({
                  id: decal.id,
                  rooms,
                  font: font!,
                  mode: count > 1 ? mode : "pdf",
                  onProgress,
                  isCancelled,
                });
              },
            })
          }
        />
      }
    />
  );
}
