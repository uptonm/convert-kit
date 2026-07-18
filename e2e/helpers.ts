import path from "node:path";
import type { Page } from "@playwright/test";
import type { ConverterDef } from "../src/lib/registry/types";

export const FIXTURES = path.join(__dirname, "fixtures");

export function fixture(...parts: string[]) {
  return path.join(FIXTURES, ...parts);
}

/** Tiny PNG as data URL for base64-to-image */
export const PIXEL_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export async function gotoConverter(page: Page, c: ConverterDef) {
  await page.goto(`/${c.group}/${c.slug}`);
  await page.getByTestId("converter-title").waitFor();
}

export async function setTextInput(page: Page, value: string) {
  await page.getByTestId("text-input").fill(value);
}

export async function setFileInput(page: Page, ...files: string[]) {
  await page.getByTestId("file-input").setInputFiles(files);
  // Wait for React state to reflect selection (filename appears in dropzone)
  const firstName = files[0]?.split("/").pop();
  if (firstName) {
    await expect(page.getByText(firstName, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
  }
}

export async function clickConvert(page: Page) {
  await page.getByTestId("convert-button").click();
}

export async function expectTextResult(page: Page, includes: string | RegExp) {
  const result = page.getByTestId("text-result");
  await result.waitFor({ state: "visible" });
  if (typeof includes === "string") {
    await expect.poll(async () => result.inputValue()).toContain(includes);
  } else {
    await expect.poll(async () => result.inputValue()).toMatch(includes);
  }
}

// re-export expect for helpers that need poll — import from test in callers instead
import { expect } from "@playwright/test";
export { expect };

export type DriveKind = "coming-soon" | "text" | "file" | "download" | "multi" | "smoke";

export function drivePlan(c: ConverterDef): {
  kind: DriveKind;
  files?: string[];
  text?: string;
  expectText?: string | RegExp;
  /** option fields by label approximation — filled via getByLabel when present */
  labels?: Record<string, string>;
} {
  if (c.status === "coming-soon") return { kind: "coming-soon" };

  switch (c.slug) {
    case "epub-to-pdf":
      return { kind: "download", files: [fixture("sample.epub")] };
    case "pdf-to-epub":
      return { kind: "download", files: [fixture("sample.pdf")] };
    case "pdf-merge":
      return { kind: "download", files: [fixture("sample.pdf"), fixture("sample.pdf")] };
    case "pdf-split":
      return { kind: "download", files: [fixture("sample.pdf")], labels: { "Start page": "1", "End page": "1" } };
    case "images-to-pdf":
      return { kind: "download", files: [fixture("pixel.png"), fixture("pixel.jpg")] };
    case "markdown-to-html":
      return { kind: "text", text: "# Hi\n\nThere", expectText: "<h1" };
    case "html-to-markdown":
      return { kind: "text", text: "<h1>Hi</h1><p>There</p>", expectText: "Hi" };
    case "markdown-to-pdf":
      return { kind: "download", text: "# PDF from MD" };
    case "txt-to-pdf":
      return { kind: "download", text: "Plain text to PDF" };

    case "png-to-jpg":
    case "png-to-webp":
    case "image-to-base64":
    case "resize-image":
    case "favicon-pack":
      return { kind: c.slug === "favicon-pack" ? "multi" : c.slug === "image-to-base64" ? "text" : "download", files: [fixture("pixel.png")], expectText: c.slug === "image-to-base64" ? "data:image" : undefined };
    case "jpg-to-png":
    case "jpg-to-webp":
      return { kind: "download", files: [fixture("pixel.jpg")] };
    case "webp-to-png":
    case "webp-to-jpg":
      return { kind: "download", files: [fixture("pixel.webp")] };
    case "svg-to-png":
      return { kind: "download", files: [fixture("sample.svg")] };
    case "heic-to-jpg":
      // No reliable HEIC fixture in CI — smoke the page + empty convert error
      return { kind: "smoke" };
    case "base64-to-image":
      return { kind: "download", text: PIXEL_PNG_DATA_URL };
    case "qr-code":
      return { kind: "download", text: "https://example.com/convertkit" };

    case "mp4-to-webm":
    case "video-to-gif":
    case "video-to-mp3":
    case "trim-video":
      return { kind: "download", files: [fixture("sample.mp4")] };
    case "webm-to-mp4":
      return { kind: "download", files: [fixture("sample.webm")] };
    case "mov-to-mp4":
      return { kind: "download", files: [fixture("sample.mov")] };
    case "mkv-to-mp4":
      return { kind: "download", files: [fixture("sample.mkv")] };
    case "mp3-to-wav":
      return { kind: "download", files: [fixture("sample.mp3")] };
    case "wav-to-mp3":
      return { kind: "download", files: [fixture("sample.wav")] };
    case "srt-to-vtt":
      return { kind: "text", text: "1\n00:00:00,000 --> 00:00:01,000\nHi\n", expectText: "WEBVTT" };
    case "vtt-to-srt":
      return { kind: "text", text: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi\n", expectText: "," };

    case "zip-create":
      return { kind: "download", files: [fixture("sample.txt"), fixture("sample.json")] };
    case "zip-extract":
      return { kind: "multi", files: [fixture("sample.zip")] };

    case "json-to-yaml":
      return { kind: "text", text: '{"a":1}', expectText: "a:" };
    case "yaml-to-json":
      return { kind: "text", text: "a: 1\n", expectText: '"a"' };
    case "json-to-toml":
      return { kind: "text", text: '{"a":1}', expectText: "a" };
    case "toml-to-json":
      return { kind: "text", text: 'a = 1\n', expectText: '"a"' };
    case "json-to-xml":
      return { kind: "text", text: '{"a":1}', expectText: "<" };
    case "xml-to-json":
      return { kind: "text", text: "<root><a>1</a></root>", expectText: "{" };
    case "json-to-csv":
      return { kind: "text", text: '[{"name":"Ada"}]', expectText: "name" };
    case "csv-to-json":
      return { kind: "text", text: "name,age\nAda,36\n", expectText: "Ada" };
    case "csv-to-xlsx":
      return { kind: "download", files: [fixture("sample.csv")] };
    case "json-pretty":
      return { kind: "text", text: '{"a":1}', expectText: "{\n" };
    case "query-to-json":
      return { kind: "text", text: "a=1&b=two", expectText: '"a"' };
    case "json-to-query":
      return { kind: "text", text: '{"a":"1"}', expectText: "a=" };

    case "base64":
      return { kind: "text", text: "hello", expectText: /[A-Za-z0-9+/=]+/ };
    case "url-encode":
      return { kind: "text", text: "a b", expectText: "a%20b" };
    case "html-encode":
      return { kind: "text", text: "<b>", expectText: "&lt;" };
    case "hash":
      return { kind: "text", text: "hello", expectText: /^[a-f0-9]{64}$/i };
    case "jwt-decode":
      return {
        kind: "text",
        text: "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjMifQ.",
        expectText: "header",
      };
    case "uuid":
      return { kind: "text", text: "", expectText: /^[0-9a-f-]{36}$/i };
    case "number-base":
      return { kind: "text", text: "255", expectText: "ff" };

    case "case":
      return { kind: "text", text: "hello world", expectText: "helloWorld" };
    case "slugify":
      return { kind: "text", text: "Hello World!", expectText: "hello-world" };
    case "word-count":
      return { kind: "text", text: "one two three", expectText: '"words": 3' };
    case "lorem":
      return { kind: "text", text: "", expectText: "Lorem" };
    case "diff":
      return { kind: "text", text: "line2\n", expectText: /[+-]/, labels: { "Text A": "line1\n" } };
    case "sort-lines":
      return { kind: "text", text: "b\na\n", expectText: "a" };

    case "beautify-minify":
      return { kind: "text", text: '{"a":1}', expectText: "{\n" };
    case "meta-extractor":
      return {
        kind: "text",
        text: '<html><head><title>T</title><meta name="description" content="D"></head></html>',
        expectText: '"title": "T"',
      };
    case "user-agent":
      return { kind: "text", text: "Mozilla/5.0 (Macintosh) Chrome/120.0", expectText: "browser" };

    case "color":
      return { kind: "text", text: "#0f766e", expectText: "hex" };
    case "contrast":
      return { kind: "text", text: "#ffffff", expectText: "ratio", labels: { "Foreground color": "#000000" } };
    case "gradient":
      return { kind: "text", text: "#134e4a", expectText: "linear-gradient" };
    case "aspect-ratio":
      return { kind: "text", text: "1920", expectText: "height" };

    case "temperature":
      return { kind: "text", text: "100", expectText: "C" };
    case "length":
      return { kind: "text", text: "1", expectText: "m" };
    case "weight":
      return { kind: "text", text: "1", expectText: "kg" };
    case "data-size":
      return { kind: "text", text: "1", expectText: "MB" };
    case "timestamp":
      return { kind: "text", text: "1700000000", expectText: "T" };
    case "timezone":
      return { kind: "text", text: "2024-01-01T12:00:00Z", expectText: "UTC" };
    case "currency":
      return { kind: "text", text: "10", expectText: "result" };
    case "cron":
      return { kind: "text", text: "0 0 * * *", expectText: /At|every|midnight/i };

    default:
      return { kind: "smoke" };
  }
}
