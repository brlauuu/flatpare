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
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-11 sm:h-7"
        disabled={prevId === null}
        onClick={() => {
          if (prevId !== null) onNavigate(prevId);
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("previous")}
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
        className="h-11 sm:h-7"
        disabled={nextId === null}
        onClick={() => {
          if (nextId !== null) onNavigate(nextId);
        }}
      >
        {t("next")}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
