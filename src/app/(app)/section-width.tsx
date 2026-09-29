// Caps a section at the width it had when each section owned its own
// `<main className="max-w-5xl px-4">`: 64rem less the 1rem gutter on each
// side, which now lives on the shared <main> in layout.tsx.
export function SectionWidth({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[62rem]">{children}</div>;
}
