import type { Metadata } from "next";

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://convert.uptonm.dev";
export const SITE_NAME = "ConvertKit";
export const DEFAULT_TITLE = "ConvertKit — Private Browser File Converters";
export const DEFAULT_DESCRIPTION =
  "Convert documents, images, audio, video, data, and more in your browser without sending files to a third-party conversion service.";

const socialImage = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "ConvertKit — files in, files out, nothing leaves your browser",
};

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: {
    default: DEFAULT_TITLE,
    template: "%s · ConvertKit",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Mike Upton", url: "https://uptonm.dev" }],
  creator: "Mike Upton",
  publisher: "Mike Upton",
  category: "utilities",
  keywords: [
    "file converter",
    "browser file conversion",
    "private file converter",
    "EPUB to PDF",
    "image converter",
    "ffmpeg wasm",
  ],
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: SITE_NAME,
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/og.png"],
  },
};

export function createPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const socialTitle = `${title} · ConvertKit`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: socialTitle,
      description,
      type: "website",
      locale: "en_US",
      url: path,
      siteName: SITE_NAME,
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: ["/og.png"],
    },
  };
}
