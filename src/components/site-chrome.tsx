import Link from "next/link";
import { GROUPS } from "@/lib/registry";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-[var(--surface)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-xl tracking-tight text-foreground"
        >
          Convert<span className="text-primary">Kit</span>
        </Link>
        <nav className="hidden items-center gap-3 md:flex">
          {GROUPS.slice(0, 6).map((g) => (
            <Link
              key={g.slug}
              href={`/${g.slug}`}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {g.name}
            </Link>
          ))}
        </nav>
        <Link
          href="/privacy"
          className="rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
        >
          Privacy
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/80 bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          ConvertKit — own the conversion. Supplementary APIs for rates only. No DRM tools.
        </p>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
