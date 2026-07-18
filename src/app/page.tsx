import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ConverterSearch } from "@/components/converter-search";
import { FormatMorph } from "@/components/format-morph";
import { popularConverters, converterHref } from "@/lib/registry";

export default function HomePage() {
  const popular = popularConverters().slice(0, 6);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <FormatMorph />
        <div className="relative z-[1] mx-auto flex min-h-[min(78vh,720px)] max-w-6xl flex-col justify-center px-4 py-20 sm:px-6 sm:py-24">
          <p className="ck-rise font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
            Local conversion · convert.uptonm.dev
          </p>
          <h1 className="ck-rise ck-rise-delay-1 mt-4 max-w-[11ch] font-display text-[clamp(3.5rem,13vw,8rem)] font-extrabold leading-[0.86] tracking-[-0.055em] text-foreground">
            Convert
            <span className="text-primary">Kit</span>
          </h1>
          <p className="ck-rise ck-rise-delay-2 mt-7 max-w-md text-lg text-muted-foreground text-balance sm:text-xl">
            Files in. Files out. Nothing leaves your browser.
          </p>
          <div className="ck-rise ck-rise-delay-3 mt-10 flex flex-wrap items-center gap-3">
            <a
              href="#catalog"
              className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
            >
              Browse converters
            </a>
            <Link
              href="/documents/epub-to-pdf"
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-5 text-sm text-foreground/90 transition hover:border-primary/50 hover:text-primary"
            >
              Try EPUB → PDF
              <ArrowUpRight className="size-3.5 opacity-70" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="mb-8">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Reach for these first</h2>
          <p className="mt-1 text-sm text-muted-foreground">Live converters, ready in the browser.</p>
        </div>
        <ul className="divide-y divide-white/5 border-y border-white/5">
          {popular.map((c, idx) => (
            <li key={c.id}>
              <Link
                href={converterHref(c)}
                className="group flex items-center gap-4 py-4 transition-colors hover:bg-white/[0.02] sm:gap-6"
              >
                <span className="w-8 font-mono text-xs text-muted-foreground/70">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold tracking-tight group-hover:text-primary sm:text-lg">
                    {c.title}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted-foreground">{c.description}</span>
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="catalog" className="mx-auto max-w-6xl space-y-8 px-4 pb-24 sm:px-6">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Full catalog</h2>
          <p className="mt-1 text-sm text-muted-foreground">Search by format, or filter by group.</p>
        </div>
        <ConverterSearch />
      </section>
    </div>
  );
}
