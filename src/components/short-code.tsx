"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function ShortCode({
  code,
  className,
}: {
  code: string | null | undefined;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!code) return null;

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Silently ignore clipboard errors (HTTP contexts, etc.)
    }
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-foreground/80",
        className
      )}
    >
      <span>{code}</span>
      <button
        type="button"
        aria-label={copied ? "Copied" : `Copy ${code}`}
        onClick={handleCopy}
        className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}
