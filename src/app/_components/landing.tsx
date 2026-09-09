import Image from "next/image";
import {
  FileText,
  Star,
  MapPin,
  Users,
  Lock,
  KeyRound,
  Server,
  Eye,
} from "lucide-react";
import { PRIVACY_CLAIM, REPO_URL } from "@/lib/site";

// The landing page's content (#189). A server component with no interactive
// state — the only client island on this page is the sign-in card, which the
// caller places inside `signIn`.
//
// Two rules from the spec govern the copy here and are enforced by
// src/app/__tests__/landing.test.tsx:
//   1. PRIVACY_CLAIM appears verbatim.
//   2. The phrase "zero-knowledge" is never used unqualified. The blind-proxy
//      exception is real, so an unqualified claim would be false.

const FEATURES = [
  {
    icon: FileText,
    title: "Drop in the PDF, get the listing",
    body: "Upload the exposé and the rent, rooms, size and address are read out of it for you. Correct anything that came out wrong — it is a starting point, not an oracle.",
  },
  {
    icon: Star,
    title: "Rate it separately, compare it together",
    body: "You each rate a flat on your own. The comparison shows both scores side by side, so a disagreement is visible instead of averaged away into nothing.",
  },
  {
    icon: MapPin,
    title: "Distances to the places you actually go",
    body: "Save up to five locations — work, the gym, your sister — and every apartment shows how long it takes to get to each of them by bike and transit.",
  },
  {
    icon: Users,
    title: "Built for two people, not a team",
    body: "Invite the person you are moving in with. One household, shared listings, separate opinions.",
  },
] as const;

export function Landing({ signIn }: { signIn: React.ReactNode }) {
  return (
    <main className="flex-1">
      {/* Hero + sign-in */}
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-10 px-4 pb-16 pt-12 md:flex-row md:items-start md:justify-between md:pt-20">
        <div className="max-w-xl space-y-5 text-center md:text-left">
          <Image
            src="/flatpare_logo.svg"
            alt="Flatpare"
            width={200}
            height={62}
            className="mx-auto h-12 w-auto dark:invert md:mx-0"
            priority
          />
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Compare apartments together, without handing your search to anyone
            else.
          </h1>
          <p className="text-lg text-muted-foreground text-pretty">
            Flatpare is a shared workspace for two people hunting for a flat.
            Every listing, rating and note is encrypted in your browser before
            it is stored, with a key the server never holds.
          </p>
          <p className="text-sm text-muted-foreground">
            Free while you run it yourself. Paid if you would rather we ran it.
          </p>
        </div>

        <div className="w-full max-w-sm shrink-0">{signIn}</div>
      </section>

      {/* What it does */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto w-full max-w-5xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            What it does
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <h3 className="font-medium">{title}</h3>
                </div>
                <p className="text-sm text-muted-foreground text-pretty">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The privacy claim — the section the spec is strictest about */}
      <section className="border-t">
        <div className="mx-auto w-full max-w-5xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            What we can and cannot see
          </h2>

          <blockquote className="mt-6 border-l-4 border-primary/60 pl-4 text-lg font-medium text-pretty">
            {PRIVACY_CLAIM}
          </blockquote>

          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <h3 className="font-medium">Encrypted before it leaves</h3>
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                Your apartments, ratings, notes and saved PDFs are encrypted in
                your browser. What reaches our database is ciphertext, and the
                key to it never does.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <KeyRound
                  className="h-5 w-5 shrink-0 text-primary"
                  aria-hidden
                />
                <h3 className="font-medium">Your key, and only yours</h3>
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                The key comes from your passphrase, plus a recovery code you
                print and keep. There is no reset. If you lose both, your data
                is gone — including to us, because we never had it.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <h3 className="font-medium">The exception, stated plainly</h3>
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                Four things need a third party: geocoding an address, measuring
                a travel time, checking whether a listing is still up, and
                reading a PDF. That one address, URL or file is sent to us in
                readable form and passed to Google Maps or Google Gemini. It is
                used for that single call, never written to our database, and
                never logged.
              </p>
            </div>
          </div>

          <p className="mt-8 max-w-3xl text-sm text-muted-foreground text-pretty">
            We do not describe this as zero-knowledge, because it is not: the
            processing above is a real exception and it would be dishonest to
            market around it. Everything derived from those calls is encrypted
            in your browser before it is stored.
          </p>
        </div>
      </section>

      {/* Hosting and self-hosting */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto w-full max-w-5xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            Two ways to run it
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <h3 className="font-medium">Hosted by us — paid</h3>
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                We run the servers, the database and the API keys for PDF
                reading and maps. Those cost money every month, so hosting is a
                paid service rather than a free tier that quietly degrades.
                Pricing is not settled yet; this page will carry the numbers
                before anyone is asked for a card.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <h3 className="font-medium">Run it yourself — free</h3>
              </div>
              <p className="text-sm text-muted-foreground text-pretty">
                The source is public. Bring your own machine and your own API
                keys and there are no limits at all — the member and apartment
                caps are environment variables, and unset means unlimited. A{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  docker compose up
                </code>{" "}
                gets you a working instance with no third-party sign-up.
              </p>
              <p className="pt-1 text-sm">
                <a
                  className="font-medium underline underline-offset-4"
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Read the source and the setup guide
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Flatpare — compare apartments together.</p>
          <a
            className="underline underline-offset-4"
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </main>
  );
}
