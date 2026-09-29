"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import { ApartmentLocationMap } from "@/components/apartment-location-map";
import { ErrorDisplay } from "@/components/error-display";
import {
  formFromApartment,
  formFromExtracted,
  formToFields,
  type ApartmentForm,
} from "@/components/apartment-form-fields";
import { ApartmentEditForm } from "@/components/apartment-edit-form";
import {
  MyRatingPanel,
  OtherRatingPanel,
  type RatingState,
} from "@/components/apartment-rating-panel";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { downloadPdf } from "@/components/household-data/pdf-files";
import { parsePdf } from "@/components/household-data/process-client";
import { type ErrorDetails, errorDetailsFromException } from "@/lib/fetch-error";
import { applyExtraction, mergeUserEdit } from "@/lib/edited-fields";
import { useApartmentPager } from "@/components/household-data/use-apartment-pager";
import { setUnsavedRating } from "@/lib/unsaved-changes";
import { formatSwissDate } from "@/lib/iso-date";
import type { RatingView } from "@/lib/household-data/types";
import { ApartmentPagerNav } from "./_components/apartment-pager-nav";
import { ApartmentActions } from "./_components/apartment-actions";
import { ApartmentMetricBadges } from "./_components/apartment-metric-badges";
import { DistanceSection } from "./_components/distance-section";

interface ErrorState {
  headline: string;
  details?: ErrorDetails;
}

const EMPTY_RATING: RatingState = {
  kitchen: 0,
  balconies: 0,
  location: 0,
  floorplan: 0,
  overallFeeling: 0,
  comment: "",
};

function snapshotOf(rating: RatingView | null): RatingState {
  return rating
    ? {
        kitchen: rating.kitchen,
        balconies: rating.balconies,
        location: rating.location,
        floorplan: rating.floorplan,
        overallFeeling: rating.overallFeeling,
        comment: rating.comment || "",
      }
    : EMPTY_RATING;
}

function isSameRating(a: RatingState, b: RatingState): boolean {
  return (
    a.kitchen === b.kitchen &&
    a.balconies === b.balconies &&
    a.location === b.location &&
    a.floorplan === b.floorplan &&
    a.overallFeeling === b.overallFeeling &&
    a.comment === b.comment
  );
}

