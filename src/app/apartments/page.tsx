"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/star-rating";

interface ApartmentSummary {
  id: number;
  name: string;
  address: string | null;
  sizeM2: number | null;
  numRooms: number | null;
  rentChf: number | null;
  avgOverall: string | null;
  createdAt: string | null;
}

export default function ApartmentsPage() {
  const [apartments, setApartments] = useState<ApartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/apartments")
      .then((res) => res.json())
      .then((data) => {
        setApartments(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading apartments...</p>
      </div>
    );
  }

  if (apartments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">No apartments yet</p>
        <Link href="/apartments/new" className={buttonVariants()}>
          Upload your first listing
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Apartments</h1>
        <Link href="/apartments/new" className={buttonVariants()}>
          Upload New
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {apartments.map((apt) => (
          <Link key={apt.id} href={`/apartments/${apt.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between">
                  <h3 className="font-medium leading-tight">{apt.name}</h3>
                  {apt.avgOverall && (
                    <StarRating
                      value={Math.round(parseFloat(apt.avgOverall))}
                      readonly
                      size="sm"
                    />
                  )}
                </div>
                {apt.address && (
                  <p className="text-sm text-muted-foreground">{apt.address}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {apt.rentChf && (
                    <Badge variant="secondary">
                      CHF {apt.rentChf.toLocaleString()}
                    </Badge>
                  )}
                  {apt.sizeM2 && (
                    <Badge variant="secondary">{apt.sizeM2} m²</Badge>
                  )}
                  {apt.numRooms && (
                    <Badge variant="secondary">{apt.numRooms} rooms</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
