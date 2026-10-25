import Link from "next/link";
import { useTranslations } from "next-intl";
import { Map as MapIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The apartment page has no map of its own (#384): this opens the household
// map with the apartment highlighted among the others. Nothing to show for
// an apartment without coordinates.
export function ShowOnMapLink({ id, latitude, longitude }: { id: string; latitude: number | null; longitude: number | null }) {
  const t = useTranslations("apartments.detail");
  if (latitude === null || longitude === null) return null;
  return (
    <Link href={`/map?highlight=${encodeURIComponent(id)}`} className={cn(buttonVariants({ variant: "outline" }), "h-11 sm:h-9")}>
      <MapIcon className="h-4 w-4" />
      {t("showOnMap")}
    </Link>
  );
}
