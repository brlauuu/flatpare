import { SectionWidth } from "../section-width";

// Presentation only, and deliberately synchronous: anything awaited here
// would block navigation into this section again (#302). Auth, the purchase
// gate and the providers all live in the shared layout one level up.
export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <SectionWidth>{children}</SectionWidth>;
}
