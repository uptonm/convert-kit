import Link from "next/link";
import { ConverterSearch } from "@/components/converter-search";
import { ConverterCard } from "@/components/converter-card";
import { GROUPS, popularConverters } from "@/lib/registry";

export default function HomePage() {
  const popular = popularConverters();

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:py-24">
          <div className="space-y-5">
            <p className="font-[family-name:var(--font-display)] text-5xl leading-[0.95] tracking-tight text-primary sm:text-6xl lg:text-7xl">
              ConvertKit
            </p>
            <h1 className="max-w-xl text-xl text-foreground/90 sm:text-2xl">
              Own every conversion end-to-end — in your browser, on your files.
            </h1>
            <p className="max-w-lg text-sm text-muted-foreground">
              No third-party conversion APIs. EPUB, PDF, images, ffmpeg.wasm, data formats, and more.
              Rates APIs for currency are fine; your files never get shipped out to be converted.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {GROUPS.map((g) => (
                <Link
                  key={g.slug}
                  href={`/${g.slug}`}
                  className="rounded-full border border-primary/25 bg-[var(--surface)] px-3 py-1.5 text-sm text-primary transition-colors hover:border-primary/50"
                >
                  {g.name}
                </Link>
              ))}
            </div>
          </div>
          <div
            aria-hidden
            className="relative min-h-56 overflow-hidden rounded-2xl border border-teal-900/10 bg-[linear-gradient(145deg,#0f766e_0%,#134e4a_45%,#1c1917_100%)] shadow-[0_30px_80px_rgba(15,118,110,0.25)]"
          >
            <div className="absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(90deg,transparent,transparent_11px,rgba(255,255,255,0.06)_12px),repeating-linear-gradient(0deg,transparent,transparent_11px,rgba(255,255,255,0.04)_12px)]" />
            <div className="absolute bottom-6 left-6 right-6 space-y-2 text-teal-50">
              <p className="font-[family-name:var(--font-display)] text-2xl">Browser-owned pipeline</p>
              <p className="text-sm text-teal-100/80">WASM · Canvas · pdf-lib · ffmpeg.wasm</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-8 px-4 py-12">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-foreground">Popular</h2>
          <p className="text-sm text-muted-foreground">Live converters people reach for first.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {popular.map((c) => (
            <ConverterCard key={c.id} converter={c} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-6 px-4 pb-20">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-foreground">Catalog</h2>
          <p className="text-sm text-muted-foreground">Search the full registry — live and coming soon.</p>
        </div>
        <ConverterSearch />
      </section>
    </div>
  );
}
