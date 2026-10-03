import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function GoneBadge() {
  return (
    <Badge
      variant="secondary"
      className="gap-1 border-destructive bg-card text-destructive"
    >
      <AlertTriangle className="h-3 w-3" />
      Gone
    </Badge>
  );
}

export function RatedBadge({ myRating }: { myRating: number | null }) {
  if (myRating !== null) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 border-success bg-card text-success"
      >
        <CheckCircle2 className="h-3 w-3" />
        Rated
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Circle className="h-3 w-3" />
      Not yet rated
    </Badge>
  );
}
