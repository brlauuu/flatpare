"use client";

import { useTranslations } from "next-intl";
import { FlowError } from "./flows";

// The words for an error a crypto flow threw (#288). flows.ts is not React
// and keeps its errors English, so the screens translate them here:
//   - a wrong passphrase or recovery code, by its code;
//   - a state error, by its fixed English message (each is one of the
//     literals thrown in flows.ts or the provider);
//   - an http error is the server's own text, shown as sent;
//   - anything else falls back to the caller's message.
const STATE_KEYS = {
  "No keys to unlock": "noKeysToUnlock",
  "Generated an invalid recovery code": "invalidGeneratedCode",
  "Keys already exist": "keysExist",
  "Only the owner can create the household key": "ownerOnlyHouseholdKey",
  "The household key already exists": "householdKeyExists",
  "You do not hold the household key": "noHouseholdKey",
  "No wrap has arrived yet": "noWrapYet",
  "This household has no recovery kit": "noRecoveryKit",
  "Status not loaded": "statusNotLoaded",
  "Keys not loaded": "keysNotLoaded",
} as const;

type FallbackKey =
  | "setup.failed"
  | "unlock.failed"
  | "householdKey.failed"
  | "forgot.reset.failed"
  | "forgot.recover.failed"
  | "settings.changeFailed"
  | "settings.regenerateFailed"
  | "provider.somethingWrong";

export function useFlowErrorText() {
  const t = useTranslations("crypto");
  return (err: unknown, fallback: FallbackKey): string => {
    if (err instanceof FlowError) {
      if (err.code === "wrong-passphrase") return t("errors.wrongPassphrase");
      if (err.code === "bad-recovery-code") return t("errors.badRecoveryCode");
      if (err.code === "http") return err.message;
    }
    if (err instanceof Error) {
      const key = STATE_KEYS[err.message as keyof typeof STATE_KEYS];
      return key ? t(`errors.${key}`) : err.message;
    }
    return t(fallback);
  };
}
