import { useTranslations } from "next-intl";
import type React from "react";
import { AlertTriangle, Check, CheckCircle2, Circle, Hourglass } from "lucide-react";
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

// Added by hand or from a link, and not processed yet (#413).
export function NotProcessedBadge() {
  const t = useTranslations("apartments.badges");
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Hourglass className="h-3 w-3" />
      {t("notProcessed")}
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

// The tile shows the same three states as icons alone (#451); the words stay
// as the hover title and for screen readers. The list rows keep the badges.
function StatusIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span title={label} className="inline-flex h-6 w-6 items-center justify-center">
      {children}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function GoneIcon() {
  const t = useTranslations("apartments.badges");
  return (
    <StatusIcon label={t("gone")}>
      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
    </StatusIcon>
  );
}

export function NotProcessedIcon() {
  const t = useTranslations("apartments.badges");
  return (
    <StatusIcon label={t("notProcessed")}>
      <Hourglass className="h-5 w-5 text-muted-foreground" aria-hidden />
    </StatusIcon>
  );
}

export function RatedIcon({ myRating }: { myRating: number | null }) {
  const t = useTranslations("apartments.badges");
  if (myRating === null) {
    return (
      <StatusIcon label={t("notRated")}>
        <Circle className="h-6 w-6 text-muted-foreground" aria-hidden />
      </StatusIcon>
    );
  }
  return (
    <StatusIcon label={t("rated")}>
      <span data-rated className="flex h-6 w-6 items-center justify-center rounded-full bg-success">
        <Check className="h-4 w-4 text-card" strokeWidth={3} aria-hidden />
      </span>
    </StatusIcon>
  );
}
