<p align="center">
  <img src="./public/icon-192.png" width="96" alt="ConvertKit logo">
</p>

<h1 align="center"><code>convert-kit</code></h1>

<p align="center"><strong>Files in. Files out. Your files never leave your browser.</strong></p>

<p align="center">
  Ninety-eight live converter pages for documents, media, data, text, design, and more.<br>
  JavaScript and WebAssembly own the conversion path—no file-conversion SaaS in the middle.
</p>

<p align="center">
  <a href="https://convert.uptonm.dev">Website</a> ·
  <a href="#converter-catalog">Converter catalog</a> ·
  <a href="https://convert.uptonm.dev/privacy">Privacy</a> ·
  <a href="https://convert.uptonm.dev/terms">Terms</a>
</p>

## Use it

Open [convert.uptonm.dev](https://convert.uptonm.dev), search by input or
output format, then run the conversion in the browser. File-based, text-based,
and bidirectional tools share the same registry-driven workflow.

## Converter catalog

| Group | Examples |
| --- | --- |
| Documents | EPUB, MOBI, AZW3, FB2, CBZ, PDF, DOCX, ODT, PPTX, XLSX, LaTeX, Markdown, and images-to-PDF |
| Images | PNG, JPEG, WebP, SVG, HEIC, resize, Base64, and favicon packs |
| Audio and video | MP3, WAV, MP4, WebM, MOV, MKV, GIF, trim, and audio extraction through ffmpeg.wasm |
| Archives | Create and extract ZIP files |
| Data | JSON, YAML, TOML, XML, CSV, Excel, and Parquet |
| Encoding and security | Base64, hashes, JWT inspection, URL encoding, and number bases |
| Text | Case conversion, slugify, Markdown, diffs, line tools, and word counts |
| Code and web | Source beautification, Open Graph metadata extraction, and user-agent parsing |
| Design | Color formats, contrast, gradients, and aspect ratios |
| Units and time | Temperature, length, weight, data size, currency, timestamps, time zones, and cron expressions |

The registry in [`src/lib/registry`](./src/lib/registry) defines catalog
routes, format pairings, engines, status, and reverse links. Runtime conversion
logic lives in [`src/lib`](./src/lib), while Playwright drive plans and fixtures
live under [`e2e`](./e2e).

## Privacy model

- File conversions run locally with browser APIs, JavaScript, or bundled
  WebAssembly. Files are not uploaded to CloudConvert, ConvertAPI, or a similar
  conversion service.
- Audio and video conversions use self-hosted ffmpeg.wasm assets from
  [`public/ffmpeg`](./public/ffmpeg).
- Currency conversion sends the amount and currency codes—but never a file—to
  a server route backed by the public Frankfurter exchange-rate service.
- ConvertKit does not remove DRM or provide unauthorized downloaders. Only
  convert files you own or have permission to use.

## Develop

```bash
cp .env.example .env.local
bun install
bun run dev
```

`NEXT_PUBLIC_SITE_URL` controls canonical URLs and sitemap metadata. No
file-conversion API key is required.

## Development

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the Next.js development server |
| `bun run build` | Create a production build |
| `bun start` | Serve the production build |
| `bun run test:e2e` | Exercise the catalog and converter flows with Playwright |
| `bun run test:e2e:ui` | Run the Playwright suite interactively |

Install the browser once before the first end-to-end run:

```bash
bunx playwright install chromium
bun run test:e2e
```

Playwright iterates the converter registry, checks every route, and runs either
a real fixture conversion or an explicit smoke path. Fixtures live in
[`e2e/fixtures`](./e2e/fixtures).

## Practical limits

Browser memory and CPU bound large conversions, especially audio and video.
ffmpeg conversions enforce an 80 MB input limit, reduced to 40 MB for GIF;
short clips are recommended. Complex ebook and office conversions are
intentionally text-forward and best-effort rather than pixel-perfect layout
clones.
