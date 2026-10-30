import Link from "next/link";
import { useRef } from "react";
import { useTranslations } from "next-intl";
import {
  ExternalLink,
  FilePlus,
  FileText,
  FileUp,
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
  // Processed, with a PDF or an address to process again (#413).
  canReprocess: boolean;
  listingUrl: string | null;
  /** The household map with this apartment highlighted; null when it has no coordinates. */
  mapHref: string | null;
  editing: boolean;
  reprocessing: boolean;
  attaching: boolean;
  deleting: boolean;
  onEdit: () => void;
  onViewPdf: () => void;
  onReprocess: () => void;
  // Attaches the PDF chosen, or replaces the one there (#413).
  onAttachPdf: (file: File) => void;
  onDelete: () => void;
}

// On a phone each action is a square icon in one row (#407): the icons share
// the row's width, at most 44px each, so all seven fit on a narrow phone
// instead of the last one wrapping (#436). From `sm` up the word shows
// beside it. The word is always there for a screen reader, and `title`
// names the icon on hover.
const ACTION =
  "aspect-square h-auto min-w-0 max-w-11 flex-1 basis-0 p-0 sm:aspect-auto sm:h-7 sm:max-w-none sm:flex-none sm:basis-auto sm:w-auto sm:px-2.5";

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
  canReprocess,
  listingUrl,
  mapHref,
  editing,
  reprocessing,
  attaching,
  deleting,
  onEdit,
  onViewPdf,
  onReprocess,
  onAttachPdf,
  onDelete,
}: ApartmentActionsProps) {
  const t = useTranslations("apartments.actions");
  const tDetail = useTranslations("apartments.detail");
  const fileInput = useRef<HTMLInputElement>(null);
  const attachLabel = attaching ? t("attaching") : hasPdf ? t("replacePdf") : t("attachPdf");
  return (
    <div className="flex flex-nowrap items-center gap-1.5 sm:flex-wrap sm:gap-2">
      {hasPdf && (
        // A button, not a link: the stored file is ciphertext, so the page
        // decrypts it and opens a blob: URL.
        <Button variant="outline" size="sm" onClick={onViewPdf} title={t("viewPdf")} className={ACTION}>
          <Label icon={FileText} text={t("viewPdf")} />
        </Button>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        data-testid="attach-pdf-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so choosing the same file again still fires a change.
          e.target.value = "";
          if (file) onAttachPdf(file);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={attaching || reprocessing || editing}
        onClick={() => fileInput.current?.click()}
        title={attachLabel}
        className={ACTION}
      >
        <Label icon={hasPdf ? FileUp : FilePlus} text={attachLabel} />
      </Button>
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
        <Badge variant="secondary" title={t("urlMissing")} className={cn(ACTION, "justify-center gap-1 text-muted-foreground sm:h-auto")}>
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
        disabled={reprocessing || editing || !canReprocess}
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
