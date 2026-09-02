import { enabledProviderIds } from "@/auth";
import { LoginForm } from "./login-form";

// Server component: which providers to render is decided here, from env
// vars read on the server, and passed down as plain data. The client
// component never reads GOOGLE_CLIENT_ID / GITHUB_CLIENT_ID itself — those
// values (and their secrets) have no business in client-shipped code.
export default function LoginPage() {
  return <LoginForm providers={enabledProviderIds} />;
}