export default function ApartmentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const {
    status,
    error: loadError,
    apartments,
    locations,
    identity,
    dataKey,
    updateApartment,
    deleteApartment,
    rateApartment,
  } = useHouseholdData();
  const pager = useApartmentPager(id);
  const apartment = apartments.find((a) => a.id === id) ?? null;

  const [deleting, setDeleting] = useState(false);
  const [myRating, setMyRating] = useState<RatingState>(EMPTY_RATING);
  const [cleanRating, setCleanRating] = useState<RatingState>(EMPTY_RATING);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<ApartmentForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  // My stored rating, if any. The draft is re-seeded from it whenever the
  // stored copy changes (first load, after a save) — keyed on id + updatedAt
  // so typing a draft is not clobbered by unrelated store updates. Adjusted
  // during render (React's documented pattern for "reset state when a prop
  // changes") rather than in an effect, which would set state synchronously
  // on every render of that effect and trigger a cascading extra render.
  const storedRating = apartment?.ratings.find((r) => r.userId === identity.userId) ?? null;
  const storedRatingStamp = storedRating?.updatedAt ?? null;
  const ratingResetKey = `${id}:${storedRatingStamp ?? ""}`;
  const [seenRatingKey, setSeenRatingKey] = useState<string | null>(null);
  if (seenRatingKey !== ratingResetKey) {
    setSeenRatingKey(ratingResetKey);
    const snapshot = snapshotOf(storedRating);
    setMyRating(snapshot);
    setCleanRating(snapshot);
  }

  const isRatingDirty = !isSameRating(myRating, cleanRating);
  useEffect(() => {
    setUnsavedRating(isRatingDirty);
    return () => setUnsavedRating(false);
  }, [isRatingDirty]);

  async function handleDelete() {
    if (!confirm("Delete this apartment? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteApartment(id);
      router.push("/apartments");
    } catch (err) {
      setError({
        headline: "Couldn't delete apartment",
        details: errorDetailsFromException(err),
      });
      setDeleting(false);
    }
  }

  async function handleViewPdf() {
    if (!apartment?.pdf) return;
    try {
      const bytes = await downloadPdf(dataKey, identity.householdId, apartment.id, apartment.pdf);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener");
      // The tab has the bytes now; release the URL after it has had time to load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setError(null);
    } catch (err) {
      setError({ headline: "Couldn't open PDF", details: errorDetailsFromException(err) });
    }
  }

  async function handleReprocess() {
    if (!apartment?.pdf) return;
    const ok = window.confirm(
      "Reprocess this apartment? Fields you haven't edited will be refreshed from the PDF. Fields you've edited will stay."
    );
    if (!ok) return;
    setReprocessing(true);
    setError(null);
    try {
      const bytes = await downloadPdf(dataKey, identity.householdId, apartment.id, apartment.pdf);
      const { extracted } = await parsePdf(bytes, `${apartment.id}.pdf`);
      // Coerce through the form helpers so the extraction lands as typed
      // Apartment fields, then keep whatever the user edited by hand.
      const fields = formToFields(formFromExtracted(extracted));
      await updateApartment(apartment.id, (current) => applyExtraction(current, fields, extracted));
    } catch (err) {
      setError({
        headline: "Couldn't reprocess apartment",
        details: errorDetailsFromException(err),
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
    if (!editForm || !apartment) return;
    if (!editForm.name.trim()) {
      setError({ headline: "Name is required" });
      return;
    }
    setSavingEdit(true);
    const fields = formToFields(editForm);
    try {
      await updateApartment(apartment.id, (current) => mergeUserEdit(current, fields));
      setEditing(false);
      setEditForm(null);
      setSavingEdit(false);
    } catch (err) {
      setError({
        headline: "Couldn't save changes",
        details: errorDetailsFromException(err),
      });
      setSavingEdit(false);
    }
  }

  function handleCancelRating() {
    setMyRating(cleanRating);
  }

  async function handleSaveRating() {
    setSaving(true);
    try {
      await rateApartment(id, myRating);
      router.push("/apartments");
    } catch (err) {
      setError({
        headline: "Couldn't save rating",
        details: errorDetailsFromException(err),
      });
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8">
        <ErrorDisplay headline={loadError ?? "Couldn't load apartment"} />
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="py-8">
        <ErrorDisplay headline="Apartment not found" />
      </div>
    );
  }

  if (apartment.corrupt) {
    return (
      <div className="space-y-4 py-8">
        <ErrorDisplay
          headline="This apartment could not be decrypted"
          details={{
            message:
              "The stored record could not be opened with the household key. It can only be deleted.",
            timestamp: new Date().toISOString(),
          }}
        />
        {error && <ErrorDisplay headline={error.headline} details={error.details} />}
        <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    );
  }

  const otherRatings = apartment.ratings.filter((r) => r.userId !== identity.userId);

  return (
    <div className="space-y-6">
      <ApartmentPagerNav
        prevId={pager.prevId}
        nextId={pager.nextId}
        position={pager.position}
        total={pager.total}
        onNavigate={(nextId) => router.push(`/apartments/${nextId}`)}
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <ShortCode code={apartment.shortCode} size="lg" />
          <h1 className="text-2xl font-semibold">{apartment.name}</h1>
          {apartment.address && (
            <AddressLink address={apartment.address} className="text-muted-foreground" />
          )}
        </div>
        <ApartmentActions
          hasPdf={apartment.pdf !== null}
          listingUrl={apartment.listingUrl}
          editing={editing}
          reprocessing={reprocessing}
          deleting={deleting}
          onEdit={startEdit}
          onViewPdf={() => void handleViewPdf()}
          onReprocess={() => void handleReprocess()}
          onDelete={() => void handleDelete()}
        />
      </div>

      {apartment.summary && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm leading-relaxed">{apartment.summary}</p>
          </CardContent>
        </Card>
      )}

      {error && <ErrorDisplay headline={error.headline} details={error.details} />}

      {editing && editForm ? (
        <ApartmentEditForm
          form={editForm}
          saving={savingEdit}
          onChange={(field, value) =>
            setEditForm((prev) => (prev ? { ...prev, [field]: value } : prev))
          }
          onWashingMachineChange={(v) =>
            setEditForm((prev) => (prev ? { ...prev, hasWashingMachine: v } : prev))
          }
          onSave={() => void handleSaveEdit()}
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

      <ApartmentLocationMap
        latitude={apartment.latitude}
        longitude={apartment.longitude}
        label={apartment.shortCode ?? apartment.name}
      />

      <Separator />

      <MyRatingPanel
        userName={identity.userName}
        rating={myRating}
        saving={saving}
        dirty={isRatingDirty}
        onChange={setMyRating}
        onSave={() => void handleSaveRating()}
        onCancel={handleCancelRating}
      />

      {otherRatings.map((rating) => (
        <OtherRatingPanel key={rating.userId} rating={rating} />
      ))}
    </div>
  );
}
