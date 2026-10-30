import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PagerNavProps {
  prevId: string | null;
  nextId: string | null;
  position: number | null;
  total: number;
  onNavigate: (id: string) => void;
}

export function ApartmentPagerNav({
  prevId,
  nextId,
  position,
  total,
  onNavigate,
}: PagerNavProps) {
  const t = useTranslations("apartments.pager");
  // Arrows only (#407, #452): the words are the hover title and are always
  // there for a screen reader.
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 w-11 p-0 sm:h-8 sm:w-8"
        title={t("previous")}
        disabled={prevId === null}
        onClick={() => {
          if (prevId !== null) onNavigate(prevId);
        }}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        <span className="sr-only">{t("previous")}</span>
      </Button>
      {position !== null && total > 0 && (
        <span className="text-sm text-muted-foreground">
          {t("position", { position, total })}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 w-11 p-0 sm:h-8 sm:w-8"
        title={t("next")}
        disabled={nextId === null}
        onClick={() => {
          if (nextId !== null) onNavigate(nextId);
        }}
      >
        <span className="sr-only">{t("next")}</span>
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
