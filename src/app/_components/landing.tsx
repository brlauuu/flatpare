import Image from "next/image";
import { BarChart3, Lock, Play, Users } from "lucide-react";
import {
  AUTHOR,
  PRIVACY_CLAIM,
  RELEASES_URL,
  REPO_URL,
  WALKTHROUGH_DURATION,
  WALKTHROUGH_VIDEO_URL,
} from "@/lib/site";
import { ThemeToggle } from "@/components/theme-toggle";
import { ThemedLogo } from "@/components/themed-logo";
import { isReleaseFresh, type ReleaseInfo } from "@/lib/release";
import type { PublicAccess } from "@/lib/public-access";
import { landingFontVariables } from "./landing-fonts";
import { HeroSketch } from "./hero-sketch";
import { ReleaseNotice } from "./release-notice";
import { SignInButton, SignInProvider } from "./sign-in-dialog";
import { BetaRequestForm } from "./beta-request-form";

// The landing page (#189, redesigned in #301 from the Claude Design spec on
// that issue: neo-brutalism, blue & white light, black & yellow dark). A
// server component; the interactive parts are small client islands — the
// theme toggle, the release notice, the sign-in dialog and the beta form.
//
// Copy rules, enforced by src/app/__tests__/landing.test.tsx:
//   1. PRIVACY_CLAIM appears verbatim.
//   2. "zero-knowledge" is never claimed; the processing exception is real.
//   3. Never "open source": the licence is O'SAASY, source-available.
//   4. The price says what it is — CHF 5, once, not a subscription — and the
//      quota's catch is disclosed: deleting does not refund a credit.
//   5. While sign-ups are closed, the hosted card strikes through the price and
//      says the beta is free (#322, #323), and that beta data and credits are
//      kept, in the same terms as the beta-ready notice in login-form.tsx and
//      the `say:` line in scripts/beta-pass.mjs.
//   6. The privacy section names every third party that sees plaintext, and
//      what it sees. On flatpare.com PDFs go through Vercel AI Gateway with
//      zero data retention, which AI_PROVIDER=gateway on the hosted
//      deployment makes true (src/lib/ai-provider.ts) — keep the two in step.
//
// `access` decides the hosted path's call to action. While sign-ups are
// closed (the hosted deployment's private beta) it is the beta-invite form;
// when open (a self-hoster's default) it is simply "Create your account".

const FEATURES = [
  {
    title: "PDF in, facts out",
    body: "Upload an exposé and rent, rooms, size and address are filled in for you.",
  },
  {
    title: "Rate on your own",
    body: "Each person scores separately; the ratings sit side by side so you can see where you agree.",
  },
  {
    title: "One comparison grid",
    body: "Sort, hide and compare every listing until the winner is obvious.",
  },
  {
    title: "Commutes, calculated",
    body: "Bike and transit times to up to five places that matter to you.",
  },
  {
    title: "Built for a household",
    body: "Made for partners and flatmates searching together, not for teams or agents.",
  },
  {
    title: "Private either way",
    body: "Self-hosted on your own setup, or end-to-end encrypted when we host it.",
  },
] as const;

// "Privacy first" carries an asterisk and links to the section that says
// exactly what it means, exception included (#323).
const TAGS = [
  { icon: Users, label: "Collaborative", href: null },
  { icon: Lock, label: "Privacy first*", href: "#privacy" },
  { icon: BarChart3, label: "Data driven", href: null },
] as const;

const ZDR_URL = "https://vercel.com/docs/ai-gateway/security-and-compliance/zdr";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="lp-mono text-[13px] tracking-[0.08em] text-(--lp-muted)">{children}</span>;
}

// lucide-react dropped brand marks in v1; this is the outline from the design.
function GithubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </svg>
  );
}

function Logo() {
  return (
    <a href="#top" aria-label="Flatpare home" className="flex items-center">
      <ThemedLogo width={129} height={40} className="h-10 w-auto" priority />
    </a>
  );
}

