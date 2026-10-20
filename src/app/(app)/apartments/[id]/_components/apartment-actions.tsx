import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ApartmentActionsProps {
  hasPdf: boolean;
  listingUrl: string | null;
  editing: boolean;
  reprocessing: boolean;
  deleting: boolean;
  onEdit: () => void;
  onViewPdf: () => void;
  onReprocess: () => void;
  onDelete: () => void;
}

export function ApartmentActions({
  hasPdf,
  listingUrl,
  editing,
  reprocessing,
  deleting,
  onEdit,
  onViewPdf,
  onReprocess,
  onDelete,
}: ApartmentActionsProps) {
  const t = useTranslations("apartments.actions");
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      {hasPdf && (
        // A button, not a link: the stored file is ciphertext, so the page
        // decrypts it and opens a blob: URL.
        <Button
          variant="outline"
          size="sm"
          onClick={onViewPdf}
          className="h-11 w-full sm:h-7 sm:w-auto"
        >
          {t("viewPdf")}
        </Button>
      )}
      {listingUrl ? (
        <a
          href={listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "h-11 w-full sm:h-7 sm:w-auto"
          )}
        >
          {t("originalListing")}
        </a>
      ) : (
        <Badge
          variant="secondary"
          className="w-full justify-center text-muted-foreground sm:w-auto sm:justify-start"
        >
          {t("urlMissing")}
        </Badge>
      )}
      {!editing && (
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="h-11 w-full sm:h-7 sm:w-auto"
        >
          {t("edit")}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={reprocessing || editing || !hasPdf}
        onClick={onReprocess}
        className="h-11 w-full sm:h-7 sm:w-auto"
      >
        {reprocessing ? t("reprocessing") : t("reprocess")}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={deleting || editing}
        onClick={onDelete}
        className="h-11 w-full sm:h-7 sm:w-auto"
      >
        {deleting ? t("deleting") : t("delete")}
      </Button>
    </div>
  );
}
