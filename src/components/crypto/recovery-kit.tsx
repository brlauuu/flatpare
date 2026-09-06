"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export const RECOVERY_ACK =
  "I understand that if I lose both my passphrase and this recovery kit, my household's data cannot be recovered by anyone, including Flatpare.";

export function RecoveryKit({
  code,
  onContinue,
  title = "Your recovery kit",
}: {
  code: string;
  onContinue: () => void;
  title?: string;
}) {
  const [acked, setAcked] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
  }

  return (
    <div className="mx-auto max-w-md space-y-4 print:max-w-none">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground print:hidden">
        Write this code down or print it and keep it somewhere safe. It is the
        only way to get your household&apos;s data back if you forget your
        passphrase and nobody else in your household can let you in. It is
        shown once.
      </p>
      <p className="rounded-md border bg-muted p-4 text-center font-mono text-lg tracking-wider">
        {code}
      </p>
      <div className="flex gap-2 print:hidden">
        <Button type="button" variant="outline" onClick={copy}>
          Copy
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Print
        </Button>
        {copied && <span className="self-center text-sm text-muted-foreground">Copied.</span>}
      </div>
      <label className="flex items-start gap-2 text-sm print:hidden">
        <input
          type="checkbox"
          className="mt-1"
          checked={acked}
          onChange={(e) => setAcked(e.target.checked)}
        />
        <span>{RECOVERY_ACK}</span>
      </label>
      <Button type="button" className="print:hidden" disabled={!acked} onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
