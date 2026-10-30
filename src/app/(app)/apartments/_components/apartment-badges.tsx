import { useFormatter, useTranslations } from "next-intl";
import type React from "react";
import { AlertTriangle, CheckCircle2, Circle, Hourglass, Star } from "lucide-react";
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

// Everyone's average overall rating, mine in parentheses (#451): 4.3 (5),
// 4.3 (–) before I rate, a hollow star and a dash before anyone does. The
// sentence is the hover title and the screen-reader text.
export function RatingSummary({ avg, mine }: { avg: number | null; mine: number | null }) {
  const t = useTranslations("apartments.badges");
  const format = useFormatter();
  if (avg === null) {
    const label = t("noRatings");
    return (
      <span data-rating-summary title={label} className="inline-flex items-center gap-1 font-mono text-sm text-muted-foreground">
        <Star className="h-4 w-4" aria-hidden />
        <span aria-hidden>–</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }
  const avgText = format.number(avg, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const label =
    mine === null
      ? t("ratingSummaryNotMine", { avg: avgText })
      : t("ratingSummary", { avg: avgText, mine: format.number(mine) });
  return (
    <span data-rating-summary title={label} className="inline-flex items-center gap-1 font-mono text-sm">
      <Star className="h-4 w-4 fill-current text-primary" aria-hidden />
      <span aria-hidden>
        {avgText}{" "}
        <span className="text-muted-foreground">({mine === null ? "–" : format.number(mine)})</span>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
