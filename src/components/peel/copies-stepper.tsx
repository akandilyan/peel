"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fontWeights } from "@/lib/font-weight";
import { useSize } from "@/lib/size-context";

const MAX_COPIES = 20;

// CUSTOM: «− N +» stepper — Fluid doesn't have one. Native buttons (Button,
// ghost, icon-compact), the number uses scale tokens (useSize). The label is outside.
export function CopiesStepper({
  label,
  value,
  onChange,
  max = MAX_COPIES,
}: {
  /** For screen readers: Cars, Robots */
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  const size = useSize();
  return (
    <div
      className={`flex items-center gap-1 ${size.text}`}
      role="group"
      aria-label={label}
    >
      <Button
        variant="ghost"
        size="icon-compact"
        aria-label={`Fewer ${label.toLowerCase()}`}
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <Minus />
      </Button>
      <span
        className="min-w-6 text-center tabular-nums"
        style={{ fontVariationSettings: fontWeights.medium }}
        aria-live="polite"
      >
        {value}
      </span>
      <Button
        variant="ghost"
        size="icon-compact"
        aria-label={`More ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus />
      </Button>
    </div>
  );
}
