"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ErrorDetails,
  serializeErrorDetails,
} from "@/lib/fetch-error";

interface ErrorDisplayProps {
  headline: string;
  details?: ErrorDetails;
  className?: string;
}

export function ErrorDisplay({ headline, details, className }: ErrorDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!details) return;
    const text = serializeErrorDetails(headline, details);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (non-HTTPS, older browsers) — silently no-op.
    }
  }

  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm",
        className
      )}
    >
      <p className="text-destructive">{headline}</p>
      {details && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Show details
          </summary>
          <div className="mt-2 space-y-1 font-mono text-muted-foreground">
            {details.status !== undefined && (
              <div>
                <span className="text-foreground/80">Status:</span> {details.status}
              </div>
            )}
            {details.url && (
              <div className="break-all">
                <span className="text-foreground/80">URL:</span> {details.url}
              </div>
            )}
            {details.message && (
              <div className="break-words">
                <span className="text-foreground/80">Message:</span>{" "}
                {details.message}
              </div>
            )}
            <div>
              <span className="text-foreground/80">Time:</span>{" "}
              {details.timestamp}
            </div>
            {details.stack && (
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px] leading-tight">
                {details.stack}
              </pre>
            )}
            <button
              type="button"
              onClick={handleCopy}
              className="mt-2 inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-foreground/80 hover:bg-accent"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy details
                </>
              )}
            </button>
          </div>
        </details>
      )}
    </div>
  );
}
