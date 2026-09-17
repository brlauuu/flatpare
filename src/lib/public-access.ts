// The under-development gate (#239).
//
// FLATPARE_PUBLIC_ACCESS decides whether strangers may CREATE an account:
//   - unset, empty or "open"  — anyone may sign up. The self-hoster default,
//                                like every other switch in this app: a
//                                self-hoster must never be shown a holding
//                                notice for someone else's launch.
//   - "closed"                — the landing page stays up and existing
//                                accounts keep signing in, but a sign-in
//                                that would create a NEW account is refused
//                                unless it carries a beta pass
//                                (src/lib/beta-pass.ts) or a pending
//                                invitation from an existing household.
//
// It is a runtime switch, not a deploy-time branch, so nothing here drifts
// from main. Anything else fails loudly at first use rather than being
// coerced into "open" — silently opening the door is the worse surprise.
//
// Zero imports, so any layer (the server component that renders the notice,
// the Auth.js callback that enforces it) can read it.
export type PublicAccess = "open" | "closed";

export class PublicAccessConfigError extends Error {
  constructor(raw: string) {
    super(
      `FLATPARE_PUBLIC_ACCESS must be "open", "closed" or unset, got "${raw}". ` +
        "Unset (or empty) means open, which is the self-hosted default."
    );
    this.name = "PublicAccessConfigError";
  }
}

export function readPublicAccess(): PublicAccess {
  const raw = process.env.FLATPARE_PUBLIC_ACCESS;
  if (raw === undefined) return "open";
  const value = raw.trim();
  if (value === "" || value === "open") return "open";
  if (value === "closed") return "closed";
  throw new PublicAccessConfigError(raw);
}
