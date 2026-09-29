import fs from "fs/promises";
import path from "path";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import html from "remark-html";

export default async function GuidePage() {
  const filePath = path.join(process.cwd(), "src/content/guide.md");
  const markdown = await fs.readFile(filePath, "utf-8");
  const result = await remark().use(remarkGfm).use(html).process(markdown);

  return (
    <article
      className="guide-prose max-w-none"
      dangerouslySetInnerHTML={{ __html: String(result) }}
    />
  );
}
