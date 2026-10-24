"use client";

import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import {
  ExportFormatError,
  type ParsedExport,
  type RatingLine,
} from "@/lib/household-data/export-format";
import type { ImportReport } from "@/components/household-data/export-import";
import type { Credits } from "@/components/household-data/household-data-provider";
import type { Limits } from "@/lib/limits";

// Export and import (#191), on the Household page for every member. The
// export is the household's own backup — under E2EE the host cannot restore
// anything — so it is offered to everyone, with a plain warning that the
// file is not encrypted. Import appears only while the household is empty.
export function DataTransferSettings() {
  const t = useTranslations("household.data");
  const { status, apartments, locations } = useHouseholdData();
  const [report, setReport] = useState<ImportReport | null>(null);
  const empty = status === "ready" && apartments.length === 0 && locations.length === 0;

  return (
    <section className="space-y-4">
      <h2 className="title-section">{t("title")}</h2>
      <ExportPanel />
      {(empty || report) && (
        <div className="space-y-2">
          <h3 className="font-medium">{t("importTitle")}</h3>
          {report ? <ImportReportView report={report} /> : <ImportPanel onDone={setReport} />}
        </div>
      )}
    </section>
  );
}

function ExportPanel() {
  const t = useTranslations("household.data");
  const { status, exportHousehold } = useHouseholdData();
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    try {
      const { blob, fileName, missingPdfs } = await exportHousehold();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(missingPdfs > 0 ? t("exportedMissingPdfs", { count: missingPdfs }) : t("exported"));
    } catch {
      setMessage(t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t("exportBody")}</p>
      <p className="rounded-md border border-warning p-3 text-sm">{t("plaintextWarning")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          className="h-11 sm:h-8"
          onClick={() => void handleExport()}
          disabled={exporting || status !== "ready"}
        >
          <Download className="size-4" aria-hidden />
          {exporting ? t("exporting") : t("export")}
        </Button>
        {message && (
          <span role="status" className="text-sm text-muted-foreground">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations<"household.data">>;

// Why an import of `count` apartments cannot start, or null. Checked before
// anything is written, so a short balance never leaves half a household.
function blockedReason(t: Translate, count: number, limits: Limits, credits: Credits | null): string | null {
  if (limits.maxApartments !== null && count > limits.maxApartments) {
    return t("overCap", { count, max: limits.maxApartments });
  }
  if (credits !== null && count > credits.remaining) {
    return t("overCredits", { count, remaining: credits.remaining });
  }
  return null;
}

function useRatingLine(): RatingLine {
  const t = useTranslations("household.data");
  return ({ userName, data }) => {
    const score = (n: number) => (n > 0 ? t("score", { n }) : t("notRated"));
    const scores = {
      name: userName,
      overall: score(data.overallFeeling),
      kitchen: score(data.kitchen),
      balconies: score(data.balconies),
      location: score(data.location),
      floorplan: score(data.floorplan),
    };
    const comment = data.comment.trim();
    return comment === "" ? t("ratingLine", scores) : t("ratingLineComment", { ...scores, comment });
  };
}

function ImportPanel({ onDone }: { onDone: (report: ImportReport) => void }) {
  const t = useTranslations("household.data");
  const format = useFormatter();
  const { credits, limits, readImport, importHousehold } = useHouseholdData();
  const ratingLine = useRatingLine();
  const [parsed, setParsed] = useState<ParsedExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function clear() {
    setParsed(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleFile(file: File | undefined) {
    setError(null);
    setParsed(null);
    if (!file) return;
    try {
      setParsed(await readImport(file));
    } catch (err) {
      setError(t(`fileProblem.${err instanceof ExportFormatError ? err.problem : "invalid"}`));
    }
  }

  async function handleImport(file: ParsedExport) {
    setImporting(true);
    setError(null);
    try {
      onDone(await importHousehold(file, ratingLine, (done, total) => setProgress([done, total])));
    } catch {
      setError(t("importFailed"));
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  const count = parsed?.apartments.length ?? 0;
  const blocked = parsed ? blockedReason(t, count, limits, credits) : null;
  const importLabel = progress
    ? t("importingProgress", { done: progress[0], total: progress[1] })
    : importing
      ? t("importing")
      : t("import");

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("importBody")}</p>
      {!importing && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <Upload className="size-4" aria-hidden />
          <span>{t("chooseFile")}</span>
          <input
            ref={fileInput}
            type="file"
            accept=".zip,application/zip"
            className="text-sm"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </label>
      )}

      {parsed && (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <p>
            {t("fileSummary", {
              apartments: parsed.apartments.length,
              locations: parsed.locations.length,
              ratings: parsed.ratings.length,
              date: format.dateTime(new Date(parsed.manifest.exportedAt), { dateStyle: "medium" }),
            })}
          </p>
          {credits !== null && blocked === null && count > 0 && (
            <p className="text-muted-foreground">{t("usesCredits", { count })}</p>
          )}
          {blocked && (
            <p role="alert" className="text-destructive">
              {blocked}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11 sm:h-8"
              onClick={() => void handleImport(parsed)}
              disabled={importing || blocked !== null}
            >
              {importLabel}
            </Button>
            {!importing && (
              <Button variant="outline" className="h-11 sm:h-8" onClick={clear}>
                {t("cancel")}
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

function ImportReportView({ report }: { report: ImportReport }) {
  const t = useTranslations("household.data");
  return (
    <div role="status" className="space-y-1 text-sm">
      <p>
        {t("imported", {
          apartments: report.apartments,
          locations: report.locations,
          pdfs: report.pdfs,
          ratings: report.ratings,
        })}
      </p>
      {report.failed.length > 0 && (
        <>
          <p className="text-destructive">{t("notImported")}</p>
          <ul className="list-disc pl-5 text-destructive">
            {report.failed.map((f, i) => (
              <li key={i}>{t(`failure.${f.kind}`, { name: f.name, reason: f.reason })}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
