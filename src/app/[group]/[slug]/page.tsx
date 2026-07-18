import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConverterShell } from "@/components/converter-shell";
import { CONVERTERS, getConverter, isGroupSlug } from "@/lib/registry";
import { createPageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return CONVERTERS.map((c) => ({ group: c.group, slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ group: string; slug: string }>;
}): Promise<Metadata> {
  const { group, slug } = await params;
  const converter = getConverter(group, slug);
  if (!converter) return {};
  return createPageMetadata({
    title: converter.title,
    description: converter.description,
    path: `/${group}/${slug}`,
  });
}

export default async function ConverterPage({
  params,
}: {
  params: Promise<{ group: string; slug: string }>;
}) {
  const { group, slug } = await params;
  if (!isGroupSlug(group)) notFound();
  const converter = getConverter(group, slug);
  if (!converter) notFound();
  return (
    <div className="px-4 py-12">
      <ConverterShell converter={converter} />
    </div>
  );
}
