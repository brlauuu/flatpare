import { createElement } from "react";
import { cn } from "@/lib/utils";
import { MARK_HEIGHT, MARK_WIDTH, scribbleDotPath } from "@/lib/map/marks";
import { iconComponentFor } from "@/lib/location-icons";

// One hand-drawn mark on the map (#330): a scribbled dot for an apartment,
// and for a place the icon it has on the apartment page (#479), the label
// written beside it.
//
// With a mouse, hovering shows the card and a click opens the apartment.
// On a touch screen there is no hover, so a tap shows the card and the card
// itself is the link. A keyboard gets focus = show, Enter = open,
// Escape = close.
//
// The apartment the map was opened for (#384) is drawn with a heavier line
// and a soft fill (`.map-mark-highlighted`), and announced as current.

interface Props {
  kind: "apartment" | "location";
  label: string;
  seed: number;
  icon?: string | null;
  ariaLabel: string;
  highlighted?: boolean;
  hoverCapable: boolean;
  onShow: () => void;
  onHide: () => void;
  onDismiss: () => void;
  onOpen?: () => void;
}

export function MapMark({ kind, label, seed, icon = null, ariaLabel, highlighted = false, hoverCapable, onShow, onHide, onDismiss, onOpen }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-current={highlighted ? "true" : undefined}
      className={cn("map-mark", kind === "apartment" ? "text-primary" : "text-destructive", highlighted && "map-mark-highlighted")}
      onMouseEnter={hoverCapable ? onShow : undefined}
      onMouseLeave={hoverCapable ? onHide : undefined}
      onFocus={onShow}
      onBlur={onHide}
      onClick={() => {
        if (hoverCapable && onOpen) onOpen();
        else onShow();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onOpen) onOpen();
        else if (e.key === "Escape") onDismiss();
      }}
    >
      {kind === "location" ? (
        // By name, through createElement, as location-icon-picker.tsx does.
        createElement(iconComponentFor(icon ?? ""), {
          className: "map-mark-icon",
          width: 28,
          height: 28,
          strokeWidth: 2.5,
          "aria-hidden": true,
        })
      ) : (
        <svg viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`} width={MARK_WIDTH} height={MARK_HEIGHT} aria-hidden="true">
          <path
            d={scribbleDotPath(seed)}
            fill="none"
            stroke="currentColor"
            strokeWidth={highlighted ? 3.6 : 2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span className="map-mark-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
