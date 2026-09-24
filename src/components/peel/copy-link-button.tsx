"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

// Copies the current decal's URL.
// Native icon-size Button with a Tooltip; after copying the tooltip
// stays open for 2 s and shows «Copied».
export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const Icon = copied ? Check : Link2;
  return (
    <Tooltip
      content={copied ? "Copied" : "Copy link"}
      side="top"
      forceOpen={copied || undefined}
    >
      <Button
        variant="ghost"
        size="icon-compact"
        aria-label="Copy link"
        onClick={async () => {
          const url = window.location.href;
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            // No Clipboard API access (unfocused window, old browser) — the legacy way
            const ta = document.createElement("textarea");
            ta.value = url;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            ta.remove();
          }
          setCopied(true);
        }}
      >
        <Icon />
      </Button>
    </Tooltip>
  );
}
