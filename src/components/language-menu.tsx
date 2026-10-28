"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { languageOf, LOCALE_NAMES, LOCALES, writeLocaleCookie, type Locale } from "@/locales/locales";

// The language selector (#288). Visible wherever the theme toggle is: the
// app's nav bar and the landing page's. Each language is named in itself, so
// someone who cannot read the current one can still find theirs.
//
// The cookie is the choice (src/i18n/request.ts reads it on every request).
// Signed in, the choice is also saved on the account so it follows the
// person to another device and picks the language of emails sent to them;
// that save is best-effort — the cookie already changed the page.
//
// The trigger is the globe alone (#407); its label names the current
// language. Not flags: a language is not a country (French, Italian and
// German are all Swiss languages here, English is no one country's).
export function LanguageMenu({ signedIn = false, className }: { signedIn?: boolean; className?: string }) {
  const t = useTranslations("language");
  const locale = languageOf(useLocale());
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    writeLocaleCookie(next);
    if (signedIn) {
      void fetch("/api/account/locale", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      }).catch(() => {});
    }
    startTransition(() => router.refresh());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("choose", { current: LOCALE_NAMES[locale] })}
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-md transition-colors hover:bg-muted",
          pending && "opacity-60",
          className
        )}
      >
        <Globe className="h-[18px] w-[18px]" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={4}>
        {LOCALES.map((l) => (
          <DropdownMenuItem key={l} onClick={() => choose(l)} lang={l}>
            <Check className={cn("h-3.5 w-3.5", l !== locale && "invisible")} aria-hidden />
            {LOCALE_NAMES[l]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
