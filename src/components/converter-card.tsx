import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { converterHref, type ConverterDef } from "@/lib/registry";
import { cn } from "@/lib/utils";

export function EngineBadge({
  engine,
  status,
}: {
  engine: ConverterDef["engine"];
  status: ConverterDef["status"];
}) {
  if (status === "coming-soon") {
    return (
      <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wide">
        Soon
      </Badge>
    );
  }
  if (engine === "ffmpeg") {
    return (
      <Badge className="border border-primary/25 bg-primary/10 font-mono text-[10px] uppercase tracking-wide text-primary hover:bg-primary/10">
        ffmpeg
      </Badge>
    );
  }
  return (
    <Badge className="border border-white/10 bg-white/5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-white/5">
      Local
    </Badge>
  );
}

export function ConverterCard({ converter, className }: { converter: ConverterDef; className?: string }) {
  const disabled = converter.status === "coming-soon";
  const inner = (
    <div
      className={cn(
        "group h-full rounded-xl border border-white/8 bg-white/[0.02] p-4 transition-all duration-200",
        disabled
          ? "opacity-55"
          : "hover:-translate-y-0.5 hover:border-primary/35 hover:bg-white/[0.035]",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="font-display text-[15px] font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary">
          {converter.title}
        </h3>
        <EngineBadge engine={converter.engine} status={converter.status} />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">{converter.description}</p>
      {converter.subgroup ? (
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
          {converter.subgroup}
        </p>
      ) : null}
    </div>
  );

  if (disabled) return inner;
  return (
    <Link
      href={converterHref(converter)}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {inner}
    </Link>
  );
}
