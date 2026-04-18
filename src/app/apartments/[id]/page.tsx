"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/star-rating";

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
  rentChf: number | null;
  distanceBikeMin: number | null;
  distanceTransitMin: number | null;
  pdfUrl: string | null;
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
  const [apartment, setApartment] = useState<ApartmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
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

  const loadApartment = useCallback(async () => {
    const res = await fetch(`/api/apartments/${params.id}`);
    const data = await res.json();
    setApartment(data);

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
  }, [params.id]);

  useEffect(() => {
    loadApartment();
  }, [loadApartment]);

  async function handleSaveRating() {
    setSaving(true);
    await fetch(`/api/apartments/${params.id}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(myRating),
    });
    await loadApartment();
    setSaving(false);
  }

  if (loading || !apartment) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
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
      </div>

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
