import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Terms</h1>
      <p className="text-muted-foreground">
        ConvertKit is provided as-is for converting files you have the right to convert. Do not use
        it to infringe copyright, remove DRM, or bypass licenses.
      </p>
      <p className="text-muted-foreground">
        Browser conversions (including ffmpeg.wasm) have practical size and duration limits. Results
        for complex documents may be text-forward rather than pixel-perfect layout clones.
      </p>
    </article>
  );
}
