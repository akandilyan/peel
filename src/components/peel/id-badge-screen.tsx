"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, RotateCcw, ScanFace, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTypeScale } from "@/lib/size-context";
import type { Decal } from "@/data/decals";
import {
  BADGE,
  MIN_DPI,
  badgeFileName,
  badgeStyles,
  checkName,
  defaultCrop,
  defaultBadgeStyle,
  emptyName,
  faceCrop,
  fitField,
  photoDpi,
  photoRect,
  type BadgeName,
  type BadgePhoto,
  type BadgeStyle,
  type PhotoCrop,
  type PhotoFace,
} from "@/lib/id-badge";
import { exportIdBadge } from "@/lib/id-badge-pdf";
import { detectFace } from "@/lib/face-detect";
import { formatSize } from "@/lib/units";
import { DetailsTable, SizeValue } from "./decal-details";
import { DownloadIsland } from "./download-island";
import { IdBadgePreview } from "./id-badge-preview";
import { ScreenLayout } from "./screen-layout";
import { useBuild } from "./use-build";
import { useUnits } from "./units-menu";

// ID badge builder: everything is edited right on the 3D card — pick the
// version (Avride, HireArt, Visitor) in the tabs under it, type the name on it,
// drop and frame the photo (zoom and photo buttons in the toolbar over the
// stage while framing); Clear all under it, right of the tabs; the Download
// panel holds just the file. The visitor badge has no photo: one added for
// another version stays for when you switch back. The
// photo is an object URL: it stays in this browser, nothing is uploaded.

/** Badge state kept per decal in the app's memory store. */
export interface BadgeState {
  name: BadgeName;
  photo: BadgePhoto | null;
  crop: PhotoCrop;
  /** The face found on the photo, for Auto frame; null while looking or none */
  face: PhotoFace | null;
  style: BadgeStyle;
}

export const emptyBadge: BadgeState = {
  name: emptyName,
  photo: null,
  crop: { zoom: 1, x: 0.5, y: 0.5 },
  face: null,
  style: defaultBadgeStyle,
};

/** Reads an image file: its size as displayed (EXIF orientation applied). */
async function loadPhoto(file: File): Promise<BadgePhoto> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("unreadable");
  }
  return { url, width: img.naturalWidth, height: img.naturalHeight };
}

