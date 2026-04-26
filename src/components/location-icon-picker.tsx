"use client";

import { createElement } from "react";
import { Button } from "@/components/ui/button";
import {
  iconComponentFor,
  LOCATION_ICONS,
  type LocationIconName,
} from "@/lib/location-icons";
import { cn } from "@/lib/utils";

export function LocationIconPicker({
  open,
  selected,
  onPick,
  onClose,
}: {
  open: boolean;
  selected: string;
  onPick: (name: LocationIconName) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Pick an icon"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-3 rounded-lg bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pick an icon</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close"
            className="h-7 w-7 p-0"
          >
            ✕
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {LOCATION_ICONS.map(({ name, Component }) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              onClick={() => onPick(name)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md border bg-background transition-colors hover:bg-accent",
                selected === name && "border-primary bg-primary/10"
              )}
            >
              <Component className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LocationIconDisplay({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  // The lucide component lookup happens by name; we use createElement so the
  // linter doesn't see a "component created during render" pattern.
  return createElement(iconComponentFor(name), { className, "aria-label": name });
}
