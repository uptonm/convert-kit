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
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
      <div className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-4xl tracking-tight">{group.name}</h1>
        <p className="max-w-2xl text-muted-foreground">{group.description}</p>
        <p className="text-sm text-teal-800/80">{count} converters in this group</p>
      </div>
      <ConverterSearch initialGroup={slug} />
    </div>
  );
}
