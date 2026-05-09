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

interface ReviewStepProps {
  items: UploadItem[];
  saving: boolean;
  error: { headline: string; details?: ErrorDetails } | null;
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
  saving,
  error,
  onSaveAll,
  onUploadMore,
  onRetry,
  onUpdateItem,
  onUpdateForm,
  onUpdateWashingMachine,
  onDiscard,
}: ReviewStepProps) {
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Review Apartments</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onUploadMore}>
            Upload more
          </Button>
          {saveable.length > 0 && (
            <Button onClick={onSaveAll} disabled={saving}>
              {saving
                ? "Saving..."
                : `Save ${saveable.length === 1 ? "apartment" : `all ${saveable.length}`}`}
            </Button>
          )}
        </div>
      </div>

      {allDone && savedCount > 0 && (
        <p className="text-sm text-muted-foreground">
          All apartments saved. Redirecting...
        </p>
      )}

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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-muted-foreground">
                      {item.expanded ? "▼" : "▶"}
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">
                        {item.form.name || item.fileName}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground truncate">
                        {[
                          item.form.address,
                          item.form.rentChf && `CHF ${item.form.rentChf}`,
                          item.form.sizeM2 && `${item.form.sizeM2} m²`,
                          item.form.numRooms && `${item.form.numRooms} rooms`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || item.fileName}
                      </p>
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

              {item.status === "error" && item.error && (
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-destructive">{item.error}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRetry(item.id)}
                    >
                      Retry
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
