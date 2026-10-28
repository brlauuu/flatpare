import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ExternalLink,
  FileText,
  Link2Off,
  Map as MapIcon,
  Pencil,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ApartmentActionsProps {
  hasPdf: boolean;
  listingUrl: string | null;
  /** The household map with this apartment highlighted; null when it has no coordinates. */
  mapHref: string | null;
  editing: boolean;
  reprocessing: boolean;
  deleting: boolean;
  onEdit: () => void;
  onViewPdf: () => void;
  onReprocess: () => void;
  onDelete: () => void;
}

// On a phone each action is a square icon in one row (#407); from `sm` up
// the word shows beside it. The word is always there for a screen reader,
// and `title` names the icon on hover.
const ACTION = "h-11 w-11 p-0 sm:h-7 sm:w-auto sm:px-2.5";

function Label({ icon: Icon, text, spin = false }: { icon: LucideIcon; text: string; spin?: boolean }) {
  return (
    <>
      <Icon className={cn("h-4 w-4", spin && "animate-spin")} aria-hidden />
      <span className="sr-only sm:not-sr-only">{text}</span>
    </>
  );
}

export function ApartmentActions({
  hasPdf,
  listingUrl,
  mapHref,
  editing,
  reprocessing,
  deleting,
  onEdit,
  onViewPdf,
  onReprocess,
  onDelete,
}: ApartmentActionsProps) {
  const t = useTranslations("apartments.actions");
  const tDetail = useTranslations("apartments.detail");
  return (
    <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
      {hasPdf && (
        // A button, not a link: the stored file is ciphertext, so the page
        // decrypts it and opens a blob: URL.
        <Button variant="outline" size="sm" onClick={onViewPdf} title={t("viewPdf")} className={ACTION}>
          <Label icon={FileText} text={t("viewPdf")} />
        </Button>
      )}
      {listingUrl ? (
        <a
          href={listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={t("originalListing")}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), ACTION)}
        >
          <Label icon={ExternalLink} text={t("originalListing")} />
        </a>
      ) : (
        <Badge variant="secondary" title={t("urlMissing")} className="h-11 gap-1 text-muted-foreground sm:h-auto">
          <Label icon={Link2Off} text={t("urlMissing")} />
        </Badge>
      )}
      {mapHref && (
        <Link
          href={mapHref}
          title={tDetail("showOnMap")}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), ACTION)}
        >
          <Label icon={MapIcon} text={tDetail("showOnMap")} />
        </Link>
      )}
      {!editing && (
        <Button variant="outline" size="sm" onClick={onEdit} title={t("edit")} className={ACTION}>
          <Label icon={Pencil} text={t("edit")} />
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={reprocessing || editing || !hasPdf}
        onClick={onReprocess}
        title={t("reprocess")}
        className={ACTION}
      >
        <Label icon={RefreshCw} text={reprocessing ? t("reprocessing") : t("reprocess")} spin={reprocessing} />
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={deleting || editing}
        onClick={onDelete}
        title={t("delete")}
        className={ACTION}
      >
        <Label icon={Trash2} text={deleting ? t("deleting") : t("delete")} />
      </Button>
    </div>
  );
}