export function IdBadgeBody({
  decal,
  badge,
  onBadgeChange,
  header,
}: {
  decal: Decal;
  badge: BadgeState;
  onBadgeChange: (badge: BadgeState) => void;
  header: React.ReactNode;
}) {
  const build = useBuild();
  const units = useUnits();
  const type = useTypeScale();
  const [photoError, setPhotoError] = useState<string | null>(null);
  // The name hit the badge's width: the last keystroke or paste was cut
  const [nameFull, setNameFull] = useState(false);
  // The last keystroke or paste had characters the badge can't print
  const [nameRejected, setNameRejected] = useState(false);
  const { name, crop, style } = badge;
  const { errors, complete } = checkName(name, style);
  const needsPhoto = photoRect(style) !== null;
  // The photo on this version: none on the visitor badge
  const photo = needsPhoto ? badge.photo : null;

  // The badge as of the last render: face detection finishes after it
  const latest = useRef(badge);
  useEffect(() => {
    latest.current = badge;
  });

  const update = (next: Partial<BadgeState>) => {
    build.reset();
    // Ahead of the render: two updates in a row (a photo, then its face)
    // build on each other
    latest.current = { ...latest.current, ...next };
    onBadgeChange(latest.current);
  };

  const onFile = async (file: File) => {
    setPhotoError(null);
    let next: BadgePhoto;
    try {
      next = await loadPhoto(file);
    } catch {
      // HEIC opens only in Safari, RAW and PDF nowhere
      setPhotoError("Couldn't open this file. Use a JPEG or PNG photo.");
      return;
    }
    if (latest.current.photo) URL.revokeObjectURL(latest.current.photo.url);
    const initial = defaultCrop(next);
    update({ photo: next, crop: initial, face: null });
    // Then frame the face, unless the photo was framed or replaced meanwhile
    const face = await detectFace(next.url).catch(() => null);
    const now = latest.current;
    if (!face || now.photo !== next) return;
    update(now.crop === initial ? { face, crop: faceCrop(next, face) } : { face });
  };
  const removePhoto = () => {
    if (photo) URL.revokeObjectURL(photo.url);
    update({ photo: null, crop: emptyBadge.crop, face: null });
  };
  // Clear all: the name and the photo, the version stays
  const clearAll = () => {
    if (badge.photo) URL.revokeObjectURL(badge.photo.url);
    setNameFull(false);
    setNameRejected(false);
    setPhotoError(null);
    update({ ...emptyBadge, style });
  };
  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void onFile(file);
    };
    input.click();
  };

  const isExample = !name.first.trim() && !name.last.trim();
  const dpi = photo ? photoDpi(photo, crop) : 0;
  const autoCrop = photo && badge.face ? faceCrop(photo, badge.face) : null;
  const isAutoFramed =
    autoCrop !== null &&
    Math.abs(autoCrop.zoom - crop.zoom) < 1e-3 &&
    Math.abs(autoCrop.x - crop.x) < 1e-4 &&
    Math.abs(autoCrop.y - crop.y) < 1e-4;
  const fileName = badgeFileName(decal.id, style, name);

  const caption = (text: string, tone = "text-muted-foreground") => (
    <p className={tone} style={{ fontSize: type.caption }}>
      {text}
    </p>
  );

  return (
    <ScreenLayout
      header={header}
      preview={
        <div className="flex flex-col gap-2">
          <IdBadgePreview
            label={isExample && !photo ? "Example" : "Preview"}
            sizeLabel={formatSize(BADGE.widthMm, BADGE.heightMm, units, 2)}
            style={style}
            // A name that fits one version may not fit another: it stays, the
            // error under the preview tells
            onStyleChange={(st) => update({ style: st })}
            name={name}
            onNameChange={(n) => {
              // Fit the fields that changed, one after the other: typing
              // changes one, a pasted full name both
              let fitted = name;
              let cut = false;
              for (const field of ["first", "last"] as const) {
                if (n[field] === name[field]) continue;
                const value = fitField(fitted, field, n[field], style);
                cut ||= value !== n[field];
                fitted = { ...fitted, [field]: value };
              }
              setNameFull(cut);
              update({ name: fitted });
            }}
            photo={photo}
            crop={crop}
            onCropChange={(c) => update({ crop: c })}
            onFile={(f) => void onFile(f)}
            onRejected={setNameRejected}
            photoTools={
              // Ghost buttons, each with a short label to keep the toolbar
              // narrow; Auto frame is off once the framing is the auto one, and
              // not there with no face found to frame on.
              <>
                {autoCrop && (
                  <Button
                    variant="ghost"
                    size="compact"
                    leadingIcon={ScanFace}
                    aria-label="Auto frame"
                    disabled={isAutoFramed}
                    onClick={() => update({ crop: autoCrop })}
                  >
                    Auto
                  </Button>
                )}
                <Button variant="ghost" size="compact" leadingIcon={RefreshCw} onClick={pickFile}>
                  Replace
                </Button>
                <Button variant="ghost" size="compact" leadingIcon={Trash2} onClick={removePhoto}>
                  Remove
                </Button>
              </>
            }
            footerEnd={
              <Button
                variant="ghost"
                size="compact"
                leadingIcon={RotateCcw}
                disabled={isExample && !badge.photo}
                onClick={clearAll}
              >
                Clear all
              </Button>
            }
          />
          {Object.values(errors).map((e) => (
            <div key={e}>{caption(e, "text-destructive")}</div>
          ))}
          {nameRejected && caption("The badge prints Latin letters only.")}
          {nameFull &&
            caption("That's as long as the badge fits. Try a shorter form of the name.")}
          {photoError && caption(photoError, "text-destructive")}
          {photo &&
            dpi < MIN_DPI &&
            caption(
              `The photo is small for print: ${Math.round(dpi)} dpi at this zoom, the printer needs ${MIN_DPI}. Zoom out or use a larger photo.`,
              "text-destructive",
            )}
        </div>
      }
      details={
        <DetailsTable
          rows={[
            [
              "Size",
              <SizeValue
                key="size"
                main={formatSize(BADGE.widthMm, BADGE.heightMm, units, 2)}
                sub="CR80 (ISO/IEC 7810 ID-1), no bleed"
              />,
            ],
            ["Production", "Card printer"],
            ["Material", decal.material ?? "—"],
            ["Print", "Full color RGB · name in black on the K panel"],
            ["Sides", "Front and back, same design"],
            ["Version", badgeStyles[style].name],
            [
              "Photo",
              !needsPhoto
                ? "None on the visitor badge"
                : photo
                  ? `${photo.width} × ${photo.height} px · ${Math.round(dpi)} dpi at this zoom`
                  : "—",
            ],
          ]}
        />
      }
      island={
        <DownloadIsland
          items={1}
          mode="pdf"
          onModeChange={() => {}}
          caption={needsPhoto ? "Your photo stays in this browser." : undefined}
          disabled={!complete || (needsPhoto && !photo)}
          build={build}
          onDownload={() =>
            void build.start({
              kind: "generate",
              total: 1,
              run: () => exportIdBadge(name, photo, crop, style, fileName),
            })
          }
        />
      }
    />
  );
}
