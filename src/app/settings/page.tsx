"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorDisplay } from "@/components/error-display";
import {
  type ErrorDetails,
  fetchErrorFromResponse,
  fetchErrorFromException,
} from "@/lib/fetch-error";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

export default function SettingsPage() {
  const [loaded, setLoaded] = useState<string>("");
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);

  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null);

  useEffect(() => {
    const url = "/api/settings";
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          setError({
            headline: "Couldn't load settings",
            details: await fetchErrorFromResponse(res, url),
          });
          return;
        }
        const data = (await res.json()) as { stationAddress: string };
        setLoaded(data.stationAddress);
        setValue(data.stationAddress);
      } catch (err) {
        setError({
          headline: "Couldn't load settings",
          details: fetchErrorFromException(err, url),
        });
      }
    })();
  }, []);

  const trimmed = value.trim();
  const canSave = trimmed !== "" && trimmed !== loaded.trim() && !saving;

  async function handleSave() {
    setSaving(true);
    setSavedJustNow(false);
    const url = "/api/settings";
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationAddress: trimmed }),
      });
      if (!res.ok) {
        setError({
          headline: "Couldn't save settings",
          details: await fetchErrorFromResponse(res, url),
        });
        setSaving(false);
        return;
      }
      const data = (await res.json()) as { stationAddress: string };
      setLoaded(data.stationAddress);
      setValue(data.stationAddress);
      setSavedJustNow(true);
      setError(null);
    } catch (err) {
      setError({
        headline: "Couldn't save settings",
        details: fetchErrorFromException(err, url),
      });
    } finally {
      setSaving(false);
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
        updated: number;
        failed: number;
        skipped: number;
        total: number;
      };
      setRecomputeResult(
        `Recomputed ${data.updated} of ${data.total} apartments` +
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

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      <section className="space-y-2">
        <Label htmlFor="station-address">Train station address</Label>
        <Input
          id="station-address"
          aria-label="Station address"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSavedJustNow(false);
          }}
        />
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {savedJustNow && (
            <span className="text-sm text-muted-foreground">Saved.</span>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Recompute distances</h2>
        <p className="text-sm text-muted-foreground">
          Rebuild bike and transit minutes for every apartment using the current
          station address.
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRecompute}
            disabled={recomputing}
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
    </div>
  );
}
