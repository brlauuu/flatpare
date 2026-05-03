"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import { ApartmentMap } from "@/components/apartment-map";
import { ArrowLeft, ArrowRight, WashingMachine } from "lucide-react";
import { iconComponentFor } from "@/lib/location-icons";
import { ErrorDisplay } from "@/components/error-display";
import { cn } from "@/lib/utils";
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

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

interface Rating {
  id: number;
  userName: string;
  kitchen: number;
  balconies: number;
  location: number;
  floorplan: number;
  overallFeeling: number;
  comment: string;
}

interface ApartmentDetail {
  id: number;
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  numBathrooms: number | null;
  numBalconies: number | null;
  hasWashingMachine: boolean | null;
  rentChf: number | null;
  pdfUrl: string | null;
  listingUrl: string | null;
  summary: string | null;
  availableFrom: string | null;
  userEditedFields: string | null;
  shortCode: string | null;
  mapEmbedUrl: string | null;
  ratings: Rating[];
  distances: { locationId: number; bikeMin: number | null; transitMin: number | null }[];
}

interface LocationLite {
  id: number;
  label: string;
  icon: string;
  address: string;
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
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pager.prevId === null}
          onClick={() => {
            if (pager.prevId !== null) router.push(`/apartments/${pager.prevId}`);
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </Button>
        {pager.position !== null && pager.total > 0 && (
          <span className="text-sm text-muted-foreground">
            {pager.position} of {pager.total}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pager.nextId === null}
          onClick={() => {
            if (pager.nextId !== null) router.push(`/apartments/${pager.nextId}`);
          }}
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {apartment.pdfUrl && (
            <a
              href={apartment.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full sm:w-auto"
              )}
            >
              View PDF
            </a>
          )}
          {apartment.listingUrl ? (
            <a
              href={apartment.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "w-full sm:w-auto"
              )}
            >
              Original Listing
            </a>
          ) : (
            <Badge
              variant="secondary"
              className="w-full justify-center text-muted-foreground sm:w-auto sm:justify-start"
            >
              URL missing
            </Badge>
          )}
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={startEdit}
              className="w-full sm:w-auto"
            >
              Edit
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={reprocessing || editing || !apartment.pdfUrl}
            onClick={handleReprocess}
            className="w-full sm:w-auto"
          >
            {reprocessing ? "Reprocessing..." : "Reprocess"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting || editing}
            onClick={handleDelete}
            className="w-full sm:w-auto"
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
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
        <div className="flex flex-wrap gap-2">
          {apartment.rentChf && (
            <Badge variant="secondary">
              CHF {apartment.rentChf.toLocaleString()}/mo
            </Badge>
          )}
          {apartment.sizeM2 && (
            <Badge variant="secondary">{apartment.sizeM2} m²</Badge>
          )}
          {apartment.numRooms && (
            <Badge variant="secondary">{apartment.numRooms} rooms</Badge>
          )}
          {apartment.numBathrooms != null && (
            <Badge variant="secondary">{apartment.numBathrooms} bath</Badge>
          )}
          {apartment.numBalconies != null && (
            <Badge variant="secondary">
              {apartment.numBalconies} balcon{apartment.numBalconies !== 1 ? "ies" : "y"}
            </Badge>
          )}
          <Badge
            variant="secondary"
            title={
              apartment.hasWashingMachine === true
                ? "Washing machine: yes"
                : apartment.hasWashingMachine === false
                  ? "Washing machine: no (or shared)"
                  : "Washing machine: unknown"
            }
            className="gap-1"
          >
            <WashingMachine className="h-3 w-3" />
            {apartment.hasWashingMachine === true
              ? "Yes"
              : apartment.hasWashingMachine === false
                ? "No"
                : "?"}
          </Badge>
        </div>
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

function DistanceSection({
  locations,
  distances,
  apartmentAddress,
}: {
  locations: LocationLite[];
  distances: { locationId: number; bikeMin: number | null; transitMin: number | null }[];
  apartmentAddress: string | null;
}) {
  const distancesByLoc = new Map(distances.map((d) => [d.locationId, d]));
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Distance to locations
      </h2>
      <div className="space-y-1.5">
        {locations.map((loc) => {
          const Icon = iconComponentFor(loc.icon);
          const d = distancesByLoc.get(loc.id);
          const bike = d?.bikeMin;
          const transit = d?.transitMin;
          const mapsUrl = apartmentAddress
            ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(apartmentAddress)}&destination=${encodeURIComponent(loc.address)}&travelmode=bicycling`
            : null;
          return (
            <div key={loc.id} className="flex items-center gap-3 text-sm">
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Bike directions to ${loc.label}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ) : (
                <Icon className="h-4 w-4 text-muted-foreground" aria-label={loc.label} />
              )}
              <span className="font-medium">{loc.label}</span>
              <span className="text-muted-foreground">
                {bike != null ? `${bike} min bike` : "— bike"}
                {" · "}
                {transit != null ? `${transit} min transit` : "— transit"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
