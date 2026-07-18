import type { GroupDef, GroupSlug } from "./types";

export const GROUPS: GroupDef[] = [
  {
    slug: "documents",
    name: "Documents",
    description: "Ebooks, office files, PDF toolkit, and markup to print.",
  },
  {
    slug: "images",
    name: "Images",
    description: "Format swaps, resize, QR codes, and image utilities.",
  },
  {
    slug: "audio-video",
    name: "Audio & video",
    description: "Short clips via ffmpeg.wasm — extract, convert, trim.",
  },
  {
    slug: "archives",
    name: "Archives",
    description: "ZIP create and extract entirely in your browser.",
  },
  {
    slug: "data",
    name: "Data formats",
    description: "JSON, YAML, CSV, Excel, and structured interchange.",
  },
  {
    slug: "encoding",
    name: "Encoding & security",
    description: "Base64, hashes, JWT inspect, and number bases.",
  },
  {
    slug: "text",
    name: "Text & writing",
    description: "Case styles, slugify, markdown, diffs, and counts.",
  },
  {
    slug: "code",
    name: "Code & web",
    description: "Minify, beautify, meta tags, and developer helpers.",
  },
  {
    slug: "design",
    name: "Design",
    description: "Colors, contrast, gradients, and favicon packs.",
  },
  {
    slug: "units",
    name: "Units & time",
    description: "Temperature, length, currency, timestamps, timezones.",
  },
];

export function getGroup(slug: string): GroupDef | undefined {
  return GROUPS.find((g) => g.slug === slug);
}

export function isGroupSlug(slug: string): slug is GroupSlug {
  return GROUPS.some((g) => g.slug === slug);
}
