"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputField, InputGroup } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTypeScale } from "@/lib/size-context";

// The meeting room sign's rooms in the Download panel: one native InputField
// per room. Enter adds the next room, Backspace in an empty field removes it,
// ↑ / ↓ move between fields, a pasted list (lines, commas) becomes fields.
// The focused field picks the room shown in the preview.
// CUSTOM: the remove button beside each field (InputField has no slot for one),
// the tighter gap between fields and the scrolling list — the panel is sticky,
// so past ~6 rooms the list scrolls inside and Download stays on screen; its
// edges fade where more rooms hide behind them. The count lines up with the
// remove buttons' icons, Add room's plus with the fields' text.

// The fade over a scrolled-off edge
const FADE = "16px";

export function RoomList({
  fields,
  onFieldsChange,
  onFocusField,
}: {
  /** The fields' text, at least one (empty — the placeholder) */
  fields: string[];
  /** The whole list; focus — the field to focus after it's applied */
  onFieldsChange: (fields: string[], focus?: number) => void;
  onFocusField: (index: number) => void;
}) {
  const type = useTypeScale();
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  const count = fields.filter((f) => f.trim()).length;
  const scrollRef = useRef<HTMLDivElement>(null);
  // Rooms hidden above / below the list's visible part
  const [hidden, setHidden] = useState({ above: false, below: false });

  // Track the viewport's scroll and size (fields added, removed, the panel
  // resized) for the fades
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    if (!viewport) return;
    const update = () => {
      const above = viewport.scrollTop > 1;
      const below = viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1;
      setHidden((h) => (h.above === above && h.below === below ? h : { above, below }));
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  const mask = `linear-gradient(to bottom, ${hidden.above ? "transparent" : "#000"} 0, #000 ${FADE}, #000 calc(100% - ${FADE}), ${hidden.below ? "transparent" : "#000"} 100%)`;

  const focusField = (i: number) =>
    refs.current[i]?.querySelector("input")?.focus();

  // Focus a field added or kept after a change, once it's rendered
  useEffect(() => {
    if (pendingFocus.current === null) return;
    focusField(pendingFocus.current);
    pendingFocus.current = null;
  });

  const change = (next: string[], focus?: number) => {
    if (focus !== undefined) pendingFocus.current = focus;
    onFieldsChange(next.length ? next : [""], focus);
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    if (e.key === "Enter") {
      e.preventDefault();
      // Split at the caret: the rest of the text goes to the new room
      const at = input.selectionStart ?? fields[i].length;
      change(
        [...fields.slice(0, i), fields[i].slice(0, at), fields[i].slice(at), ...fields.slice(i + 1)],
        i + 1,
      );
    } else if (e.key === "Backspace" && !fields[i] && fields.length > 1) {
      e.preventDefault();
      change(fields.filter((_, k) => k !== i), Math.max(0, i - 1));
    } else if (e.key === "ArrowDown" && i < fields.length - 1) {
      e.preventDefault();
      focusField(i + 1);
    } else if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      focusField(i - 1);
    }
  };

  const onPaste = (i: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\r\n,;]/.test(text)) return;
    e.preventDefault();
    const input = e.currentTarget;
    const from = input.selectionStart ?? fields[i].length;
    const to = input.selectionEnd ?? from;
    const parts = (fields[i].slice(0, from) + text + fields[i].slice(to))
      .split(/[\r\n,;]+/)
      .map((p) => p.trim());
    const pasted = parts.filter(Boolean);
    const next = [...fields.slice(0, i), ...(pasted.length ? pasted : [""]), ...fields.slice(i + 1)];
    change(next, i + Math.max(0, pasted.length - 1));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center justify-between">
        <span className="text-muted-foreground" style={{ fontSize: type.body }}>
          Rooms
        </span>
        {count > 1 && (
          <span
            className="pr-3.5 text-muted-foreground tabular-nums"
            style={{ fontSize: type.caption }}
          >
            {count} rooms
          </span>
        )}
      </div>
      <ScrollArea
        ref={scrollRef}
        viewportClassName="h-auto max-h-[218px]"
        className="mt-1"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {/* CUSTOM: a visible border, as the Numbers field; gap-1.5; a 1 px
            inset so the scroll area doesn't clip the fields' rings */}
        <InputGroup
          size="compact"
          className="w-full gap-1.5 p-px pr-1 [&_.ring-transparent]:ring-border"
        >
          {fields.map((value, i) => (
            <div
              key={i}
              className="flex items-start gap-1"
              onFocus={() => onFocusField(i)}
            >
              <InputField
                ref={(el) => {
                  refs.current[i] = el;
                }}
                index={i}
                label={`Room ${i + 1}`}
                labelHidden
                placeholder={i === 0 ? "Room name" : "Next room"}
                value={value}
                onChange={(v) => change(fields.map((f, k) => (k === i ? v : f)))}
                onKeyDown={onKeyDown(i)}
                onPaste={onPaste(i)}
                className="min-w-0 flex-1"
                spellCheck={false}
                autoComplete="off"
              />
              {(fields.length > 1 || value) && (
                <Button
                  variant="ghost"
                  size="icon-compact"
                  aria-label={`Remove ${value || "room"}`}
                  onClick={() =>
                    change(
                      fields.filter((_, k) => k !== i),
                      Math.max(0, Math.min(i, fields.length - 2)),
                    )
                  }
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
        </InputGroup>
      </ScrollArea>
      <Button
        variant="ghost"
        size="compact"
        leadingIcon={Plus}
        className="-ml-[3px] self-start"
        onClick={() => change([...fields, ""], fields.length)}
      >
        Add room
      </Button>
    </div>
  );
}
