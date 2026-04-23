"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const sizeClasses: Record<Size, string> = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2 py-0.5 text-sm",
  lg: "px-2.5 py-1 text-base",
};

const iconClasses: Record<Size, string> = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

export function ShortCode({
  code,
  size = "sm",
  className,
}: {
  code: string | null | undefined;
  size?: Size;
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
      data-short-code-size={size}
      className={cn(
        "inline-flex items-center gap-1 rounded border border-border bg-muted/60 font-mono font-medium text-foreground tracking-tight",
        sizeClasses[size],
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
        {copied ? (
          <Check className={iconClasses[size]} />
        ) : (
          <Copy className={iconClasses[size]} />
        )}
      </button>
    </span>
  );
}
