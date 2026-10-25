import { cn } from "@/lib/utils";
import { MARK_HEIGHT, MARK_WIDTH, pencilCirclePath, starPath } from "@/lib/map/marks";

// One hand-drawn mark on the map (#330): a pencil circle around an
// apartment, a star on a place, the label written beside it.
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
  ariaLabel: string;
  highlighted?: boolean;
  hoverCapable: boolean;
  onShow: () => void;
  onHide: () => void;
  onDismiss: () => void;
  onOpen?: () => void;
}

export function MapMark({ kind, label, seed, ariaLabel, highlighted = false, hoverCapable, onShow, onHide, onDismiss, onOpen }: Props) {
  const path = kind === "apartment" ? pencilCirclePath(seed) : starPath();
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
      <svg viewBox={`0 0 ${MARK_WIDTH} ${MARK_HEIGHT}`} width={MARK_WIDTH} height={MARK_HEIGHT} aria-hidden="true">
        <path d={path} fill="none" stroke="currentColor" strokeWidth={highlighted ? 4.5 : 2.6} strokeLinecap="round" strokeLinejoin="round" />
        {kind === "apartment" && <circle cx={MARK_WIDTH / 2} cy={MARK_HEIGHT / 2} r={3} fill="currentColor" />}
      </svg>
      <span className="map-mark-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
