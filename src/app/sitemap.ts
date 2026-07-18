import { CONVERTERS, GROUPS } from "@/lib/registry";
import { SITE_URL } from "@/lib/seo";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly" as const, priority: 1 },
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    ...GROUPS.map((group) => ({
      url: `${SITE_URL}/${group.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...CONVERTERS.map((c) => ({
      url: `${SITE_URL}/${c.group}/${c.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
