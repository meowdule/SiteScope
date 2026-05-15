import { AnalyzeForm } from "@/components/AnalyzeForm";

export function SiteShell() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <header className="border-b border-surface-border pb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          SiteScope
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Website quality inspection
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          Run quick signals instantly, then let the background job crawl your
          site in a real browser, score Lighthouse and accessibility, capture
          screenshots, and flag common UI issues across mobile, tablet, and
          desktop viewports.
        </p>
      </header>

      <main className="mt-10">
        <AnalyzeForm />
      </main>
    </div>
  );
}
