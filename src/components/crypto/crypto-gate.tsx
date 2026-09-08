import { readEncryptionMode } from "@/lib/encryption-mode";
import { CryptoProvider } from "./crypto-provider";

// Server component: reads the env var once per request so no env access
// ships to the client. Layouts wrap their page content in this.
export function CryptoGate({ children }: { children: React.ReactNode }) {
  return <CryptoProvider mode={readEncryptionMode()}>{children}</CryptoProvider>;
}
