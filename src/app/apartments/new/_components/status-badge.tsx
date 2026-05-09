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
    return <Badge className="bg-green-100 text-green-700">Saved</Badge>;
  }

  switch (status) {
    case "queued":
      return <Badge variant="secondary">Queued</Badge>;
    case "uploading":
      return <Badge variant="secondary">Uploading...</Badge>;
    case "done":
      return <Badge className="bg-blue-100 text-blue-700">Parsed</Badge>;
    case "error":
      return (
        <Badge variant="destructive" title={error}>
          Error
        </Badge>
      );
  }
}
