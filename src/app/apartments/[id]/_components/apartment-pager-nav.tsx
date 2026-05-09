import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PagerNavProps {
  prevId: number | null;
  nextId: number | null;
  position: number | null;
  total: number;
  onNavigate: (id: number) => void;
}

export function ApartmentPagerNav({
  prevId,
  nextId,
  position,
  total,
  onNavigate,
}: PagerNavProps) {
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={prevId === null}
        onClick={() => {
          if (prevId !== null) onNavigate(prevId);
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        Previous
      </Button>
      {position !== null && total > 0 && (
        <span className="text-sm text-muted-foreground">
          {position} of {total}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={nextId === null}
        onClick={() => {
          if (nextId !== null) onNavigate(nextId);
        }}
      >
        Next
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
