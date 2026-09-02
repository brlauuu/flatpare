import { enabledProviderIds } from "@/auth";
import { LoginForm } from "./login-form";

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
export default function LoginPage() {
  return <LoginForm providers={enabledProviderIds} />;
}
