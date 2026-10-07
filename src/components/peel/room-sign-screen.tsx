"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { InputField, InputGroup } from "@/components/ui/input-group";
import type { Decal } from "@/data/decals";
import {
  ROOM_SIGN,
  defaultRoomSignFilm,
  layoutRoomSign,
  loadRoomFont,
  parseRooms,
  roomLabel,
  roomSignFilms,
  fitRoomsInput,
  typeableRooms,
  type RoomFont,
  type RoomSignFilm,
} from "@/lib/room-sign";
import { formatLengthWithUnits, formatSize } from "@/lib/units";
import { DetailsTable, SizeValue } from "./decal-details";
import { DecalPreview, type PreviewPage } from "./decal-preview";
import { DownloadIsland, IslandRow, type ExportMode } from "./download-island";
import { ScreenLayout } from "./screen-layout";
import { useBuild } from "./use-build";
import { useUnits } from "./units-menu";

// Meeting room sign: room names in, a cut-only PDF out — a page per room. The
// name fits itself (src/lib/room-sign.ts); the film's color is for the preview
// and the file name, the cut is the same.

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

export function RoomSignBody({
  decal,
  input,
  onInputChange,
  film,
  onFilmChange,
  mode,
  onModeChange,
  header,
}: {
  decal: Decal;
  input: string;
  onInputChange: (value: string) => void;
  /** Stored as the decal's variant; none — the default */
  film?: string;
  onFilmChange: (film: RoomSignFilm) => void;
  mode: ExportMode;
  onModeChange: (mode: ExportMode) => void;
  header: ReactNode;
}) {
  const build = useBuild();
  const units = useUnits();
  const font = useRoomFont();
  // The last change was cut: the name reached the longest that fits
  const [clipped, setClipped] = useState(false);
  const current = roomSignFilms.find((f) => f.id === film) ?? roomSignFilms.find((f) => f.id === defaultRoomSignFilm)!;
  const rooms = parseRooms(input);
  const count = rooms.length;
  const layouts = font ? rooms.map((r) => layoutRoomSign(r, font)) : [];
  const tooLong = rooms.filter((_, i) => layouts[i]?.tooLong);
  const canDownload = !!font && count > 0 && tooLong.length === 0;
  const mm = (v: number) => formatLengthWithUnits(v, units);

  const getPage = (i: number): PreviewPage => {
    const name = rooms[i] ?? EXAMPLE;
    const layout = font ? (layouts[i] ?? layoutRoomSign(name, font)) : null;
    return {
      label: count ? roomLabel(name) : "Example",
      widthMm: ROOM_SIGN.sheetMm,
      heightMm: ROOM_SIGN.sheetMm,
      sizeLabel: `Ø ${mm(ROOM_SIGN.diameterMm)}`,
      content: {
        type: "room",
        room: { layout, color: current.screen },
      },
    };
  };

  const error = tooLong.length
    ? `Too long to fit: ${tooLong.map(roomLabel).join(", ")}. Shorten it or break it with a /`
    : undefined;

  return (
    <ScreenLayout
      header={header}
      preview={<DecalPreview count={count} getPage={getPage} />}
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
            ["Material", current.material],
            ["Placement", decal.placement ?? "—"],
          ]}
        />
      }
      island={
        <DownloadIsland
          variant={
            <IslandRow label="Film">
              {/* Native borderless Select, as for the file format */}
              <Select
                value={current.id}
                onValueChange={(v) => {
                  build.reset();
                  onFilmChange(v as RoomSignFilm);
                }}
              >
                <SelectTrigger variant="borderless" className="min-w-0" />
                <SelectContent>
                  {roomSignFilms.map((f, i) => (
                    <SelectItem key={f.id} index={i} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </IslandRow>
          }
          quantity={
            <IslandRow label="Rooms">
              {/* CUSTOM: a visible border, as the Numbers field */}
              <InputGroup className="min-w-0 flex-1 [&_.ring-transparent]:ring-border">
                <InputField
                  index={0}
                  label="Rooms"
                  labelHidden
                  placeholder="Chevapi, Big Bend"
                  value={input}
                  onChange={(v) => {
                    build.reset();
                    if (!font) return onInputChange(v);
                    const fitted = fitRoomsInput(typeableRooms(v, font), font);
                    setClipped(fitted.clipped);
                    onInputChange(fitted.value);
                  }}
                  error={error}
                  spellCheck={false}
                  autoComplete="off"
                />
              </InputGroup>
            </IslandRow>
          }
          caption={
            clipped
              ? "That’s as long as a name fits. A / breaks the line by hand."
              : "Commas between rooms; a / breaks the line by hand. Latin letters only."
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
                  film: current.id,
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
