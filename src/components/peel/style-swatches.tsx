"use client";

import { useRef, type KeyboardEvent } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cardStyles, type CardStyle } from "@/lib/business-card";

// CUSTOM: style swatches — Fluid has no swatch picker (its Color Picker is a
// full picker with an eyedropper). Round color chips in a radio group: the ring
// marks the selected one, a Fluid Tooltip names each option, arrow keys move the
// choice. Used for the business card styles and the lanyard designs.

export interface Swatch<T extends string> {
  id: T;
  name: string;
  /** CSS background of the chip */
  chip: string;
}

export function Swatches<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** The group's accessible name */
  label: string;
  options: Swatch<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = options.findIndex((o) => o.id === value);
  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = (index + step + options.length) % options.length;
    onChange(options[i].id);
    refs.current[i]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-2.5 px-1"
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => {
        const selected = o.id === value;
        return (
          <Tooltip key={o.id} content={o.name} side="top">
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.name}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(o.id)}
              // The selection is an outline with a gap: it works on any backdrop
              className={`size-5 cursor-pointer rounded-full outline-offset-2 transition-[outline-color] duration-80 focus-visible:outline-2 focus-visible:outline-[color:var(--focus-ring,#6B97FF)] ${
                selected
                  ? "outline-2 outline-foreground"
                  : "outline-2 outline-transparent ring-1 ring-foreground/30 hover:outline-foreground/40"
              }`}
              style={{ background: o.chip }}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

// Business card styles: a style with a white back shows both sides — half the
// front ink, half white.
const cardSwatches: Swatch<CardStyle>[] = (Object.keys(cardStyles) as CardStyle[]).map((s) => {
  const { front, back, name } = cardStyles[s];
  return {
    id: s,
    name,
    chip: back ? back.screen : `linear-gradient(135deg, ${front.screen} 50%, #fff 50%)`,
  };
});

export function StyleSwatches({
  value,
  onChange,
}: {
  value: CardStyle;
  onChange: (style: CardStyle) => void;
}) {
  return <Swatches label="Style" options={cardSwatches} value={value} onChange={onChange} />;
}
