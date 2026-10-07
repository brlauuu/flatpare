import { useCallback, useEffect, useRef, useState } from "react";

// Which mark's card is open. Leaving a mark hides its card after a short
// delay, so the pointer can travel from the mark onto the card without it
// vanishing; entering the card cancels that.

export type ActiveMark = { kind: "apartment" | "location"; id: string };

export const HIDE_DELAY_MS = 150;

export function useCardState() {
  const [active, setActive] = useState<ActiveMark | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const show = useCallback(
    (mark: ActiveMark) => {
      cancelHide();
      setActive(mark);
    },
    [cancelHide]
  );
  const hide = useCallback(() => {
    cancelHide();
    setActive(null);
  }, [cancelHide]);
  const hideSoon = useCallback(() => {
    cancelHide();
    timer.current = setTimeout(() => {
      timer.current = null;
      setActive(null);
    }, HIDE_DELAY_MS);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  return { active, show, hide, hideSoon, cancelHide };
}
