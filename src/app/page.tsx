import { enabledProviderIds } from "@/auth";
import { readPublicAccess } from "@/lib/public-access";
import { LoginForm, type SignInNotice } from "./login-form";
import { Landing } from "./_components/landing";

// This page must not be statically prerendered: enabledProviderIds is
// computed at module load from GOOGLE_CLIENT_ID/GITHUB_CLIENT_ID, which is
// runtime state, not build-time state, in a container deployment. Vercel's
// build and runtime env agree, so a static build there happens to be
// correct — but docker-compose.yml supplies env_file only at container
// runtime, with no build args. A self-hoster who sets GOOGLE_CLIENT_ID after
// the image was built would otherwise get a login page baked with only the
// password form, while the runtime auth config has registered OAuth instead
// of credentials — so the password provider isn't there to accept it and
// the page says "Wrong password" forever. force-dynamic makes this page
// re-evaluate enabledProviderIds on every request instead of once at build.
export const dynamic = "force-dynamic";

// Server component: which providers to render is decided here, from env
// vars read on the server, and passed down as plain data. The client
// component never reads GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID itself — those
// values (and their secrets) have no business in client-shipped code.
// `/` is only ever seen signed-out: src/proxy.ts redirects a session with a
// household to /apartments and one without to /invitations. So the landing
// page can live here without a second route, and nothing an existing user
// does passes through it.
//
// The under-development gate (#239) is read here for the same reason: the
// landing page stays up when FLATPARE_PUBLIC_ACCESS=closed, and only the
// sign-in card changes — it says that new sign-ups are closed, and it reads
// the query the sign-in flow redirects back with (a refused sign-up, or a
// beta link that was or was not accepted). Nothing about the value reaches
// client code except the notice to show.
function noticeFromQuery(q: Record<string, string | string[] | undefined>): SignInNotice {
  if (q.signin === "closed") return "sign-up-refused";
  if (q.beta === "ready") return "beta-ready";
  if (q.beta === "invalid") return "beta-invalid";
  return null;
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const query = (await searchParams) ?? {};
  return (
    <Landing
      signIn={
        <LoginForm
          providers={enabledProviderIds}
          access={readPublicAccess()}
          notice={noticeFromQuery(query)}
        />
      }
    />
  );
}
