"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import { ErrorDisplay } from "@/components/error-display";
import {
  formFromApartment,
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
import type { ErrorDetails } from "@/lib/fetch-error";
import { mergeUserEdit } from "@/lib/edited-fields";
import { useApartmentPager } from "@/components/household-data/use-apartment-pager";
import { useStoreErrorDetails } from "@/components/household-data/use-store-error-details";
import { setUnsavedRating } from "@/lib/unsaved-changes";
import { formatSwissDate } from "@/lib/iso-date";
import type { RatingView } from "@/lib/household-data/types";
import { ApartmentPagerNav } from "./_components/apartment-pager-nav";
import { ApartmentActions } from "./_components/apartment-actions";
import { ApartmentMetricBadges } from "./_components/apartment-metric-badges";
import { RatingSummary } from "../_components/apartment-badges";
import { DistanceSection } from "./_components/distance-section";
import { ProcessingNotice } from "./_components/processing-notice";
import { PdfTooLargeNotice } from "@/components/pdf-too-large-notice";
import { useApartmentProcessing } from "./_components/use-apartment-processing";
import { showOnMapHref } from "./_components/show-on-map";
import { useCodeLettersError } from "./_components/use-code-letters-error";
import { lettersOf, withLetters } from "@/lib/household-data/short-code";

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
  const t = useTranslations("apartments.detail");
  const tc = useTranslations("apartments.corrupt");
  const errorDetails = useStoreErrorDetails();
  const {
    status,
    error: loadError,
    apartments,
    locations,
    identity,
    dataKey,
    credits,
    enrichmentError,
    updateApartment,
    deleteApartment,
    rateApartment,
    limits,
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
  const [editLetters, setEditLetters] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const codeLettersError = useCodeLettersError(apartments, apartment, editLetters);
  const { processing, reprocessing, attaching, tooLarge, process, reprocess, attach } = useApartmentProcessing(
    apartment,
    () => setError(null),
    (headline, err) => setError({ headline, details: errorDetails(err) })
  );

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
    if (!confirm(tc("deleteConfirm"))) return;
    setDeleting(true);
    try {
      await deleteApartment(id);
      router.push("/apartments");
    } catch (err) {
      setError({
        headline: t("deleteFailed"),
        details: errorDetails(err),
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
      setError({ headline: t("pdfOpenFailed"), details: errorDetails(err) });
    }
  }

  function startEdit() {
    if (!apartment) return;
    setEditForm(formFromApartment(apartment));
    setEditLetters(lettersOf(apartment.shortCode) ?? "");
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
      setError({ headline: t("nameRequired") });
      return;
    }
    if (codeLettersError !== null) return;
    setSavingEdit(true);
    const fields = formToFields(editForm);
    const letters = editLetters;
    try {
      await updateApartment(apartment.id, (current) => {
        const edited = mergeUserEdit(current, fields);
        return letters === "" ? edited : withLetters(edited, letters);
      });
      setEditing(false);
      setEditForm(null);
      setSavingEdit(false);
    } catch (err) {
      setError({
        headline: t("saveFailed"),
        details: errorDetails(err),
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
        headline: t("ratingSaveFailed"),
        details: errorDetails(err),
      });
      setSaving(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8">
        <ErrorDisplay headline={loadError ?? t("loadError")} />
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="py-8">
        <ErrorDisplay headline={t("notFound")} />
      </div>
    );
  }

  if (apartment.corrupt) {
    return (
      <div className="space-y-4 py-8">
        <ErrorDisplay
          headline={tc("title")}
          details={{
            message: tc("body"),
            timestamp: new Date().toISOString(),
          }}
        />
        {error && <ErrorDisplay headline={error.headline} details={error.details} />}
        <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
          {deleting ? tc("deleting") : tc("delete")}
        </Button>
      </div>
    );
  }

  const otherRatings = apartment.ratings.filter((r) => r.userId !== identity.userId);

  return (
    <div className="space-y-6">
      {/* From `sm` up one row (#452): the pager, the code and my rating, the
          actions as icons on the right; the title under it at full width. On
          a phone the same pieces wrap, in the order code, title, actions. */}
      <div data-apartment-header className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-y-4">
        <ApartmentPagerNav
          prevId={pager.prevId}
          nextId={pager.nextId}
          position={pager.position}
          total={pager.total}
          onNavigate={(nextId) => router.push(`/apartments/${nextId}`)}
        />
        <div data-apartment-code className="flex items-center gap-2">
          <ShortCode code={apartment.shortCode} size="lg" />
          <RatingSummary avg={apartment.avgOverall} mine={apartment.myRating} />
        </div>
        <div className="order-last mt-1 basis-full sm:order-none sm:mt-0 sm:ml-auto sm:basis-auto">
          <ApartmentActions
            hasPdf={apartment.pdf !== null}
            canReprocess={apartment.processed && (apartment.pdf !== null || apartment.address !== null)}
            listingUrl={apartment.listingUrl}
            mapHref={showOnMapHref(apartment)}
            editing={editing}
            reprocessing={reprocessing}
            attaching={attaching}
            deleting={deleting}
            onEdit={startEdit}
            onViewPdf={() => void handleViewPdf()}
            onReprocess={() => void reprocess()}
            onAttachPdf={(file) => void attach(file)}
            onDelete={() => void handleDelete()}
          />
        </div>
        <div className="basis-full space-y-1">
          <h1 className="title-page">{apartment.name}</h1>
          {apartment.address && (
            <AddressLink address={apartment.address} className="text-muted-foreground" />
          )}
        </div>
      </div>

      <ProcessingNotice
        apartment={apartment}
        failed={enrichmentError[apartment.id] !== undefined}
        credits={credits}
        processing={processing}
        onProcess={() => void process()}
      />

      {tooLarge && <PdfTooLargeNotice maxBytes={limits.pdfReadMaxBytes} />}

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
          letters={editLetters}
          lettersError={codeLettersError}
          onLettersChange={setEditLetters}
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
          {t("availableFrom", { date: formatSwissDate(apartment.availableFrom) })}
        </div>
      )}

      {locations.length > 0 && (
        <DistanceSection
          locations={locations}
          distances={apartment.distances}
          apartmentAddress={apartment.address}
          addressChanged={apartment.addressChanged}
        />
      )}

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
