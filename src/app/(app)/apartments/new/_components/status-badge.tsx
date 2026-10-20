import { useTranslations } from "next-intl";
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
  const t = useTranslations("apartments.status");
  if (saved) {
    return <Badge className="border-success bg-card text-success">{t("saved")}</Badge>;
  }

  switch (status) {
    case "queued":
      return <Badge variant="secondary">{t("queued")}</Badge>;
    case "uploading":
      return <Badge variant="secondary">{t("uploading")}</Badge>;
    case "done":
      return <Badge className="bg-secondary text-secondary-foreground">{t("parsed")}</Badge>;
    case "error":
      return (
        <Badge variant="destructive" title={error}>
          {t("error")}
        </Badge>
      );
  }
}
