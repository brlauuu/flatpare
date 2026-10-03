import { Badge } from "@/components/ui/badge";
import type { UploadItem } from "./types";

export function StatusBadge({
  status,
  error,
  saved,
}: {
  status: UploadItem["status"];
  error?: string;
  saved?: boolean;
}) {
  if (saved) {
    return <Badge className="border-success bg-card text-success">Saved</Badge>;
  }

  switch (status) {
    case "queued":
      return <Badge variant="secondary">Queued</Badge>;
    case "uploading":
      return <Badge variant="secondary">Uploading...</Badge>;
    case "done":
      return <Badge className="bg-secondary text-secondary-foreground">Parsed</Badge>;
    case "error":
      return (
        <Badge variant="destructive" title={error}>
          Error
        </Badge>
      );
  }
}
