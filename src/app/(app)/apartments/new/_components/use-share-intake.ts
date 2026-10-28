import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiClientError } from "@/components/household-data/api-client";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { useStoreErrorDetails } from "@/components/household-data/use-store-error-details";
import { firstHttpUrl, hostOf, isHttpUrl } from "@/lib/household-data/links";
import { deleteShare, keepShareFiles, readShare, type SharedItem } from "@/lib/share-stash";
import { asNamedPdf } from "./pdf-file";

// "Open with Flatpare" on a PDF (the manifest's file handler). Not in the DOM
// types yet, so only the part used here is described.
interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

export interface ShareIntakeOptions {
  onFiles(files: File[]): void;
  onError(message: string): void;
}

/** What the page asks before acting on a share. */
export type ShareConfirmation = { kind: "pdf"; count: number } | { kind: "link"; host: string };

export interface ShareIntake {
  sharedUrl: string | null;
  /** Deletes the entry: everything it held saved. */
  finishShare(): Promise<void>;
  /**
   * After a partial save: keeps in the entry only the shared files that are
   * not among `handled` (saved or discarded), or deletes it when none is left.
   */
  settleShare(handled: File[]): Promise<void>;
  notice: string | null;
  confirmation: ShareConfirmation | null;
  confirmShare(): void;
  discardShare(): void;
}

interface Candidate {
  id: string;
  files: File[];
  link: string | null;
  title: string | null;
}

function sharedLink(item: SharedItem): string | null {
  if (item.url && isHttpUrl(item.url)) return item.url;
  return firstHttpUrl(item.text ?? "") ?? (item.url ? firstHttpUrl(item.url) : null);
}

function isAtApartmentCap(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 409 && err.message === "Apartment limit reached";
}

type IntakeT = (key: "shareUnavailable" | "shareNothing" | "shareDropped", values?: { count: number }) => string;

type ReadOutcome = { notice: string | null } & (
  | { kind: "candidate"; candidate: Candidate }
  | { kind: "error"; message: string }
);

// Reads the entry and decides what it holds. Writes nothing to the household:
// that waits for the person's tap and for the store's first load.
async function readCandidate(id: string, t: IntakeT): Promise<ReadOutcome> {
  const item = id === "unavailable" ? null : await readShare(id);
  if (!item) return { kind: "error", message: t("shareUnavailable"), notice: null };
  const notice = item.dropped > 0 ? t("shareDropped", { count: item.dropped }) : null;

  const link = sharedLink(item);
  if (item.files.length === 0 && !link) {
    await deleteShare(id);
    return { kind: "error", message: t("shareNothing"), notice };
  }
  const files = item.files.map(asNamedPdf);
  return { kind: "candidate", candidate: { id, files, link, title: item.title }, notice };
}

interface LinkDeps {
  createApartmentFromLink(url: string, title: string | null): Promise<{ id: string }>;
  errorDetails(err: unknown): { message?: string };
  router: { replace(href: string): void };
  t: IntakeT;
  tLink: (key: "full") => string;
}

/**
 * Adds a shared link as an unprocessed apartment (#413), free, and opens it;
 * answers the error to show, or null.
 */
async function saveLink(candidate: Candidate, deps: LinkDeps): Promise<string | null> {
  let id: string;
  try {
    ({ id } = await deps.createApartmentFromLink(candidate.link!, candidate.title));
  } catch (err) {
    return isAtApartmentCap(err)
      ? deps.tLink("full")
      : (deps.errorDetails(err).message ?? deps.t("shareUnavailable"));
  }
  await deleteShare(candidate.id);
  deps.router.replace(`/apartments/${id}`);
  return null;
}

function confirmationFor(candidate: Candidate): ShareConfirmation {
  return candidate.files.length > 0
    ? { kind: "pdf", count: candidate.files.length }
    : { kind: "link", host: hostOf(candidate.link!) };
}

function shareParams(params: URLSearchParams | null) {
  return {
    shareId: params?.get("share") ?? null,
    // The pick-up prompt's Add is already the tap, and it adds confirmed=1.
    // That cannot be forged to skip the question: the id is a random UUID the
    // worker minted in this browser, which another site never learns, and an
    // unknown id only answers "did not reach Flatpare".
    confirmed: params?.get("confirmed") === "1",
  };
}

/** The shared files not among `handled`, compared by identity. */
function filesLeft(shared: File[], handled: File[]): File[] {
  return shared.filter((file) => !handled.includes(file));
}

