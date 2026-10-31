"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_MAX_LENGTH } from "@/lib/feedback-limits";

// "Send feedback" (#476): a message, emailed to the owner, with or without
// the sender's name. Nothing is stored. Each choice says what the email
// will carry, because "anonymous" means less than people may assume: the
// server knows who is signed in while it sends.

type Status = "idle" | "sending" | "sent" | "busy" | "failed";

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("nav.feedback");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  function change(next: boolean) {
    // A sent message is done; the next open starts a new one.
    if (!next && status === "sent") {
      setMessage("");
      setAnonymous(false);
      setStatus("idle");
    }
    onOpenChange(next);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, anonymous }),
      });
      setStatus(res.ok ? "sent" : res.status === 429 ? "busy" : "failed");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto border-3 border-frame bg-card text-card-foreground shadow-frame">
          <div className="flex items-center justify-between border-b-3 border-frame py-1 pr-1 pl-4">
            <Dialog.Title className="title-section">{t("title")}</Dialog.Title>
            <Dialog.Close
              aria-label={t("close")}
              className="grid size-11 cursor-pointer place-items-center text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>
          {status === "sent" ? (
            <div className="space-y-4 p-4 text-sm">
              <p role="status">{t("thanks")}</p>
              <Button type="button" onClick={() => change(false)}>
                {t("close")}
              </Button>
            </div>
          ) : (
            <form onSubmit={send} className="space-y-3 p-4 text-sm">
              <Dialog.Description>{t("intro")}</Dialog.Description>
              <Textarea
                aria-label={t("message")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={FEEDBACK_MAX_LENGTH}
                rows={6}
                required
              />
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={anonymous}
                  onChange={(e) => setAnonymous(e.target.checked)}
                />
                <span>{t("anonymous")}</span>
              </label>
              <p className="text-muted-foreground">{anonymous ? t("anonymousNote") : t("namedNote")}</p>
              {status === "busy" && <p role="alert" className="text-destructive">{t("busy")}</p>}
              {status === "failed" && <p role="alert" className="text-destructive">{t("failed")}</p>}
              <Button type="submit" disabled={status === "sending" || message.trim() === ""}>
                {status === "sending" ? t("sending") : t("send")}
              </Button>
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
