"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ConverterCard } from "@/components/converter-card";
import { searchConverters, GROUPS, type GroupSlug } from "@/lib/registry";
import { Button } from "@/components/ui/button";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search converters — epub, json, mp4, temperature…"
          className="h-11 bg-[var(--surface)]"
        />
      </div>
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
      <p className="text-sm text-muted-foreground">
        {results.length} converter{results.length === 1 ? "" : "s"}
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
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn(active && "bg-teal-800 text-teal-50 hover:bg-teal-800")}
    >
      {children}
    </Button>
  );
}
