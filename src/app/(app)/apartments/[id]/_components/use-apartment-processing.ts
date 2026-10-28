import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formFromExtracted, formToFields } from "@/components/apartment-form-fields";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { downloadPdf } from "@/components/household-data/pdf-files";
import { parsePdf } from "@/components/household-data/process-client";
import { applyExtraction, fillFromExtraction } from "@/lib/edited-fields";
import type { ApartmentPdf, ApartmentView } from "@/lib/household-data/types";
import { languageOf } from "@/locales/locales";

// Process and Reprocess on the apartment page (#413). Each calls `onStart`
// when it begins and reports a failure through `onError` with the headline
// to show; the caller owns the message.
export function useApartmentProcessing(
  apartment: ApartmentView | null,
  onStart: () => void,
  onError: (headline: string, err: unknown) => void
) {
  const t = useTranslations("apartments.detail");
  const locale = languageOf(useLocale());
  const { credits, dataKey, identity, updateApartment, processApartment, chargeReprocess, relocateApartment } =
    useHouseholdData();
  const [processing, setProcessing] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  // Reads the apartment's PDF. The read names the apartment, so it is the
  // first processing when nothing was charged for it yet.
  async function readPdf(id: string, pdf: ApartmentPdf) {
    const bytes = await downloadPdf(dataKey, identity.householdId, id, pdf);
    const { extracted, aiAvailable } = await parsePdf(bytes, `${id}.pdf`, locale, id);
    // Coerce through the form helpers so the extraction lands as typed
    // Apartment fields.
    return { extracted, aiAvailable, fields: formToFields(formFromExtracted(extracted)) };
  }

  // The first processing of an apartment added by hand or from a link: its
  // unread PDF, which fills only empty fields, and its address.
  async function process() {
    if (!apartment) return;
    const { id } = apartment;
    setProcessing(true);
    onStart();
    try {
      if (apartment.pdf && apartment.rawExtractedData === null) {
        const read = await readPdf(id, apartment.pdf);
        if (read.aiAvailable) {
          // The write geocodes the address itself when it has one, now paid.
          await updateApartment(id, (current) => ({
            ...fillFromExtraction(current, read.fields, read.extracted),
            processed: true,
          }));
          return;
        }
      }
      await processApartment(id);
    } catch (err) {
      onError(t("processFailed"), err);
    } finally {
      setProcessing(false);
    }
  }

  // A reprocess is charged by explicit request, one credit, and then reads
  // the PDF again and geocodes the address again at no further charge.
  async function reprocess() {
    if (!apartment) return;
    const { id } = apartment;
    if (!window.confirm(t("reprocessConfirm", { billing: credits ? "on" : "off" }))) return;
    setReprocessing(true);
    onStart();
    try {
      await chargeReprocess(id);
      const read = apartment.pdf ? await readPdf(id, apartment.pdf) : null;
      // Keep whatever the user edited by hand.
      await relocateApartment(id, (current) =>
        read?.aiAvailable ? applyExtraction(current, read.fields, read.extracted) : current
      );
    } catch (err) {
      onError(t("reprocessFailed"), err);
    } finally {
      setReprocessing(false);
    }
  }

  return { processing, reprocessing, process, reprocess };
}
