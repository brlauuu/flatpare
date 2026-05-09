import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortCode } from "@/components/short-code";
import { AddressLink } from "@/components/address-link";
import type { ApartmentWithRatings } from "./compare-types";

export function CompareColumnHeader({
  apt,
  onHide,
}: {
  apt: ApartmentWithRatings;
  onHide: (id: number) => void;
}) {
  return (
    <th className="min-w-[160px] px-4 py-3 text-left font-medium">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <a
              href={`/apartments/${apt.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold hover:underline"
            >
              {apt.name}
            </a>
            {apt.pdfUrl && (
              <a
                href={apt.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View PDF for ${apt.name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <FileText className="h-3.5 w-3.5" />
              </a>
            )}
            {apt.listingUrl && (
              <a
                href={apt.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Original listing for ${apt.name}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <ShortCode code={apt.shortCode} />
          {apt.address && (
            <AddressLink
              address={apt.address}
              className="text-xs font-normal text-muted-foreground"
            />
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Hide ${apt.name}`}
          className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
          onClick={() => onHide(apt.id)}
        >
          ✕
        </Button>
      </div>
    </th>
  );
}
