import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function GoneBadge() {
  const t = useTranslations("apartments.badges");
  return (
    <Badge
      variant="secondary"
      className="gap-1 border-destructive bg-card text-destructive"
    >
      <AlertTriangle className="h-3 w-3" />
      {t("gone")}
    </Badge>
  );
}

export function RatedBadge({ myRating }: { myRating: number | null }) {
  const t = useTranslations("apartments.badges");
  if (myRating !== null) {
    return (
      <Badge
        variant="secondary"
        className="gap-1 border-success bg-card text-success"
      >
        <CheckCircle2 className="h-3 w-3" />
        {t("rated")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Circle className="h-3 w-3" />
      {t("notRated")}
    </Badge>
  );
}
