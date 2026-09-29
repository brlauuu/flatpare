import { SectionWidth } from "./section-width";

// Shown the moment a link is clicked, while the next page's payload is on its
// way (#302). Every route here is dynamic (the layout reads the session), and
// without this file Next.js prefetches nothing for a dynamic route, so a
// click did nothing visible until the server answered.
export default function Loading() {
  return (
    <SectionWidth>
      <p role="status" className="text-sm text-muted-foreground">
        Loading…
      </p>
    </SectionWidth>
  );
}
