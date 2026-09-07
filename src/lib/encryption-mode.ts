export type EncryptionMode = "on" | "off";

// Key in the `settings` table where the mode is stamped on first boot.
export const ENCRYPTION_MODE_SETTING = "encryption_mode";

// Values are matched exactly on purpose: "OFF" or "false" failing boot is
// better than a deployment silently running encrypted when the operator
// believed they had turned it off.
//
// The empty string counts as unset on purpose: `docker-compose.yml` passes
// `FLATPARE_ENCRYPTION=${FLATPARE_ENCRYPTION:-}`, so every self-hoster who
// does not set the variable arrives here with "" rather than undefined.
// Tightening this to reject "" would break `docker compose up` out of the box.
export function readEncryptionMode(
  value: string | undefined = process.env.FLATPARE_ENCRYPTION
): EncryptionMode {
  if (value === undefined || value === "" || value === "on") return "on";
  if (value === "off") return "off";
  throw new Error(
    `FLATPARE_ENCRYPTION must be "on" or "off" (got ${JSON.stringify(value)}). ` +
      "Leave it unset to run with encryption on."
  );
}
