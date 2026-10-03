"use client";

import { createContext, useContext, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

// The sign-in card, in a dialog (#301). The redesigned landing page has no
// room for it inline, but `/` is still where existing users sign in and where
// the sign-in flow sends people back with a notice (a beta link accepted, a
// sign-up refused, an expired link). So the page opens the dialog on load
// whenever it has a notice to show, and every "Sign in" control opens it.
//
// The card itself is passed in already built: src/app/page.tsx decides which
// providers to offer on the server, and nothing about that moves here.

const OpenSignIn = createContext<(() => void) | null>(null);

export function SignInProvider({
  signIn,
  defaultOpen = false,
  children,
}: {
  signIn: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <OpenSignIn.Provider value={() => setOpen(true)}>
      {children}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
          <Dialog.Popup className="landing fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-[3px] border-(--lp-card-line) shadow-(--lp-card-shadow)">
            <div className="flex items-center justify-between border-b-[3px] border-(--lp-card-line) py-1 pr-1 pl-4">
              <Dialog.Title className="lp-head text-lg">Sign in</Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="grid size-11 cursor-pointer place-items-center text-(--lp-muted) hover:text-(--lp-ink)"
              >
                <X className="size-4" aria-hidden />
              </Dialog.Close>
            </div>
            <div className="p-3">{signIn}</div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </OpenSignIn.Provider>
  );
}

export function SignInButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const open = useContext(OpenSignIn);
  return (
    <button type="button" className={className} onClick={() => open?.()}>
      {children}
    </button>
  );
}
