import type common from "../../messages/en/common.json";
import type language from "../../messages/en/language.json";
import type nav from "../../messages/en/nav.json";
import type apartments from "../../messages/en/apartments.json";
import type compare from "../../messages/en/compare.json";
import type map from "../../messages/en/map.json";
import type household from "../../messages/en/household.json";
import type settings from "../../messages/en/settings.json";
import type crypto from "../../messages/en/crypto.json";
import type auth from "../../messages/en/auth.json";
import type invitations from "../../messages/en/invitations.json";
import type billing from "../../messages/en/billing.json";
import type errors from "../../messages/en/errors.json";
import type { Locale } from "./locales";

// English is the source catalogue (#288): a key used anywhere must exist in
// messages/en/, and a locale outside the five does not type-check. That the
// other four have the same keys and placeholders is checked by
// src/i18n/__tests__/catalogues.test.ts. One line per namespace in
// src/i18n/messages.ts.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: {
      common: typeof common;
      language: typeof language;
      nav: typeof nav;
      apartments: typeof apartments;
      compare: typeof compare;
      map: typeof map;
      household: typeof household;
      settings: typeof settings;
      crypto: typeof crypto;
      auth: typeof auth;
      invitations: typeof invitations;
      billing: typeof billing;
      errors: typeof errors;
    };
  }
}
