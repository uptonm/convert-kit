import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { converterHref, type ConverterDef } from "@/lib/registry";
import { cn } from "@/lib/utils";

export function EngineBadge({ engine, status }: { engine: ConverterDef["engine"]; status: ConverterDef["status"] }) {
  if (status === "coming-soon") {
    return <Badge variant="secondary">Coming soon</Badge>;
  }
  if (engine === "ffmpeg") {
    return <Badge className="bg-teal-800 text-teal-50 hover:bg-teal-800">Runs in browser · ffmpeg</Badge>;
  }
  return <Badge className="bg-teal-700 text-teal-50 hover:bg-teal-700">Runs in browser</Badge>;
}

export function ConverterCard({ converter, className }: { converter: ConverterDef; className?: string }) {
  const disabled = converter.status === "coming-soon";
  const inner = (
    <div
      className={cn(
        "group rounded-xl border border-border/80 bg-[var(--surface)] p-4 transition-all",
        disabled ? "opacity-70" : "hover:border-teal-700/40 hover:shadow-[0_8px_30px_rgba(15,118,110,0.08)]",
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="font-[family-name:var(--font-display)] text-base leading-snug text-foreground">
          {converter.title}
        </h3>
        <EngineBadge engine={converter.engine} status={converter.status} />
      </div>
      <p className="text-sm text-muted-foreground line-clamp-2">{converter.description}</p>
      {converter.subgroup ? (
        <p className="mt-3 text-xs uppercase tracking-wide text-teal-800/70">{converter.subgroup}</p>
      ) : null}
    </div>
  );

  if (disabled) return inner;
  return (
    <Link href={converterHref(converter)} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40 rounded-xl">
      {inner}
    </Link>
  );
}
