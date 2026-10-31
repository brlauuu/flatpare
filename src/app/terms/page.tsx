import fs from "fs/promises";
import path from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import html from "remark-html";
import { languageOf } from "@/locales/locales";
import { fillOperator, readOperator } from "@/lib/operator";
import { ThemedLogo } from "@/components/themed-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageMenu } from "@/components/language-menu";

// The terms and privacy page (#474): src/content/terms.<locale>.md, with the
// operator filled in from configuration. Public, signed in or not, and
// outside the signed-in layout: reading the terms must not need a key.
// Without an operator configured (a self-hosted copy) there is no page.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("landing.terms");
  return { title: t("title") };
}

export default async function TermsPage() {
  const operator = readOperator();
  if (!operator) notFound();

  const locale = languageOf(await getLocale());
  const t = await getTranslations("landing.terms");
  const filePath = path.join(process.cwd(), `src/content/terms.${locale}.md`);
  const markdown = fillOperator(await fs.readFile(filePath, "utf-8"), operator);
  const result = await remark().use(remarkGfm).use(html).process(markdown);

  return (
    <>
      <header className="border-b-3 border-frame">
        <div className="mx-auto flex h-12 max-w-[62rem] items-center justify-between gap-2 px-4 sm:h-14">
          <Link href="/" className="flex min-h-11 items-center sm:min-h-0" aria-label={t("home")}>
            <ThemedLogo width={120} height={37} className="h-7 w-auto sm:h-8" />
          </Link>
          <div className="flex items-center gap-1">
            <LanguageMenu />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[62rem] flex-1 px-4 py-8">
        <article
          lang={locale}
          className="guide-prose max-w-none"
          dangerouslySetInnerHTML={{ __html: String(result) }}
        />
      </main>
    </>
  );
}
