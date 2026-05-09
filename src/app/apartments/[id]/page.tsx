"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import { ApartmentMap } from "@/components/apartment-map";
import { ErrorDisplay } from "@/components/error-display";
import {
  formFromApartment,
  formToPayload,
  type ApartmentForm,
} from "@/components/apartment-form-fields";
import { ApartmentEditForm } from "@/components/apartment-edit-form";
import {
  MyRatingPanel,
  OtherRatingPanel,
} from "@/components/apartment-rating-panel";
import {
  type ErrorDetails,
  fetchErrorFromResponse,
  fetchErrorFromException,
} from "@/lib/fetch-error";
import { useApartmentPager } from "@/lib/use-apartment-pager";
import { setUnsavedRating } from "@/lib/unsaved-changes";
import { formatSwissDate } from "@/lib/iso-date";
import { ApartmentPagerNav } from "./_components/apartment-pager-nav";
import { ApartmentActions } from "./_components/apartment-actions";
import { ApartmentMetricBadges } from "./_components/apartment-metric-badges";
import { DistanceSection } from "./_components/distance-section";
import type {
  ApartmentDetail,
  LocationLite,
} from "./_components/types";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

function getCookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function ApartmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pager = useApartmentPager(Number(params.id));
  const [apartment, setApartment] = useState<ApartmentDetail | null>(null);
  const [locations, setLocations] = useState<LocationLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const EMPTY_RATING = {
    kitchen: 0,
    balconies: 0,
    location: 0,
    floorplan: 0,
    overallFeeling: 0,
    comment: "",
  };
  const [myRating, setMyRating] = useState(EMPTY_RATING);
  const [cleanRating, setCleanRating] = useState(EMPTY_RATING);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState("");
  const [error, setError] = useState<ErrorState | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<ApartmentForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  // Shared applier so both the initial effect and event-driven reloads
  // converge on the same state updates.
  function applyApartmentData(data: ApartmentDetail) {
    setApartment(data);
    setError(null);
    const name = getCookieValue("flatpare-name") ?? "";
    setUserName(name);
    const existing = data.ratings?.find((r) => r.userName === name);
    const snapshot = existing
      ? {
          kitchen: existing.kitchen,
          balconies: existing.balconies,
          location: existing.location,
          floorplan: existing.floorplan,
          overallFeeling: existing.overallFeeling,
          comment: existing.comment || "",
        }
      : EMPTY_RATING;
    setMyRating(snapshot);
    setCleanRating(snapshot);
  }

  async function reloadApartment() {
    const url = `/api/apartments/${params.id}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setError({
          headline: "Couldn't load apartment",
          details: await fetchErrorFromResponse(res, url),
        });
        return;
      }
      applyApartmentData(await res.json());
    } catch (err) {
      setError({
        headline: "Couldn't load apartment",
        details: fetchErrorFromException(err, url),
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    const url = `/api/apartments/${params.id}`;
    void (async () => {
      try {
        const [res, locRes] = await Promise.all([
          fetch(url),
          fetch("/api/locations"),
        ]);
        if (cancelled) return;
        if (!res.ok) {
          setError({
            headline: "Couldn't load apartment",
            details: await fetchErrorFromResponse(res, url),
          });
          setLoading(false);
          return;
        }
        const data = (await res.json()) as ApartmentDetail;
        if (cancelled) return;
        applyApartmentData(data);
        if (locRes.ok) {
          setLocations((await locRes.json()) as LocationLite[]);
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError({
          headline: "Couldn't load apartment",
          details: fetchErrorFromException(err, url),
        });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    const dirty =
      myRating.kitchen !== cleanRating.kitchen ||
      myRating.balconies !== cleanRating.balconies ||
      myRating.location !== cleanRating.location ||
      myRating.floorplan !== cleanRating.floorplan ||
      myRating.overallFeeling !== cleanRating.overallFeeling ||
      myRating.comment !== cleanRating.comment;
    setUnsavedRating(dirty);
    return () => setUnsavedRating(false);
  }, [myRating, cleanRating]);

  useEffect(() => {
    function handler() {
      reloadApartment();
    }
    window.addEventListener("flatpare-user-changed", handler);
    return () => window.removeEventListener("flatpare-user-changed", handler);
    // reloadApartment is defined in this component scope; keeping deps empty is
    // intentional (inline closure picks up the latest definition per render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete() {
    if (!confirm("Delete this apartment? This cannot be undone.")) return;
    setDeleting(true);
    const url = `/api/apartments/${params.id}`;
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        setError({
          headline: "Couldn't delete apartment",
          details: await fetchErrorFromResponse(res, url),
        });
        setDeleting(false);
        return;
      }
      router.push("/apartments");
    } catch (err) {
      setError({
        headline: "Couldn't delete apartment",
        details: fetchErrorFromException(err, url),
      });
      setDeleting(false);
    }
  }

  async function handleReprocess() {
    if (!apartment?.pdfUrl) return;
    const ok = window.confirm(
      "Reprocess this apartment? Fields you haven't edited will be refreshed from the PDF. Fields you've edited will stay."
    );
    if (!ok) return;
    setReprocessing(true);
    const url = `/api/apartments/${params.id}/reprocess`;
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        setError({
          headline: "Couldn't reprocess apartment",
          details: await fetchErrorFromResponse(res, url),
        });
        setReprocessing(false);
        return;
      }
      await reloadApartment();
    } catch (err) {
      setError({
        headline: "Couldn't reprocess apartment",
        details: fetchErrorFromException(err, url),
      });
    } finally {
      setReprocessing(false);
    }
  }

  function startEdit() {
    if (!apartment) return;
    setEditForm(formFromApartment(apartment));
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm(null);
  }

  async function handleSaveEdit() {
    if (!editForm) return;
    if (!editForm.name.trim()) {
      setError({ headline: "Name is required" });
      return;
    }
    setSavingEdit(true);
    const url = `/api/apartments/${params.id}`;
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToPayload(editForm)),
      });
      if (!res.ok) {
        setError({
          headline: "Couldn't save changes",
          details: await fetchErrorFromResponse(res, url),
        });
        setSavingEdit(false);
        return;
      }
      await reloadApartment();
      setEditing(false);
      setEditForm(null);
      setSavingEdit(false);
    } catch (err) {
      setError({
        headline: "Couldn't save changes",
        details: fetchErrorFromException(err, url),
      });
      setSavingEdit(false);
    }
  }

  function handleCancelRating() {
    setMyRating(cleanRating);
  }

  const isRatingDirty =
    myRating.kitchen !== cleanRating.kitchen ||
    myRating.balconies !== cleanRating.balconies ||
    myRating.location !== cleanRating.location ||
    myRating.floorplan !== cleanRating.floorplan ||
    myRating.overallFeeling !== cleanRating.overallFeeling ||
    myRating.comment !== cleanRating.comment;

  async function handleSaveRating() {
    setSaving(true);
    const url = `/api/apartments/${params.id}/ratings`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(myRating),
      });
      if (!res.ok) {
        setError({
          headline: "Couldn't save rating",
          details: await fetchErrorFromResponse(res, url),
        });
        setSaving(false);
        return;
      }
      router.push("/apartments");
    } catch (err) {
      setError({
        headline: "Couldn't save rating",
        details: fetchErrorFromException(err, url),
      });
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error && !apartment) {
    return (
      <div className="py-8">
        <ErrorDisplay headline={error.headline} details={error.details} />
      </div>
    );
  }

  if (!apartment) {
    return null;
  }

  const otherRatings = apartment.ratings.filter(
    (r) => r.userName !== userName
  );

  return (
    <div className="space-y-6">
      <ApartmentPagerNav
        prevId={pager.prevId}
        nextId={pager.nextId}
        position={pager.position}
        total={pager.total}
        onNavigate={(id) => router.push(`/apartments/${id}`)}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <ShortCode code={apartment.shortCode} size="lg" />
          <h1 className="text-2xl font-semibold">{apartment.name}</h1>
          {apartment.address && (
            <AddressLink
              address={apartment.address}
              className="text-muted-foreground"
            />
          )}
        </div>
        <ApartmentActions
          pdfUrl={apartment.pdfUrl}
          listingUrl={apartment.listingUrl}
          editing={editing}
          reprocessing={reprocessing}
          deleting={deleting}
          onEdit={startEdit}
          onReprocess={handleReprocess}
          onDelete={handleDelete}
        />
      </div>

      {apartment.summary && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm leading-relaxed">{apartment.summary}</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <ErrorDisplay headline={error.headline} details={error.details} />
      )}

      {/* Apartment metrics or edit form */}
      {editing && editForm ? (
        <ApartmentEditForm
          form={editForm}
          saving={savingEdit}
          onChange={(field, value) =>
            setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev))
          }
          onWashingMachineChange={(v) =>
            setEditForm((prev) =>
              prev ? { ...prev, hasWashingMachine: v } : prev
            )
          }
          onSave={handleSaveEdit}
          onCancel={cancelEdit}
        />
      ) : (
        <ApartmentMetricBadges apartment={apartment} />
      )}

      {apartment.availableFrom && (
        <div className="text-sm text-muted-foreground">
          Available from: {formatSwissDate(apartment.availableFrom)}
        </div>
      )}

      {locations.length > 0 && (
        <DistanceSection
          locations={locations}
          distances={apartment.distances}
          apartmentAddress={apartment.address}
        />
      )}

      <ApartmentMap embedUrl={apartment.mapEmbedUrl} title={apartment.name} />

      <Separator />

      <MyRatingPanel
        userName={userName}
        rating={myRating}
        saving={saving}
        dirty={isRatingDirty}
        onChange={setMyRating}
        onSave={handleSaveRating}
        onCancel={handleCancelRating}
      />

      {otherRatings.map((rating) => (
        <OtherRatingPanel key={rating.id} rating={rating} />
      ))}
    </div>
  );
}

