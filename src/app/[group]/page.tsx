import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConverterSearch } from "@/components/converter-search";
import { getGroup, isGroupSlug, convertersByGroup } from "@/lib/registry";

export function generateStaticParams() {
  return [
    "documents",
    "images",
    "audio-video",
    "archives",
    "data",
    "encoding",
    "text",
    "code",
    "design",
    "units",
  ].map((group) => ({ group }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ group: string }>;
}): Promise<Metadata> {
  const { group: slug } = await params;
  const group = getGroup(slug);
  if (!group) return {};
  return {
    title: group.name,
    description: group.description,
  };
}

export default async function GroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group: slug } = await params;
  if (!isGroupSlug(slug)) notFound();
  const group = getGroup(slug)!;
  const count = convertersByGroup(slug).length;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-14 sm:px-6">
      <div className="space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-primary/80">{count} converters</p>
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{group.name}</h1>
        <p className="max-w-2xl text-muted-foreground">{group.description}</p>
      </div>
      <ConverterSearch initialGroup={slug} />
    </div>
  );
}
