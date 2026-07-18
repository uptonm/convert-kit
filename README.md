# ConvertKit

Browser-first file converters you **own end-to-end**.

## Principles

- **Conversion is owned** — EPUB↔PDF, images, ffmpeg.wasm, JSON, etc. run in your browser (or your code). We do **not** ship files to CloudConvert / ConvertAPI / similar to “do the convert.”
- **Supplementary data APIs are OK** — e.g. currency exchange rates from Frankfurter. Rates in, math local.
- **Legal** — user-owned / freely usable files only. No DRM removal, no unauthorized downloaders.

## Stack

Bun · TypeScript · Next.js (App Router) · Tailwind · shadcn/ui · Vercel serverless

**Production:** [https://convert.uptonm.dev](https://convert.uptonm.dev)

## Develop

```bash
bun install
bun run dev
```

## End-to-end tests

Playwright covers every registry converter (page load + convert happy path, or coming-soon / smoke where a fixture isn’t available).

```bash
bunx playwright install chromium   # first time
bun run test:e2e
```

Fixtures live in `e2e/fixtures/`. ffmpeg.wasm assets are served from `public/ffmpeg/` (UMD + core). HEIC convert is smoke-tested (no HEIC fixture).
