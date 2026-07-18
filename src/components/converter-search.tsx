"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ConverterCard } from "@/components/converter-card";
import { searchConverters, GROUPS, type GroupSlug } from "@/lib/registry";
import { cn } from "@/lib/utils";

export function ConverterSearch({ initialGroup }: { initialGroup?: GroupSlug }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<GroupSlug | "all">(initialGroup ?? "all");

  const results = useMemo(() => {
    let list = searchConverters(q);
    if (group !== "all") list = list.filter((c) => c.group === group);
    return list;
  }, [q, group]);

  return (
    <div className="space-y-6">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search — epub, json, mp4, temperature…"
        className="h-12 rounded-xl border-white/10 bg-white/[0.03] text-base placeholder:text-muted-foreground/60 focus-visible:border-primary/40 focus-visible:ring-primary/20"
      />
      <div className="flex flex-wrap gap-2">
        <Chip active={group === "all"} onClick={() => setGroup("all")}>
          All
        </Chip>
        {GROUPS.map((g) => (
          <Chip key={g.slug} active={group === g.slug} onClick={() => setGroup(g.slug)}>
            {g.name}
          </Chip>
        ))}
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {results.length} result{results.length === 1 ? "" : "s"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((c) => (
          <ConverterCard key={c.id} converter={c} />
        ))}
      </div>
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
