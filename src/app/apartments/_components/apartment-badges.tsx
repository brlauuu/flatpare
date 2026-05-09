import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function GoneBadge() {
  return (
    <Badge
      variant="secondary"
      className="gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
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
        className="gap-1 border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
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
