"use client";

import type { KeyboardEvent, RefObject } from "react";
import {
  splitPastedName,
  typeableText,
  type BadgeField,
  type BadgeName,
  type BadgeStyle,
} from "@/lib/id-badge";

// The ID badge's name inputs: invisible, over the name block of the card so
// the page doesn't jump when a phone keyboard opens (16 px keeps iOS from
// zooming in); the caret and the selection are drawn in the card texture by
// the preview. Characters the badge can't print never get in, and a full name
// pasted into the first name splits into first and last.

export const NAME_FIELDS: { key: BadgeField; label: string; autoComplete: string }[] = [
  { key: "first", label: "First name", autoComplete: "given-name" },
  { key: "last", label: "Last name", autoComplete: "family-name" },
];

export function NameInputs({
  inputs,
  name,
  latestName,
  style,
  onNameChange,
  onRejected,
  onFocusChange,
  onSelection,
  onKeyDown,
}: {
  /** The inputs by field, for the preview to focus and read */
  inputs: RefObject<Record<BadgeField, HTMLInputElement | null>>;
  name: BadgeName;
  /** The name as of the last change: a change builds on it, not on a render
   *  behind */
  latestName: () => BadgeName;
  style: BadgeStyle;
  onNameChange: (name: BadgeName) => void;
  /** Characters the badge can't print were dropped (or not): the card shakes */
  onRejected: (rejected: boolean) => void;
  /** The field being edited; null when the editing ends */
  onFocusChange: (field: BadgeField | null) => void;
  /** The caret or selection moved in an input */
  onSelection: (el: HTMLInputElement) => void;
  onKeyDown: (field: BadgeField, e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const isNameInput = (el: EventTarget | null) =>
    Object.values(inputs.current).includes(el as HTMLInputElement);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 overflow-hidden opacity-0"
      style={{ top: "75%", height: "10%" }}
    >
      {NAME_FIELDS.map((f) => (
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
            // Taken out of the input right away; the caret stays in place
            const el = e.target;
            const value = typeableText(el.value, style);
            const rejected = value !== el.value;
            if (rejected) {
              const caret = typeableText(
                el.value.slice(0, el.selectionStart ?? el.value.length),
                style,
              ).length;
              el.value = value;
              el.setSelectionRange(caret, caret);
            }
            onRejected(rejected);
            onNameChange({ ...latestName(), [f.key]: value });
            onSelection(el);
          }}
          onSelect={(e) => onSelection(e.currentTarget)}
          onFocus={(e) => {
            onFocusChange(f.key);
            onSelection(e.currentTarget);
          }}
          onBlur={(e) => {
            // Moving between the two lines keeps editing
            if (!isNameInput(e.relatedTarget)) onFocusChange(null);
          }}
          onKeyDown={(e) => onKeyDown(f.key, e)}
          onPaste={(e) => {
            if (f.key !== "first") return;
            const el = e.currentTarget;
            const split = splitPastedName(
              el.value,
              el.selectionStart ?? el.value.length,
              el.selectionEnd ?? el.value.length,
              e.clipboardData.getData("text/plain"),
            );
            if (!split) return;
            e.preventDefault();
            const first = typeableText(split.first, style);
            const last = typeableText(split.last, style);
            onRejected(first !== split.first || last !== split.last);
            onNameChange({ first, last });
            // On to the last name, the caret at its end
            requestAnimationFrame(() => {
              const next = inputs.current.last;
              if (!next) return;
              next.focus();
              next.setSelectionRange(next.value.length, next.value.length);
              onSelection(next);
            });
          }}
        />
      ))}
    </div>
  );
}
