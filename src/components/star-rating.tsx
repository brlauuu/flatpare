"use client";

import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  size?: "sm" | "md";
}

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
}: StarRatingProps) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star === value ? 0 : star)}
          className={cn(
            "transition-colors",
            // Interactive stars need a real 44px box on phones. A hit-area
            // overlay is wrong here: five adjacent stars would overlap.
            readonly
              ? "cursor-default"
              : "min-h-11 min-w-11 cursor-pointer hover:text-yellow-400 sm:min-h-0 sm:min-w-0",
            star <= value ? "text-yellow-500" : "text-muted-foreground/30",
            size === "sm" ? "text-sm" : "text-lg"
          )}
        >
          ★
        </button>
      ))}
    </div>
  );
}
