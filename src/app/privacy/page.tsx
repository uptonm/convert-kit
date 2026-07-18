import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-12 prose-headings:font-[family-name:var(--font-display)]">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">Privacy</h1>
      <p className="text-muted-foreground">
        ConvertKit is built so you own the conversion pipeline. File conversion runs in your browser
        (JavaScript / WASM). Your files are not uploaded to a third-party conversion service.
      </p>
      <h2 className="font-[family-name:var(--font-display)] text-2xl pt-4">What leaves your device</h2>
      <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">Client converters</strong> — nothing. Processing stays local.
        </li>
        <li>
          <strong className="text-foreground">Currency rates</strong> — we request public exchange-rate
          data (amount + currency codes only). No files.
        </li>
      </ul>
      <h2 className="font-[family-name:var(--font-display)] text-2xl pt-4">What we do not do</h2>
      <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
        <li>No DRM removal or unauthorized downloaders</li>
        <li>No shipping your documents to CloudConvert / ConvertAPI-style services</li>
      </ul>
    </article>
  );
}
