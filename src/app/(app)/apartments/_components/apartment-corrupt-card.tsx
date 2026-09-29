"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import type { ApartmentView } from "@/lib/household-data/types";

// Shared placeholder for a row whose envelope failed to open or validate.
// Matches the wording and affordance the apartment detail page already uses
// for the same state, so the list and detail pages agree with each other.
function useCorruptDelete(id: string) {
  const { deleteApartment } = useHouseholdData();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this apartment? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteApartment(id);
    } catch {
      setDeleting(false);
    }
  }

  return { deleting, handleDelete };
}

export function ApartmentCorruptCard({ apt }: { apt: ApartmentView }) {
  const { deleting, handleDelete } = useCorruptDelete(apt.id);
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="text-sm font-medium">This apartment could not be decrypted</p>
        </div>
        <p className="text-xs text-muted-foreground">
          The stored record could not be opened with the household key. It can only be
          deleted.
        </p>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={deleting}
          onClick={handleDelete}
        >
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function ApartmentCorruptRow({ apt }: { apt: ApartmentView }) {
  const { deleting, handleDelete } = useCorruptDelete(apt.id);
  return (
    <div className="flex items-center gap-3 border-destructive/30 bg-destructive/5 px-4 py-3">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-destructive">
          This apartment could not be decrypted
        </p>
        <p className="truncate text-xs text-muted-foreground">
          The stored record could not be opened with the household key. It can only be
          deleted.
        </p>
      </div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={deleting}
        onClick={handleDelete}
      >
        {deleting ? "Deleting..." : "Delete"}
      </Button>
    </div>
  );
}
