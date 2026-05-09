import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ApartmentActionsProps {
  pdfUrl: string | null;
  listingUrl: string | null;
  editing: boolean;
  reprocessing: boolean;
  deleting: boolean;
  onEdit: () => void;
  onReprocess: () => void;
  onDelete: () => void;
}

export function ApartmentActions({
  pdfUrl,
  listingUrl,
  editing,
  reprocessing,
  deleting,
  onEdit,
  onReprocess,
  onDelete,
}: ApartmentActionsProps) {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full sm:w-auto"
          )}
        >
          View PDF
        </a>
      )}
      {listingUrl ? (
        <a
          href={listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "w-full sm:w-auto"
          )}
        >
          Original Listing
        </a>
      ) : (
        <Badge
          variant="secondary"
          className="w-full justify-center text-muted-foreground sm:w-auto sm:justify-start"
        >
          URL missing
        </Badge>
      )}
      {!editing && (
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="w-full sm:w-auto"
        >
          Edit
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={reprocessing || editing || !pdfUrl}
        onClick={onReprocess}
        className="w-full sm:w-auto"
      >
        {reprocessing ? "Reprocessing..." : "Reprocess"}
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={deleting || editing}
        onClick={onDelete}
        className="w-full sm:w-auto"
      >
        {deleting ? "Deleting..." : "Delete"}
      </Button>
    </div>
  );
}
