"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/star-rating";
import { WashingMachine } from "lucide-react";
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
  distanceBikeMin: number | null;
  distanceTransitMin: number | null;
  pdfUrl: string | null;
  listingUrl: string | null;
  ratings: Rating[];
}

const ratingCategories = [
  { key: "kitchen", label: "Kitchen" },
  { key: "balconies", label: "Balconies" },
  { key: "location", label: "Location" },
  { key: "floorplan", label: "Floorplan" },
  { key: "overallFeeling", label: "Overall feeling" },
] as const;

function getCookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function ApartmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [apartment, setApartment] = useState<ApartmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [myRating, setMyRating] = useState({
    kitchen: 0,
    balconies: 0,
    location: 0,
    floorplan: 0,
    overallFeeling: 0,
    comment: "",
  });
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState("");
  const [error, setError] = useState<ErrorState | null>(null);

  const loadApartment = useCallback(async () => {
    const url = `/api/apartments/${params.id}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setError({
          headline: "Couldn't load apartment",
          details: await fetchErrorFromResponse(res, url),
        });
        setLoading(false);
        return;
      }
      const data = await res.json();
      setApartment(data);
      setError(null);

      const name = getCookieValue("flatpare-name") ?? "";
      setUserName(name);

      const existing = data.ratings?.find(
        (r: Rating) => r.userName === name
      );
      if (existing) {
        setMyRating({
          kitchen: existing.kitchen,
          balconies: existing.balconies,
          location: existing.location,
          floorplan: existing.floorplan,
          overallFeeling: existing.overallFeeling,
          comment: existing.comment || "",
        });
      }

      setLoading(false);
    } catch (err) {
      setError({
        headline: "Couldn't load apartment",
        details: fetchErrorFromException(err, url),
      });
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadApartment();
  }, [loadApartment]);

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
      await loadApartment();
      setSaving(false);
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{apartment.name}</h1>
          {apartment.address && (
            <p className="text-muted-foreground">{apartment.address}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {apartment.pdfUrl && (
            <a
              href={apartment.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View PDF
            </a>
          )}
          {apartment.listingUrl ? (
            <a
              href={apartment.listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Original Listing
            </a>
          ) : (
            <Badge variant="secondary" className="text-muted-foreground">
              URL missing
            </Badge>
          )}
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={handleDelete}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>

      {error && (
        <ErrorDisplay headline={error.headline} details={error.details} />
      )}

      {/* Apartment metrics */}
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
        {apartment.distanceBikeMin && (
          <Badge variant="outline">{apartment.distanceBikeMin} min bike</Badge>
        )}
        {apartment.distanceTransitMin && (
          <Badge variant="outline">
            {apartment.distanceTransitMin} min transit
          </Badge>
        )}
      </div>

      <Separator />

      {/* My rating */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Rating ({userName})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ratingCategories.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label className="text-sm">{label}</Label>
              <StarRating
                value={myRating[key]}
                onChange={(v) =>
                  setMyRating((prev) => ({ ...prev, [key]: v }))
                }
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label>Comment</Label>
            <Textarea
              value={myRating.comment}
              onChange={(e) =>
                setMyRating((prev) => ({ ...prev, comment: e.target.value }))
              }
              placeholder="Notes about this apartment..."
              rows={3}
            />
          </div>
          <Button onClick={handleSaveRating} disabled={saving}>
            {saving ? "Saving..." : "Save Rating"}
          </Button>
        </CardContent>
      </Card>

      {/* Other ratings */}
      {otherRatings.map((rating) => (
        <Card key={rating.id}>
          <CardHeader>
            <CardTitle className="text-lg">
              {rating.userName}&apos;s Rating
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ratingCategories.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <StarRating
                  value={rating[key]}
                  readonly
                  size="sm"
                />
              </div>
            ))}
            {rating.comment && (
              <div className="rounded-md bg-muted p-3 text-sm">
                {rating.comment}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
