"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "@/components/error-display";
import { EncryptionSettings } from "@/components/crypto/encryption-settings";
import { HouseholdSettings } from "@/components/household-settings";
import {
  LocationIconDisplay,
  LocationIconPicker,
} from "@/components/location-icon-picker";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { newRowId } from "@/lib/household-data/ids";
import type { LocationView } from "@/lib/household-data/types";
import { MAX_LOCATIONS, type LocationIconName } from "@/lib/location-icons";
import { type ErrorDetails, errorDetailsFromException } from "@/lib/fetch-error";

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

export default function SettingsPage() {
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
        headline: "Couldn't save location",
        details: errorDetailsFromException(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete "${label}"? Apartments will lose this distance.`)) return;
    try {
      await deleteLocation(id);
    } catch (err) {
      setError({
        headline: "Couldn't delete location",
        details: errorDetailsFromException(err),
      });
    }
  }

  async function handleMove(id: string, direction: "up" | "down") {
    try {
      await moveLocation(id, direction);
    } catch (err) {
      setError({ headline: "Couldn't reorder", details: errorDetailsFromException(err) });
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
        `Recomputed ${report.updated} apartments` +
          (report.failed.length > 0 ? ` (${report.failed.length} failed)` : "") +
          (report.skipped > 0 ? ` (${report.skipped} skipped — no address)` : "")
      );
      setError(null);
    } catch (err) {
      setError({
        headline: "Couldn't recompute distances",
        details: errorDetailsFromException(err),
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
      <h1 className="text-2xl font-semibold">Settings</h1>
      <EncryptionSettings />
      <HouseholdSettings />

      {status === "error" && (
        <ErrorDisplay
          headline="Couldn't load locations"
          details={{ message: loadError ?? undefined, timestamp: new Date().toISOString() }}
        />
      )}
      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">
            Locations of interest ({locations.length} of {MAX_LOCATIONS})
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={startCreate}
            disabled={!canAdd || editing !== null}
            className="h-11 gap-1 sm:h-8"
          >
            <Plus className="h-4 w-4" />
            Add location
          </Button>
        </div>

        {loaded && locations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No locations yet. Apartments will hide their distance section until you
            add one.
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
                  aria-label={`Move ${loc.label} up`}
                  onClick={() => void handleMove(loc.id, "up")}
                  disabled={i === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                  aria-label={`Move ${loc.label} down`}
                  onClick={() => void handleMove(loc.id, "down")}
                  disabled={i === locations.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 sm:h-8 sm:w-8"
                  aria-label={`Edit ${loc.label}`}
                  onClick={() => startEdit(loc)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 p-0 text-muted-foreground hover:text-destructive sm:h-8 sm:w-8"
                  aria-label={`Delete ${loc.label}`}
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
              {editing.kind === "create" ? "Add location" : "Edit location"}
            </h3>
            <div className="space-y-2">
              <Label htmlFor="loc-label">Label</Label>
              <Input
                id="loc-label"
                value={editing.label}
                onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                placeholder="Work, Home, Gym, …"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-address">Address</Label>
              <Input
                id="loc-address"
                value={editing.address}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                placeholder="Street, postcode, city"
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIconPickerOpen(true)}
                className="gap-2"
                aria-label="Pick icon"
              >
                <LocationIconDisplay name={editing.icon} className="h-4 w-4" />
                Change
              </Button>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={() => void handleSave()} disabled={!editingDirty || saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recompute distances</h2>
        <p className="text-sm text-muted-foreground">
          Rebuild bike and transit minutes for every apartment × location pair.
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
                ? `Recomputing… ${recomputeProgress[0]} of ${recomputeProgress[1]}`
                : "Recomputing…"
              : "Recompute all"}
          </Button>
          {recomputeResult && (
            <span className="text-sm text-muted-foreground">{recomputeResult}</span>
          )}
        </div>
      </section>

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
