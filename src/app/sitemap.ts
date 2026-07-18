import { CONVERTERS, GROUPS } from "@/lib/registry";

export default function sitemap() {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const now = new Date();
  return [
    { url: base, lastModified: now },
    { url: `${base}/privacy`, lastModified: now },
    { url: `${base}/terms`, lastModified: now },
    ...GROUPS.map((g) => ({ url: `${base}/${g.slug}`, lastModified: now })),
    ...CONVERTERS.map((c) => ({
      url: `${base}/${c.group}/${c.slug}`,
      lastModified: now,
    })),
  ];
}
