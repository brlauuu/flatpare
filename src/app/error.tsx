"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ErrorDisplay } from "@/components/error-display";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function ErrorBoundary({ error, unstable_retry }: ErrorBoundaryProps) {
  const t = useTranslations("errors.boundary");
  useEffect(() => {
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="title-page">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorDisplay
            headline={error.message || t("unexpected")}
            details={{
              message: error.message,
              stack: error.stack,
              url: error.digest ? `digest: ${error.digest}` : undefined,
              timestamp: new Date().toISOString(),
            }}
          />
          <Button onClick={() => unstable_retry()} className="w-full">
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