// "Open with Flatpare" on a PDF: the files arrive through launchQueue, not
// the share stash, and go straight into processing.
function useLaunchQueue(onFiles: { current: (files: File[]) => void }, mounted: { current: boolean }) {
  useEffect(() => {
    const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
    queue?.setConsumer((params) => {
      void Promise.all(params.files.map((handle) => handle.getFile())).then((files) => {
        if (mounted.current && files.length > 0) onFiles.current(files);
      });
    });
  }, [onFiles, mounted]);
}

// The stash entry whose files the page is adding: deleted once all of them
// saved, trimmed to the rest after a partial save. Plain closure state, made
// once per mounted page (useState's initializer), so it is stable.
function createShareEntry() {
  let entryId: string | null = null;
  // The shared files still in the entry, as handed to the page (same objects).
  let sharedFiles: File[] = [];

  async function finish() {
    const id = entryId;
    if (!id) return;
    entryId = null;
    await deleteShare(id);
  }

  return {
    begin(id: string, files: File[]) {
      entryId = id;
      sharedFiles = files;
    },
    finish,
    async settle(handled: File[]) {
      const id = entryId;
      if (!id) return;
      const rest = filesLeft(sharedFiles, handled);
      if (rest.length === sharedFiles.length) return;
      if (rest.length === 0) return finish();
      sharedFiles = rest;
      await keepShareFiles(id, rest);
    },
  };
}

// The service worker stashes a share and redirects here with ?share=<id>
// (or ?share=unavailable when it could not). Nothing is acted on until the
// person confirms: any website can post a form to /share-target, and the
// worker cannot tell that from the phone's share sheet. Once confirmed, PDFs
// go into the normal add flow and the entry is deleted once everything saved;
// a link alone becomes an unprocessed apartment (#413). The entry survives
// until then, so a reload offers it again.
export function useShareIntake({ onFiles, onError }: ShareIntakeOptions): ShareIntake {
  const t = useTranslations("apartments.new");
  const tLink = useTranslations("apartments.pasteLink");
  const errorDetails = useStoreErrorDetails();
  const router = useRouter();
  const { createApartmentFromLink, status } = useHouseholdData();
  const { shareId, confirmed } = shareParams(useSearchParams());

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The share being acted on: confirmed, and the store's first load is in (an
  // apartment added while that load is in flight is overwritten by its
  // answer, so the shared link would vanish from the list). Latched here so
  // a later reload of the store does not take the shared link away mid-way.
  const [live, setLive] = useState<Candidate | null>(null);
  const actNow = candidate && accepted && status === "ready" ? candidate : null;
  if (actNow && actNow !== live) setLive(actNow);
  const sharedUrl = live && live.files.length > 0 ? live.link : null;

  const handled = useRef<string | null>(null);
  const acted = useRef<string | null>(null);
  const [entry] = useState(createShareEntry);
  const mounted = useRef(true);
  const latest = useRef({ onFiles, onError, createApartmentFromLink, errorDetails, router, t, tLink });
  useEffect(() => {
    latest.current = { onFiles, onError, createApartmentFromLink, errorDetails, router, t, tLink };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!shareId || handled.current === shareId) return;
    // Set before any await: a second run of this effect (StrictMode, a
    // re-render) must not read and offer the share twice.
    handled.current = shareId;

    void readCandidate(shareId, latest.current.t).then((outcome) => {
      if (!mounted.current) return;
      setNotice(outcome.notice);
      if (outcome.kind === "error") {
        latest.current.onError(outcome.message);
        return;
      }
      setCandidate(outcome.candidate);
      setAccepted(confirmed);
    });
  }, [shareId, confirmed]);

  // Files are handed over in the commit of the render that set sharedUrl, so
  // the page's prefill already knows the link when the files are processed.
  // This relies on effect order: the page's effect that copies the link into
  // its linkRef runs in the same commit as this one, and the prefill is only
  // read after processFiles' first await. Calling onFiles from the intake
  // promise directly (before that commit) would prefill nothing.
  useEffect(() => {
    if (!live || acted.current === live.id) return;
    acted.current = live.id;

    if (live.files.length > 0) {
      entry.begin(live.id, live.files);
      latest.current.onFiles(live.files);
      return;
    }
    void saveLink(live, latest.current).then((message) => {
      if (mounted.current && message) latest.current.onError(message);
    });
  }, [live, entry]);

  const launched = useRef(onFiles);
  useEffect(() => {
    launched.current = onFiles;
  });
  useLaunchQueue(launched, mounted);

  function discardShare() {
    if (!candidate) return;
    const id = candidate.id;
    setCandidate(null);
    setNotice(null);
    void deleteShare(id);
  }

  const confirmation = candidate && !accepted ? confirmationFor(candidate) : null;
  return {
    sharedUrl,
    finishShare: entry.finish,
    settleShare: entry.settle,
    notice,
    confirmation,
    confirmShare: () => setAccepted(true),
    discardShare,
  };
}
