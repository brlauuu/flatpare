"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "@/components/error-display";
import {
  LocationIconDisplay,
  LocationIconPicker,
} from "@/components/location-icon-picker";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { newRowId } from "@/lib/household-data/ids";
import type { LocationView } from "@/lib/household-data/types";
import { MAX_LOCATIONS, type LocationIconName } from "@/lib/location-icons";
import type { ErrorDetails } from "@/lib/fetch-error";
import { useStoreErrorDetails } from "@/components/household-data/use-store-error-details";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

type Editing =
  | { kind: "create"; label: string; icon: string; address: string }
  | {
      kind: "edit";
      id: string;
      label: string;
      icon: string;
      address: string;
      original: { label: string; icon: string; address: string };
    };

// Locations of interest and the distance recompute (#298). Lives on the
// Household page: locations belong to the household, and every member may
// edit them. Only the owner may recompute — `canRecompute` — because that
// re-runs a paid distance call for every apartment × location pair (see
// Apartment credits (E6) in AGENTS.md for the cost). The server does not
// enforce that: the distance route serves every member's own enrichment,
// so this is a UI decision keyed on the session's role.
export function LocationsSettings({ canRecompute }: { canRecompute: boolean }) {
  const t = useTranslations("household.locations");
  const {
    status,
    error: loadError,
    locations,
    createLocation,
    updateLocation,
    deleteLocation,
    moveLocation,
    runMaintenance,
  } = useHouseholdData();
  const storeErrorDetails = useStoreErrorDetails();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeProgress, setRecomputeProgress] = useState<[number, number] | null>(null);
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  function startCreate() {
    setEditing({ kind: "create", label: "", icon: "Train", address: "" });
  }

  function startEdit(loc: LocationView) {
    setEditing({
      kind: "edit",
      id: loc.id,
      label: loc.label,
      icon: loc.icon,
      address: loc.address,
      original: { label: loc.label, icon: loc.icon, address: loc.address },
    });
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function handleSave() {
    if (!editing) return;
    const label = editing.label.trim();
    const address = editing.address.trim();
    if (label === "" || address === "") return;

    setSaving(true);
    try {
      if (editing.kind === "create") {
        // Coordinates are null here; the store geocodes the address and
        // computes distances before the row is persisted.
        await createLocation(newRowId(), {
          label,
          icon: editing.icon,
          address,
          latitude: null,
          longitude: null,
        });
      } else {
        const icon = editing.icon;
        await updateLocation(editing.id, (current) => ({ ...current, label, icon, address }));
      }
      setEditing(null);
      setError(null);
    } catch (err) {
      setError({
        headline: t("saveError"),
        details: storeErrorDetails(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(t("deleteConfirm", { label }))) return;
    try {
      await deleteLocation(id);
    } catch (err) {
      setError({
        headline: t("deleteError"),
        details: storeErrorDetails(err),
      });
    }
  }

  async function handleMove(id: string, direction: "up" | "down") {
    try {
      await moveLocation(id, direction);
    } catch (err) {
      setError({ headline: t("reorderError"), details: storeErrorDetails(err) });
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    setRecomputeProgress(null);
    setRecomputeResult(null);
    try {
      const report = await runMaintenance("distances", (done, total) =>
        setRecomputeProgress([done, total])
      );
      setRecomputeResult(
        t("recomputed", { updated: report.updated, failed: report.failed.length, skipped: report.skipped })
      );
      setError(null);
    } catch (err) {
      setError({
        headline: t("recomputeError"),
        details: storeErrorDetails(err),
      });
    } finally {
      setRecomputing(false);
      setRecomputeProgress(null);
    }
  }

  const loaded = status === "ready";
  const canAdd = locations.length < MAX_LOCATIONS;
  const editingDirty =
    editing?.kind === "create"
      ? editing.label.trim() !== "" && editing.address.trim() !== ""
      : editing
        ? editing.label.trim() !== "" &&
          editing.address.trim() !== "" &&
          (editing.label.trim() !== editing.original.label ||
            editing.icon !== editing.original.icon ||
            editing.address.trim() !== editing.original.address)
        : false;

  return (
    <div className="space-y-8">
      {status === "error" && (
        <ErrorDisplay
          headline={t("loadError")}
          details={{ message: loadError ?? undefined, timestamp: new Date().toISOString() }}
        />
      )}
      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="title-section">
            {t("title", { count: locations.length, max: MAX_LOCATIONS })}
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={startCreate}
            disabled={!canAdd || editing !== null}
            className="h-11 gap-1 sm:h-8"
          >
            <Plus className="h-4 w-4" />
            {t("add")}
          </Button>
        </div>

        {loaded && locations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        <div className="divide-y rounded-md border">
          {locations.map((loc, i) => (
            <div key={loc.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <LocationIconDisplay
                name={loc.icon}
                className="h-5 w-5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{loc.label}</div>
                <div className="truncate text-xs text-muted-foreground">{loc.address}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                  aria-label={t("moveUp", { label: loc.label })}
                  onClick={() => void handleMove(loc.id, "up")}
                  disabled={i === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                  aria-label={t("moveDown", { label: loc.label })}
                  onClick={() => void handleMove(loc.id, "down")}
                  disabled={i === locations.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                  aria-label={t("edit", { label: loc.label })}
                  onClick={() => startEdit(loc)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
                  aria-label={t("delete", { label: loc.label })}
                  onClick={() => void handleDelete(loc.id, loc.label)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {editing && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold">
              {editing.kind === "create" ? t("formAdd") : t("formEdit")}
            </h3>
            <div className="space-y-2">
              <Label htmlFor="loc-label">{t("labelLabel")}</Label>
              <Input
                id="loc-label"
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                placeholder={t("labelPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-address">{t("addressLabel")}</Label>
              <Input
                id="loc-address"
                value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                placeholder={t("addressPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("iconLabel")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIconPickerOpen(true)}
                className="gap-2"
                aria-label={t("pickIcon")}
              >
                <LocationIconDisplay name={editing.icon} className="h-4 w-4" />
                {t("change")}
              </Button>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={() => void handleSave()} disabled={!editingDirty || saving}>
                {saving ? t("saving") : t("save")}
              </Button>
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}
      </section>

      {canRecompute && (
      <section className="space-y-2">
        <h2 className="title-section">{t("recomputeTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("recomputeBody")}
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => void handleRecompute()}
            className="h-11 sm:h-8"
            disabled={recomputing || locations.length === 0}
          >
            {recomputing
              ? recomputeProgress
                ? t("recomputingProgress", { done: recomputeProgress[0], total: recomputeProgress[1] })
                : t("recomputing")
              : t("recompute")}
          </Button>
          {recomputeResult && (
            <span className="text-sm text-muted-foreground">{recomputeResult}</span>
          )}
        </div>
      </section>
      )}

      <LocationIconPicker
        open={iconPickerOpen}
        selected={editing?.icon ?? ""}
        onPick={(name: LocationIconName) => {
          if (editing) setEditing({ ...editing, icon: name });
          setIconPickerOpen(false);
        }}
        onClose={() => setIconPickerOpen(false)}
      />
    </div>
  );
}
