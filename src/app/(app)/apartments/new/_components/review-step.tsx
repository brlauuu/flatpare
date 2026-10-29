import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorDisplay } from "@/components/error-display";
import {
  ApartmentFormFields,
  type ApartmentForm,
} from "@/components/apartment-form-fields";
import type { ErrorDetails } from "@/lib/fetch-error";
import type { UploadItem } from "./types";
import { StatusBadge } from "./status-badge";
import { ShareNotice } from "./upload-step";
import { useFormatRent } from "@/components/use-format-rent";
import { PdfTooLargeNotice } from "@/components/pdf-too-large-notice";

interface ReviewStepProps {
  items: UploadItem[];
  // For the too-large notice (#438).
  pdfReadMaxBytes?: number;
  saving: boolean;
  error: { headline: string; details?: ErrorDetails } | null;
  notice?: string | null;
  onSaveAll: () => void;
  onUploadMore: () => void;
  onRetry: (id: string) => void;
  onUpdateItem: (id: string, patch: Partial<UploadItem>) => void;
  onUpdateForm: (id: string, field: keyof ApartmentForm, value: string) => void;
  onUpdateWashingMachine: (id: string, value: boolean | null) => void;
  onDiscard: (id: string) => void;
}

export function ReviewStep({
  items,
  pdfReadMaxBytes,
  saving,
  error,
  notice,
  onSaveAll,
  onUploadMore,
  onRetry,
  onUpdateItem,
  onUpdateForm,
  onUpdateWashingMachine,
  onDiscard,
}: ReviewStepProps) {
  const t = useTranslations("apartments.review");
  const formatRent = useFormatRent();
  const saveable = items.filter(
    (i) =>
      i.status === "done" && !i.saved && !i.discarded && i.form.name.trim()
  );
  const savedCount = items.filter((i) => i.saved).length;
  const allDone = items.every(
    (i) => i.saved || i.discarded || i.status === "error"
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Stacks on a phone: side by side, the title and both buttons were
          wider than the screen and pushed the page sideways (#406). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="title-page">{t("title")}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onUploadMore} className="h-11 flex-1 sm:h-9 sm:flex-none">
            {t("uploadMore")}
          </Button>
          {saveable.length > 0 && (
            <Button onClick={onSaveAll} disabled={saving} className="h-11 flex-1 sm:h-9 sm:flex-none">
              {saving ? t("saving") : t("save", { count: saveable.length })}
            </Button>
          )}
        </div>
      </div>

      {allDone && savedCount > 0 && (
        <p className="text-sm text-muted-foreground">{t("allSaved")}</p>
      )}

      <ShareNotice text={notice} />

      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <div className="space-y-3">
        {items.map((item) => {
          if (item.discarded) return null;

          return (
            <Card key={item.id} className={cn(item.saved && "opacity-60")}>
              <CardHeader
                className="cursor-pointer"
                onClick={() =>
                  !item.saved &&
                  onUpdateItem(item.id, { expanded: !item.expanded })
                }
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* An icon, not "▶": phones draw that character as an emoji. */}
                    {item.expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">
                        {item.form.name || item.fileName}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground truncate">
                        {[
                          item.form.address,
                          item.form.rentChf && formatRent(Number(item.form.rentChf), item.form.rentCurrency),
                          item.form.sizeM2 && t("size", { size: item.form.sizeM2 }),
                          item.form.numRooms && t("rooms", { count: item.form.numRooms }),
                        ]
                          .filter(Boolean)
                          .join(" · ") || item.fileName}
                      </p>
                      {item.pdfWarning && (
                        <p className="text-xs text-warning">
                          {item.pdfWarning}
                        </p>
                      )}
                      {item.notRead === "no_credits" && (
                        <p className="text-xs text-warning">{t("notRead")}</p>
                      )}
                      {item.linkFound && (
                        <p className="text-xs text-muted-foreground">
                          {t("linkFound")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge
                      status={item.status}
                      error={item.error}
                      saved={item.saved}
                    />
                    {!item.saved && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDiscard(item.id);
                        }}
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              {item.notRead === "too_large" && (
                <CardContent>
                  <PdfTooLargeNotice maxBytes={pdfReadMaxBytes} />
                </CardContent>
              )}

              {item.status === "error" && item.error && (
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-destructive">{item.error}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRetry(item.id)}
                    >
                      {t("retry")}
                    </Button>
                  </div>
                </CardContent>
              )}

              {item.expanded && !item.saved && item.status !== "error" && (
                <CardContent>
                  <ApartmentFormFields
                    form={item.form}
                    onChange={(field, value) =>
                      onUpdateForm(item.id, field, value)
                    }
                    onWashingMachineChange={(v) =>
                      onUpdateWashingMachine(item.id, v)
                    }
                  />
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
