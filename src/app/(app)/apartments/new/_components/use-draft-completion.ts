import { useSearchParams } from "next/navigation";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import type { DraftView } from "@/lib/household-data/types";
import { hostOf } from "@/lib/household-data/links";

export interface DraftCompletion {
  draft: DraftView | null;
  prefillUrl: string | null;
  prefillTitle: string | null;
  draftHost: string | null;
  finishDraft(): Promise<void>;
}

// "Add" on the To add strip links to the add page with ?draft=<id>. An unknown
// or corrupt id is ignored: the page is simply the normal add page.
export function useDraftCompletion(): DraftCompletion {
  const { deleteDraft, drafts } = useHouseholdData();
  const draftId = useSearchParams()?.get("draft") ?? null;
  const draft = drafts.find((d) => d.id === draftId && !d.corrupt && d.url) ?? null;
  const prefillUrl = draft?.url ?? null;
  const prefillTitle = draft?.title ?? null;
  const draftHost = prefillUrl ? hostOf(prefillUrl) : null;

  // The draft is spent only once everything on the page has saved. Its own
  // failure changes nothing for the person: the apartment exists, the draft stays.
  async function finishDraft() {
    if (!draft) return;
    try {
      await deleteDraft(draft.id);
    } catch {
      // swallowed on purpose
    }
  }

  return { draft, prefillUrl, prefillTitle, draftHost, finishDraft };
}
