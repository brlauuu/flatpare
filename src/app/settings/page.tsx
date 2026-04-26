"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "@/components/error-display";
import {
  LocationIconDisplay,
  LocationIconPicker,
} from "@/components/location-icon-picker";
import { MAX_LOCATIONS, type LocationIconName } from "@/lib/location-icons";
import {
  type ErrorDetails,
  fetchErrorFromResponse,
  fetchErrorFromException,
} from "@/lib/fetch-error";

interface Location {
  id: number;
  label: string;
  icon: string;
  address: string;
  sortOrder: number;
}

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

type Editing =
  | { kind: "create"; label: string; icon: string; address: string }
  | {
      kind: "edit";
      id: number;
      label: string;
      icon: string;
      address: string;
      original: { label: string; icon: string; address: string };
    };

export default function SettingsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);

  async function loadLocations() {
    const url = "/api/locations";
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setError({
          headline: "Couldn't load locations",
          details: await fetchErrorFromResponse(res, url),
        });
        return;
      }
      setLocations((await res.json()) as Location[]);
      setLoaded(true);
    } catch (err) {
      setError({
        headline: "Couldn't load locations",
        details: fetchErrorFromException(err, url),
      });
    }
  }

  useEffect(() => {
    void loadLocations();
  }, []);

  function startCreate() {
    setEditing({
      kind: "create",
      label: "",
      icon: "Train",
      address: "",
    });
  }

  function startEdit(loc: Location) {
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
    const trimmedLabel = editing.label.trim();
    const trimmedAddress = editing.address.trim();
    if (trimmedLabel === "" || trimmedAddress === "") return;

    setSaving(true);
    try {
      const url =
        editing.kind === "create"
          ? "/api/locations"
          : `/api/locations/${editing.id}`;
      const method = editing.kind === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: trimmedLabel,
          icon: editing.icon,
          address: trimmedAddress,
        }),
      });
      if (!res.ok) {
        setError({
          headline: "Couldn't save location",
          details: await fetchErrorFromResponse(res, url),
        });
        setSaving(false);
        return;
      }
      setEditing(null);
      setError(null);
      await loadLocations();
    } catch (err) {
      setError({
        headline: "Couldn't save location",
        details: fetchErrorFromException(err, "/api/locations"),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, label: string) {
    if (!confirm(`Delete "${label}"? Apartments will lose this distance.`))
      return;
    const url = `/api/locations/${id}`;
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        setError({
          headline: "Couldn't delete location",
          details: await fetchErrorFromResponse(res, url),
        });
        return;
      }
      await loadLocations();
    } catch (err) {
      setError({
        headline: "Couldn't delete location",
        details: fetchErrorFromException(err, url),
      });
    }
  }

  async function handleMove(id: number, direction: "up" | "down") {
    const url = `/api/locations/${id}/move`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) {
        setError({
          headline: "Couldn't reorder",
          details: await fetchErrorFromResponse(res, url),
        });
        return;
      }
      await loadLocations();
    } catch (err) {
      setError({
        headline: "Couldn't reorder",
        details: fetchErrorFromException(err, url),
      });
    }
  }

  async function handleRecompute() {
    setRecomputing(true);
    setRecomputeResult(null);
    const url = "/api/settings/recompute-distances";
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        setError({
          headline: "Couldn't recompute distances",
          details: await fetchErrorFromResponse(res, url),
        });
        setRecomputing(false);
        return;
      }
      const data = (await res.json()) as {
        totalApartments: number;
        totalLocations: number;
        updated: number;
        failed: number;
        skipped: number;
      };
      setRecomputeResult(
        `Recomputed ${data.updated} pairs across ${data.totalApartments} apartments × ${data.totalLocations} locations` +
          (data.failed > 0 ? ` (${data.failed} failed)` : "") +
          (data.skipped > 0 ? ` (${data.skipped} skipped — no address)` : "")
      );
      setError(null);
    } catch (err) {
      setError({
        headline: "Couldn't recompute distances",
        details: fetchErrorFromException(err, url),
      });
    } finally {
      setRecomputing(false);
    }
  }

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
            className="gap-1"
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
            <div
              key={loc.id}
              className="flex items-center gap-3 px-3 py-3 sm:px-4"
            >
              <LocationIconDisplay
                name={loc.icon}
                className="h-5 w-5 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{loc.label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {loc.address}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={`Move ${loc.label} up`}
                  onClick={() => handleMove(loc.id, "up")}
                  disabled={i === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={`Move ${loc.label} down`}
                  onClick={() => handleMove(loc.id, "down")}
                  disabled={i === locations.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  aria-label={`Edit ${loc.label}`}
                  onClick={() => startEdit(loc)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${loc.label}`}
                  onClick={() => handleDelete(loc.id, loc.label)}
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
                onChange={(e) =>
                  setEditing({ ...editing, label: e.target.value })
                }
                placeholder="Work, Home, Gym, …"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-address">Address</Label>
              <Input
                id="loc-address"
                value={editing.address}
                onChange={(e) =>
                  setEditing({ ...editing, address: e.target.value })
                }
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
              <Button onClick={handleSave} disabled={!editingDirty || saving}>
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
            onClick={handleRecompute}
            disabled={recomputing || locations.length === 0}
          >
            {recomputing ? "Recomputing…" : "Recompute all"}
          </Button>
          {recomputeResult && (
            <span className="text-sm text-muted-foreground">
              {recomputeResult}
            </span>
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
