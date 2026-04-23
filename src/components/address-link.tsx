"use client";

import { cn } from "@/lib/utils";

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
}

// Rendered as a <button> (not <a>) so it can be safely nested inside
// other links (e.g. the apartment list card's <Link> wrapper) without
// producing invalid-HTML nesting warnings.
export function AddressLink({
  address,
  className,
}: {
  address: string | null | undefined;
  className?: string;
}) {
  if (!address) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(mapsUrl(address), "_blank", "noopener,noreferrer");
      }}
      className={cn(
        "text-left underline-offset-2 hover:underline hover:text-foreground",
        className
      )}
      aria-label={`Open ${address} in Google Maps`}
    >
      {address}
    </button>
  );
}
