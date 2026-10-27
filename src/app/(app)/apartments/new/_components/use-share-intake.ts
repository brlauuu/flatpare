import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ApiClientError } from "@/components/household-data/api-client";
import { useHouseholdData } from "@/components/household-data/use-household-data";
import { useStoreErrorDetails } from "@/components/household-data/use-store-error-details";
import { firstHttpUrl, isHttpUrl } from "@/lib/household-data/links";
import { deleteShare, readShare, type SharedItem } from "@/lib/share-stash";
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

export interface ShareIntake {
  sharedUrl: string | null;
  finishShare(): Promise<void>;
  notice: string | null;
}

function sharedLink(item: SharedItem): string | null {
  if (item.url && isHttpUrl(item.url)) return item.url;
  return firstHttpUrl(item.text ?? "") ?? (item.url ? firstHttpUrl(item.url) : null);
}

function isDraftListFull(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 409 && err.message === "Too many drafts";
}

type Outcome = { notice: string | null } & (
  | { kind: "files"; files: File[]; link: string | null }
  | { kind: "draft" }
  | { kind: "error"; message: string }
);

interface IntakeDeps {
  createDraft(url: string, title: string | null): Promise<unknown>;
  errorDetails(err: unknown): { message?: string };
  router: { replace(href: string): void };
  t: (key: "shareUnavailable" | "shareNothing" | "shareDropped", values?: { count: number }) => string;
  tDrafts: (key: "full") => string;
}

async function intake(id: string, deps: IntakeDeps): Promise<Outcome> {
  const { t, tDrafts } = deps;
  const item = id === "unavailable" ? null : await readShare(id);
  if (!item) return { kind: "error", message: t("shareUnavailable"), notice: null };
  const notice = item.dropped > 0 ? t("shareDropped", { count: item.dropped }) : null;

  const link = sharedLink(item);
  if (item.files.length > 0) {
    return { kind: "files", files: item.files.map(asNamedPdf), link, notice };
  }
  if (!link) {
    await deleteShare(id);
    return { kind: "error", message: t("shareNothing"), notice };
  }
  try {
    await deps.createDraft(link, item.title);
  } catch (err) {
    const message = isDraftListFull(err)
      ? tDrafts("full")
      : (deps.errorDetails(err).message ?? t("shareUnavailable"));
    return { kind: "error", message, notice };
  }
  await deleteShare(id);
  deps.router.replace("/apartments");
  return { kind: "draft", notice };
}

// The service worker stashes a share and redirects here with ?share=<id>
// (or ?share=unavailable when it could not). PDFs go into the normal add flow
// and the entry is deleted once everything saved; a link alone becomes a
// draft. The entry survives until then, so a reload offers it again.
export function useShareIntake({ onFiles, onError }: ShareIntakeOptions): ShareIntake {
  const t = useTranslations("apartments.new");
  const tDrafts = useTranslations("apartments.drafts");
  const errorDetails = useStoreErrorDetails();
  const router = useRouter();
  const { createDraft } = useHouseholdData();
  const shareId = useSearchParams()?.get("share") ?? null;

  const [sharedUrl, setSharedUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Files are handed over after the render that sets sharedUrl, so the page's
  // prefill already knows the link when the files are processed.
  const [pending, setPending] = useState<File[] | null>(null);

  const handled = useRef<string | null>(null);
  const entryId = useRef<string | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ onFiles, onError, createDraft, errorDetails, router, t, tDrafts });
  useEffect(() => {
    latest.current = { onFiles, onError, createDraft, errorDetails, router, t, tDrafts };
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
    // re-render) must not create a second draft.
    handled.current = shareId;

    void intake(shareId, latest.current).then((outcome) => {
      if (!mounted.current) return;
      setNotice(outcome.notice);
      if (outcome.kind === "error") latest.current.onError(outcome.message);
      if (outcome.kind === "files") {
        entryId.current = shareId;
        setSharedUrl(outcome.link);
        setPending(outcome.files);
      }
    });
  }, [shareId]);

  const delivered = useRef<File[] | null>(null);
  useEffect(() => {
    if (!pending || delivered.current === pending) return;
    delivered.current = pending;
    latest.current.onFiles(pending);
  }, [pending]);

  useEffect(() => {
    const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
    queue?.setConsumer((params) => {
      void Promise.all(params.files.map((handle) => handle.getFile())).then((files) => {
        if (mounted.current && files.length > 0) latest.current.onFiles(files);
      });
    });
  }, []);

  async function finishShare() {
    const id = entryId.current;
    if (!id) return;
    entryId.current = null;
    await deleteShare(id);
  }

  return { sharedUrl, finishShare, notice };
}
