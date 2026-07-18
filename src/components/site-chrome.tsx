import Link from "next/link";
import { GROUPS } from "@/lib/registry";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a0c]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="font-display text-[1.05rem] font-semibold tracking-tight text-foreground">
          Convert<span className="text-primary">Kit</span>
        </Link>
        <nav className="hidden items-center gap-5 lg:flex">
          {GROUPS.slice(0, 5).map((g) => (
            <Link
              key={g.slug}
              href={`/${g.slug}`}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {g.name}
            </Link>
          ))}
        </nav>
        <Link
          href="/privacy"
          className="text-[13px] text-muted-foreground transition-colors hover:text-primary"
        >
          Privacy
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-md">
          ConvertKit keeps conversion on your device. Rates APIs for currency only — never your files.
        </p>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a href="https://github.com/uptonm/convert-kit" className="hover:text-foreground">
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
