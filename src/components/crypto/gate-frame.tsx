// The full-screen gate look for the encryption screens (#324): the landing
// page's grid behind a framed card with the hero shadow. A leaf — it imports
// nothing from the app — so wrapping the screens in crypto-provider adds no
// edge to the graph no-import-cycle.test.ts guards. Everything decorative is
// dropped in print, because the recovery kit is printed on paper.
export function GateFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-start justify-center bg-[linear-gradient(var(--muted)_2px,transparent_2px),linear-gradient(90deg,var(--muted)_2px,transparent_2px)] bg-[size:48px_48px] px-4 py-10 sm:py-16 print:bg-none print:p-0">
      <div
        data-testid="gate-frame"
        className="w-full max-w-md border-3 border-frame bg-card p-6 shadow-hero sm:p-8 print:max-w-none print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none"
      >
        {children}
      </div>
    </div>
  );
}