function Nav({ release }: { release: ReleaseInfo | null }) {
  return (
    <header className="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Logo />
      {release && (
        <div className="order-last flex min-w-0 basis-full justify-center md:order-none md:basis-auto md:flex-1">
          <ReleaseNotice version={release.version} href={RELEASES_URL} />
        </div>
      )}
      <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px] font-medium">
        <a href="#video" className="hidden text-(--lp-ink) no-underline hover:underline sm:inline">
          How it works
        </a>
        <a href="#paths" className="hidden text-(--lp-ink) no-underline hover:underline sm:inline">
          Pricing
        </a>
        <a href={REPO_URL} className="inline-flex items-center gap-1.5 text-(--lp-ink) no-underline hover:underline">
          <GithubMark />
          GitHub
        </a>
        <SignInButton className="lp-btn lp-btn-secondary min-h-11 px-4">Sign in</SignInButton>
        <ThemeToggle className="border-(--lp-chip-line)" />
      </nav>
    </header>
  );
}

function Hero({ access }: { access: PublicAccess }) {
  return (
    <section
      id="top"
      className="lp-grid-bg relative overflow-hidden border-y-[3px] border-(--lp-line) bg-(--lp-bg)"
    >
      <HeroSketch />
      <div className="relative mx-auto flex max-w-[1160px] flex-wrap items-center gap-14 px-4 pt-16 pb-20 sm:px-6 md:pt-22 md:pb-24">
        <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-6">
          <Eyebrow>FLAT HUNTING, TOGETHER</Eyebrow>
          <h1 className="lp-head m-0 text-[40px] leading-[1.02] tracking-[-0.03em] sm:text-[62px]">
            Compare flats.
            <br />
            <span className="text-(--lp-accent-text)">Decide together.</span>
          </h1>
          <ul aria-label="Why Flatpare" className="m-0 flex list-none flex-wrap gap-2.5 p-0">
            {TAGS.map(({ icon: Icon, label, href }) => {
              const content = (
                <>
                  <Icon className="size-[18px] text-(--lp-accent-text)" aria-hidden />
                  {label}
                </>
              );
              return (
                <li key={label}>
                  {href ? (
                    <a href={href} className="lp-chip text-(--lp-ink) no-underline underline-offset-4 hover:underline">
                      {content}
                    </a>
                  ) : (
                    <span className="lp-chip">{content}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="m-0 max-w-[520px] text-[19px] leading-[1.55] text-(--lp-body)">
            A shared workspace for the people hunting for a flat. Drop in listing
            PDFs, rate every place on your own, compare commutes.
          </p>
          <div className="flex flex-wrap gap-3.5">
            {access === "closed" ? (
              <a href="#hosted" className="lp-btn lp-btn-primary">
                Request a beta invite
              </a>
            ) : (
              <SignInButton className="lp-btn lp-btn-primary">Get started</SignInButton>
            )}
            <a href="#self-host" className="lp-btn lp-btn-secondary">
              Run it yourself
            </a>
          </div>
        </div>
        <div className="min-w-0 flex-[1_1_480px]">
          <CompareShot sizes="(min-width: 1160px) 560px, 100vw" priority />
        </div>
      </div>
    </section>
  );
}

const COMPARE_ALT =
  "Flatpare's comparison grid: five flats side by side with rent, size, rooms, commute times and each person's star ratings";

// The real comparison grid with invented data, captured from a production
// build by scripts/capture-hero.mjs — re-run it when the grid changes. One
// image per theme. Shown in the hero and again, full width, under the
// feature list (#323).
function CompareShot({ sizes, priority = false }: { sizes: string; priority?: boolean }) {
  return (
    <figure className="m-0 border-[3px] border-(--lp-card-line) bg-(--lp-surface) shadow-(--lp-hero-shadow)">
      <div className="flex items-center gap-2 border-b-[3px] border-(--lp-card-line) px-3.5 py-2.5">
        <span className="size-2.5 rounded-full bg-(--lp-line)" />
        <span className="size-2.5 rounded-full bg-(--lp-line)" />
        <span className="size-2.5 rounded-full bg-(--lp-line)" />
        <span className="lp-mono ml-2 text-xs text-(--lp-muted)">flatpare.com / compare</span>
      </div>
      <Image
        src="/hero/compare-light.webp"
        alt={COMPARE_ALT}
        width={1600}
        height={1000}
        sizes={sizes}
        className="block h-auto w-full dark:hidden"
        priority={priority}
      />
      <Image
        src="/hero/compare-dark.webp"
        alt={COMPARE_ALT}
        width={1600}
        height={1000}
        sizes={sizes}
        className="hidden h-auto w-full dark:block"
        priority={priority}
      />
    </figure>
  );
}

function Video() {
  return (
    <section id="video" className="mx-auto flex max-w-[1160px] flex-col gap-7 px-4 pt-24 pb-8 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <h2 className="lp-head m-0 text-[30px] sm:text-[36px]">See how it works</h2>
        <Eyebrow>
          WALKTHROUGH{WALKTHROUGH_DURATION ? ` · ${WALKTHROUGH_DURATION}` : ""}
        </Eyebrow>
      </div>
      {WALKTHROUGH_VIDEO_URL ? (
        <a
          href={WALKTHROUGH_VIDEO_URL}
          aria-label="Play the Flatpare walkthrough on YouTube"
          className="lp-video-grid flex aspect-video items-center justify-center border-[3px] border-(--lp-card-line) no-underline shadow-(--lp-card-shadow)"
        >
          <span className="flex flex-col items-center gap-4 text-(--lp-video-ink)">
            <span className="flex size-22 items-center justify-center rounded-full border-[3px] border-(--lp-btn-line) bg-(--lp-play-bg)">
              <Play className="size-8 fill-(--lp-play-ink) text-(--lp-play-ink)" aria-hidden />
            </span>
            <span className="lp-mono text-sm">Watch on YouTube</span>
          </span>
        </a>
      ) : (
        <div className="lp-video-grid flex aspect-video items-center justify-center border-[3px] border-(--lp-card-line) shadow-(--lp-card-shadow)">
          <span className="flex flex-col items-center gap-4 text-(--lp-video-ink)">
            <span className="flex size-22 items-center justify-center rounded-full border-[3px] border-(--lp-btn-line) bg-(--lp-play-bg) opacity-80">
              <Play className="size-8 fill-(--lp-play-ink) text-(--lp-play-ink)" aria-hidden />
            </span>
            <span className="lp-mono text-sm">Walkthrough video coming soon</span>
          </span>
        </div>
      )}
    </section>
  );
}

// What "Privacy first*" means (#323). Applies to both paths, which is why it
// is its own section rather than a footnote on the hosted card.
function Privacy() {
  return (
    <section id="privacy" className="mx-auto flex max-w-[1160px] scroll-mt-6 flex-col gap-8 px-4 pt-24 sm:px-6">
      <div className="flex flex-col gap-2.5">
        <Eyebrow>PRIVACY*</Eyebrow>
        <h2 className="lp-head m-0 text-[30px] sm:text-[36px]">What we can and can&apos;t see</h2>
      </div>
      <div className="flex flex-wrap gap-7">
        <div className="lp-card flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-6 sm:p-9">
          <h3 className="lp-head m-0 text-[22px]">Encrypted in your browser</h3>
          <p className="m-0 text-base leading-relaxed font-semibold text-(--lp-ink)">{PRIVACY_CLAIM}</p>
          <p className="m-0 text-base leading-relaxed text-(--lp-body)">
            Every listing, rating, note and PDF is encrypted in your browser
            before it&apos;s stored, with a key the server never holds. What we
            keep is ciphertext: without your passphrase or recovery code nobody
            can read it, us included.
          </p>
          <p className="m-0 text-base leading-relaxed text-(--lp-body)">
            Self-hosted, the same holds with your own server in our place.
          </p>
        </div>
        <div className="lp-card flex min-w-0 flex-[1_1_420px] flex-col gap-4 p-6 sm:p-9">
          <h3 className="lp-head m-0 text-[22px]">The exception, stated plainly</h3>
          <p className="m-0 text-base leading-relaxed text-(--lp-body)">
            A few things cannot be done in a browser. For those, that single
            item is sent in readable form, used for that one call, never
            written to our database and never logged:
          </p>
          <ul className="m-0 list-disc pl-5 text-[15px] leading-[1.7] text-(--lp-body)">
            <li>
              <strong className="text-(--lp-ink)">A PDF</strong> goes to an AI
              model that reads the facts out and writes a short summary. On
              flatpare.com that is through Vercel AI Gateway with{" "}
              <a href={ZDR_URL} className="font-semibold text-(--lp-accent-text)">
                zero data retention
              </a>
              : it only uses model providers that have agreed not to keep the
              request. Self-hosted, it is Google Gemini unless you configure
              another.
            </li>
            <li>
              <strong className="text-(--lp-ink)">An address</strong> goes to
              Google Maps, for its location and the bike and transit times
              (OpenRouteService on a self-hosted setup without Maps).
            </li>
            <li>
              <strong className="text-(--lp-ink)">A listing&apos;s link</strong>{" "}
              is opened by our server, which fetches the page from the listing
              site to check it is still online.
            </li>
          </ul>
          <p className="m-0 text-[15px] leading-relaxed text-(--lp-body)">
            Maps load their streets from OpenFreeMap or OpenStreetMap, which
            see the part of the city on screen, never your apartments.
          </p>
          <p className="m-0 text-[15px] leading-relaxed font-semibold text-(--lp-ink)">
            That is why we do not describe this as zero-knowledge.
          </p>
        </div>
      </div>
    </section>
  );
}

function Paths({ access }: { access: PublicAccess }) {
  return (
    <section id="paths" className="mx-auto flex max-w-[1160px] flex-col gap-8 px-4 py-24 sm:px-6">
      <div className="flex flex-col gap-2.5">
        <Eyebrow>TWO WAYS IN</Eyebrow>
        <h2 className="lp-head m-0 text-[30px] sm:text-[36px]">Same app. Private either way.</h2>
      </div>
      <div className="flex flex-wrap gap-7">
        <article
          id="hosted"
          className="flex min-w-0 flex-[1_1_420px] scroll-mt-6 flex-col gap-5 border-[3px] border-(--lp-hosted-border) bg-(--lp-soft) p-6 shadow-(--lp-hero-shadow) sm:p-9"
        >
          <div className="flex flex-wrap gap-2">
            <span className="lp-badge border-(--lp-accent) bg-(--lp-accent) text-(--lp-on-accent)">HOSTED</span>
            {access === "closed" && <span className="lp-badge text-(--lp-accent-text)">PRIVATE BETA</span>}
          </div>
          <h3 className="lp-head m-0 text-[28px]">
            We run it for you.
            <br />
            <span className="text-(--lp-accent-text)">Private by encryption.</span>
          </h3>
          <p className="m-0 text-base leading-relaxed text-(--lp-body)">
            Everything is encrypted in your browser before it&apos;s stored, with
            a key the server never holds (
            <a href="#privacy" className="font-semibold text-(--lp-accent-text)">
              what that means
            </a>
            ). Nothing to install, no API keys to manage.
          </p>
          {access === "closed" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <s className="lp-head text-[40px] tracking-[-0.03em] text-(--lp-muted)">
                  <span className="sr-only">After the beta: </span>CHF 5
                </s>
                <span className="lp-head text-[40px] tracking-[-0.03em] text-(--lp-accent-text)">Free beta</span>
              </div>
              <span className="text-[15px] text-(--lp-muted)">
                then a one-time payment · per household · not a subscription
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="lp-head text-[40px] tracking-[-0.03em]">CHF 5</span>
              <span className="text-[15px] text-(--lp-muted)">
                one-time payment · per household · not a subscription
              </span>
            </div>
          )}
          {access === "closed" && (
            <p className="m-0 text-[15px] leading-relaxed text-(--lp-body)">
              Request access below. What a beta account gets is yours to keep:
              neither your data nor your credits are taken back when the beta
              ends.
            </p>
          )}
          <ul className="m-0 list-disc pl-5 text-[15px] leading-[1.7] text-(--lp-body)">
            <li>Up to 10 people and 40 apartments.</li>
            <li>Need more? Another CHF 5 adds another 40 apartments.</li>
            <li>
              The 40 counts apartments you add: deleting one does not give the
              credit back.
            </li>
            <li>
              Your key comes from your passphrase, plus a recovery code you
              print. There is no reset — lose both and the data is gone, to us
              too.
            </li>
          </ul>
          <div className="mt-auto">
            {access === "closed" ? (
              <BetaRequestForm />
            ) : (
              <SignInButton className="lp-btn lp-btn-primary">Create your account →</SignInButton>
            )}
          </div>
        </article>
        <article
          id="self-host"
          className="lp-card flex min-w-0 flex-[1_1_420px] scroll-mt-6 flex-col gap-5 p-6 sm:p-9"
        >
          <div className="flex flex-wrap gap-2">
            <span className="lp-badge">SELF-HOSTED</span>
            <span className="lp-badge">SOURCE AVAILABLE · O&apos;SAASY</span>
          </div>
          <h3 className="lp-head m-0 text-[28px]">
            Run it yourself, for yourself.
            <br />
            <span className="text-(--lp-muted)">Private by definition.</span>
          </h3>
          <p className="m-0 text-base leading-relaxed text-(--lp-body)">
            Your server, your database, your keys. Host it on a laptop, a home
            server or your own cloud account — your search never leaves your
            setup, and there are no limits.
          </p>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="lp-head text-[40px] tracking-[-0.03em]">Free</span>
            <span className="text-[15px] text-(--lp-muted)">bring your own Gemini &amp; Maps keys</span>
          </div>
          <pre className="lp-mono m-0 overflow-x-auto border border-(--lp-line) bg-(--lp-code-bg) p-4.5 text-[13px] leading-[1.7] text-(--lp-code-ink)">
            {`git clone ${REPO_URL}\ncd flatpare\ncp .env.example .env.local\ndocker compose up -d`}
          </pre>
          <a href={REPO_URL} className="lp-btn lp-btn-secondary mt-auto self-start">
            View on GitHub →
          </a>
        </article>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="lp-grid-bg border-y-[3px] border-(--lp-line)">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-8 px-4 py-22 sm:px-6">
        <h2 className="lp-head m-0 text-[30px] sm:text-[36px]">What&apos;s inside</h2>
        <div className="grid grid-cols-1 gap-[3px] sm:grid-cols-2 lg:grid-cols-3 overflow-hidden border-[3px] border-(--lp-card-line) bg-(--lp-card-line) shadow-(--lp-card-shadow)">
          {FEATURES.map(({ title, body }, i) => (
            <div key={title} className="flex flex-col gap-2 bg-(--lp-surface) p-7">
              <span className="lp-mono text-[13px] text-(--lp-accent-text)">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="m-0 text-lg font-bold">{title}</h3>
              <p className="m-0 leading-[1.55] text-(--lp-body)">{body}</p>
            </div>
          ))}
        </div>
        <CompareShot sizes="(min-width: 1160px) 1112px, 100vw" />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="lp-mono mx-auto flex max-w-[1160px] flex-col items-center gap-3 px-4 pt-9 pb-11 text-center text-sm text-(--lp-body) sm:px-6">
        <span>
          flatpare.com is created by{" "}
          <a href={AUTHOR.url} className="font-semibold text-(--lp-accent-text)">
            {AUTHOR.name}
          </a>
        </span>
        <span className="flex flex-wrap justify-center gap-5 text-[13px]">
          <a href={REPO_URL} className="text-(--lp-muted)">
            GitHub
          </a>
          <a href={RELEASES_URL} className="text-(--lp-muted)">
            Changelog
          </a>
        </span>
      </div>
    </footer>
  );
}

export function Landing({
  signIn,
  access = "open",
  openSignIn = false,
  release = null,
  now = new Date(),
}: {
  signIn: React.ReactNode;
  access?: PublicAccess;
  // Open the sign-in dialog on load: the sign-in flow came back with a
  // notice to show (src/app/page.tsx decides).
  openSignIn?: boolean;
  // The newest release, from CHANGELOG.md at build time. Mentioned in the
  // nav only while it is recent.
  release?: ReleaseInfo | null;
  now?: Date;
}) {
  const freshRelease = release && isReleaseFresh(release.date, now) ? release : null;
  return (
    <SignInProvider signIn={signIn} defaultOpen={openSignIn}>
      <div className={`landing ${landingFontVariables} flex flex-1 flex-col`}>
        <Nav release={freshRelease} />
        <main className="flex-1">
          <Hero access={access} />
          <Video />
          <Privacy />
          <Paths access={access} />
          <Features />
        </main>
        <Footer />
      </div>
    </SignInProvider>
  );
}
