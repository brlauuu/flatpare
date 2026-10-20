import fs from "fs/promises";
import path from "path";
import { getLocale } from "next-intl/server";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import html from "remark-html";
import { languageOf } from "@/i18n/locales";

// The guide in the reader's language (#288): src/content/guide.<locale>.md.
// languageOf only ever answers one of the five, so the path is one of five
// files in this repo whatever the cookie says.
export default async function GuidePage() {
  const locale = languageOf(await getLocale());
  const filePath = path.join(process.cwd(), `src/content/guide.${locale}.md`);
  const markdown = await fs.readFile(filePath, "utf-8");
  const result = await remark().use(remarkGfm).use(html).process(markdown);

  return (
    <article
      lang={locale}
      className="guide-prose max-w-none"
      dangerouslySetInnerHTML={{ __html: String(result) }}
    />
  );
}
