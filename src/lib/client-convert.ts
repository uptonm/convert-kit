import { epubToPdf, pdfToEpub } from "@/lib/epub-pdf";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import { marked } from "marked";
import TurndownService from "turndown";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { zipSync, unzipSync } from "fflate";
import Papa from "papaparse";
import * as TOML from "smol-toml";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import cronstrue from "cronstrue";
import { canvasToBlob, downloadBlob, downloadText, loadImage } from "@/lib/download";
import { ffmpegConvert } from "@/lib/ffmpeg";
import type { ConverterDef } from "@/lib/registry";

export type ConvertResult =
  | { kind: "download"; blob: Blob; filename: string }
  | { kind: "text"; text: string; filename?: string }
  | { kind: "multi"; files: Array<{ blob: Blob; filename: string; label?: string }> };

export type ConvertInput = {
  converter: ConverterDef;
  files?: File[];
  text?: string;
  options?: Record<string, string | number | boolean>;
  onProgress?: (ratio: number) => void;
};

export async function runClientConvert(input: ConvertInput): Promise<ConvertResult> {
  const { converter, files = [], text = "", options = {}, onProgress } = input;
  const slug = converter.slug;
  const file = files[0];

  switch (slug) {
    case "epub-to-pdf": {
      if (!file) throw new Error("Choose an EPUB file");
      return {
        kind: "download",
        blob: await epubToPdf(file),
        filename: replaceExt(file.name, "pdf"),
      };
    }
    case "pdf-to-epub": {
      if (!file) throw new Error("Choose a PDF file");
      return {
        kind: "download",
        blob: await pdfToEpub(file),
        filename: replaceExt(file.name, "epub"),
      };
    }
    case "markdown-to-html": {
      const md = text || (file ? await file.text() : "");
      const html = await marked.parse(md);
      return { kind: "text", text: html, filename: "converted.html" };
    }
    case "html-to-markdown": {
      const html = text || (file ? await file.text() : "");
      const td = new TurndownService();
      return { kind: "text", text: td.turndown(html), filename: "converted.md" };
    }
    case "markdown-to-pdf": {
      const md = text || (file ? await file.text() : "");
      return { kind: "download", blob: await textToPdf(md), filename: "converted.pdf" };
    }
    case "txt-to-pdf": {
      const t = text || (file ? await file.text() : "");
      return { kind: "download", blob: await textToPdf(t), filename: "converted.pdf" };
    }
    case "images-to-pdf": {
      if (!files.length) throw new Error("Add at least one image");
      return {
        kind: "download",
        blob: await imagesToPdf(files),
        filename: "images.pdf",
      };
    }
    case "pdf-merge": {
      if (files.length < 2) throw new Error("Add at least two PDFs");
      return { kind: "download", blob: await mergePdfs(files), filename: "merged.pdf" };
    }
    case "pdf-split": {
      if (!file) throw new Error("Choose a PDF");
      const start = Number(options.start ?? 1);
      const end = Number(options.end ?? start);
      return {
        kind: "download",
        blob: await splitPdf(file, start, end),
        filename: `pages-${start}-${end}.pdf`,
      };
    }
    case "png-to-jpg":
    case "jpg-to-png":
    case "png-to-webp":
    case "webp-to-png":
    case "jpg-to-webp":
    case "webp-to-jpg":
    case "svg-to-png": {
      if (!file) throw new Error("Choose an image");
      const map: Record<string, { mime: string; ext: string; q?: number }> = {
        "png-to-jpg": { mime: "image/jpeg", ext: "jpg", q: 0.92 },
        "jpg-to-png": { mime: "image/png", ext: "png" },
        "png-to-webp": { mime: "image/webp", ext: "webp", q: 0.9 },
        "webp-to-png": { mime: "image/png", ext: "png" },
        "jpg-to-webp": { mime: "image/webp", ext: "webp", q: 0.9 },
        "webp-to-jpg": { mime: "image/jpeg", ext: "jpg", q: 0.92 },
        "svg-to-png": { mime: "image/png", ext: "png" },
      };
      const t = map[slug];
      const blob = await rasterConvert(file, t.mime, t.q);
      return { kind: "download", blob, filename: replaceExt(file.name, t.ext) };
    }
    case "heic-to-jpg": {
      if (!file) throw new Error("Choose a HEIC file");
      const heic2any = (await import("heic2any")).default;
      const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      const blob = Array.isArray(result) ? result[0] : result;
      return { kind: "download", blob: blob as Blob, filename: replaceExt(file.name, "jpg") };
    }
    case "image-to-base64": {
      if (!file) throw new Error("Choose an image");
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);
      return { kind: "text", text: `data:${file.type || "application/octet-stream"};base64,${b64}` };
    }
    case "base64-to-image": {
      const data = text.trim();
      const m = data.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) throw new Error("Paste a data URL (data:image/...;base64,...)");
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ext = m[1].split("/")[1] ?? "png";
      return {
        kind: "download",
        blob: new Blob([bytes], { type: m[1] }),
        filename: `image.${ext}`,
      };
    }
    case "resize-image": {
      if (!file) throw new Error("Choose an image");
      const width = Number(options.width || 800);
      const quality = Number(options.quality || 0.85);
      const blob = await resizeImage(file, width, quality);
      return { kind: "download", blob, filename: `resized-${file.name}` };
    }
    case "qr-code": {
      if (!text.trim()) throw new Error("Enter text or a URL");
      const dataUrl = await QRCode.toDataURL(text.trim(), { width: 512, margin: 2 });
      const res = await fetch(dataUrl);
      return { kind: "download", blob: await res.blob(), filename: "qrcode.png" };
    }
    case "favicon-pack": {
      if (!file) throw new Error("Choose an image");
      const sizes = [16, 32, 48, 180, 192, 512];
      const filesOut: Array<{ blob: Blob; filename: string; label?: string }> = [];
      for (const s of sizes) {
        const blob = await resizeImage(file, s, 0.95, true);
        filesOut.push({ blob, filename: `favicon-${s}.png`, label: `${s}×${s}` });
      }
      return { kind: "multi", files: filesOut };
    }
    case "zip-create": {
      if (!files.length) throw new Error("Add files to zip");
      const entries: Record<string, Uint8Array> = {};
      for (const f of files) {
        entries[f.name] = new Uint8Array(await f.arrayBuffer());
      }
      const zipped = zipSync(entries);
      return {
        kind: "download",
        blob: new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" }),
        filename: "archive.zip",
      };
    }
    case "zip-extract": {
      if (!file) throw new Error("Choose a ZIP");
      const data = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const out = Object.entries(data).map(([name, bytes]) => ({
        blob: new Blob([bytes.buffer as ArrayBuffer]),
        filename: name,
        label: name,
      }));
      if (!out.length) throw new Error("ZIP is empty");
      return { kind: "multi", files: out };
    }
    case "json-to-yaml": {
      const obj = JSON.parse(text || (file ? await file.text() : ""));
      return { kind: "text", text: yamlDump(obj), filename: "converted.yaml" };
    }
    case "yaml-to-json": {
      const obj = yamlLoad(text || (file ? await file.text() : ""));
      return {
        kind: "text",
        text: JSON.stringify(obj, null, 2),
        filename: "converted.json",
      };
    }
    case "json-to-toml": {
      const obj = JSON.parse(text || (file ? await file.text() : ""));
      return { kind: "text", text: TOML.stringify(obj), filename: "converted.toml" };
    }
    case "toml-to-json": {
      const obj = TOML.parse(text || (file ? await file.text() : ""));
      return {
        kind: "text",
        text: JSON.stringify(obj, null, 2),
        filename: "converted.json",
      };
    }
    case "json-to-xml": {
      const obj = JSON.parse(text || (file ? await file.text() : ""));
      const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
      return {
        kind: "text",
        text: builder.build({ root: obj }),
        filename: "converted.xml",
      };
    }
    case "xml-to-json": {
      const parser = new XMLParser({ ignoreAttributes: false });
      const obj = parser.parse(text || (file ? await file.text() : ""));
      return {
        kind: "text",
        text: JSON.stringify(obj, null, 2),
        filename: "converted.json",
      };
    }
    case "json-to-csv": {
      const raw = text || (file ? await file.text() : "");
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return {
        kind: "text",
        text: Papa.unparse(rows),
        filename: "converted.csv",
      };
    }
    case "csv-to-json": {
      const raw = text || (file ? await file.text() : "");
      const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });
      return {
        kind: "text",
        text: JSON.stringify(parsed.data, null, 2),
        filename: "converted.json",
      };
    }
    case "csv-to-xlsx": {
      if (!file && !text) throw new Error("Provide CSV");
      const raw = text || (await file!.text());
      const wb = XLSX.read(raw, { type: "string" });
      const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      return {
        kind: "download",
        blob: new Blob([out], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename: "converted.xlsx",
      };
    }
    case "json-pretty": {
      const obj = JSON.parse(text);
      return { kind: "text", text: JSON.stringify(obj, null, 2) };
    }
    case "query-to-json": {
      const q = text.startsWith("?") ? text.slice(1) : text;
      const params = new URLSearchParams(q);
      const obj: Record<string, string> = {};
      params.forEach((v, k) => {
        obj[k] = v;
      });
      return { kind: "text", text: JSON.stringify(obj, null, 2) };
    }
    case "json-to-query": {
      const obj = JSON.parse(text) as Record<string, string>;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(obj)) params.set(k, String(v));
      return { kind: "text", text: params.toString() };
    }
    case "base64": {
      const mode = String(options.mode ?? "encode");
      if (mode === "decode") {
        return { kind: "text", text: atob(text.trim()) };
      }
      return { kind: "text", text: btoa(unescape(encodeURIComponent(text))) };
    }
    case "url-encode": {
      const mode = String(options.mode ?? "encode");
      return {
        kind: "text",
        text: mode === "decode" ? decodeURIComponent(text) : encodeURIComponent(text),
      };
    }
    case "html-encode": {
      const mode = String(options.mode ?? "encode");
      if (mode === "decode") {
        const el = document.createElement("textarea");
        el.innerHTML = text;
        return { kind: "text", text: el.value };
      }
      return {
        kind: "text",
        text: text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;"),
      };
    }
    case "hash": {
      const algo = String(options.algo ?? "SHA-256");
      if (algo === "MD5") {
        return { kind: "text", text: await md5Hex(text) };
      }
      const buf = await crypto.subtle.digest(
        algo as AlgorithmIdentifier,
        new TextEncoder().encode(text),
      );
      return { kind: "text", text: bufferToHex(buf) };
    }
    case "jwt-decode": {
      const parts = text.trim().split(".");
      if (parts.length < 2) throw new Error("Invalid JWT");
      const header = JSON.parse(atobUrl(parts[0]));
      const payload = JSON.parse(atobUrl(parts[1]));
      return {
        kind: "text",
        text: JSON.stringify({ header, payload, note: "Signature not verified" }, null, 2),
      };
    }
    case "uuid": {
      const mode = String(options.mode ?? "generate");
      if (mode === "validate") {
        const ok =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            text.trim(),
          );
        return { kind: "text", text: ok ? "Valid UUID" : "Invalid UUID" };
      }
      return { kind: "text", text: crypto.randomUUID() };
    }
    case "number-base": {
      const n = text.trim();
      const fromBase = Number(options.fromBase ?? 10);
      const value = parseInt(n, fromBase);
      if (Number.isNaN(value)) throw new Error("Invalid number for selected base");
      return {
        kind: "text",
        text: JSON.stringify(
          {
            decimal: value.toString(10),
            binary: value.toString(2),
            octal: value.toString(8),
            hex: value.toString(16),
          },
          null,
          2,
        ),
      };
    }
    case "case": {
      const style = String(options.style ?? "camel");
      return { kind: "text", text: applyCase(text, style) };
    }
    case "slugify": {
      return {
        kind: "text",
        text: text
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      };
    }
    case "word-count": {
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const lines = text ? text.split(/\n/).length : 0;
      const reading = Math.max(1, Math.ceil(words / 200));
      return {
        kind: "text",
        text: JSON.stringify({ words, characters: chars, lines, readingMinutes: reading }, null, 2),
      };
    }
    case "lorem": {
      const paras = Number(options.paragraphs ?? 3);
      const sentence =
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
      return {
        kind: "text",
        text: Array.from({ length: paras }, () => sentence).join("\n\n"),
      };
    }
    case "diff": {
      const a = String(options.left ?? "").split("\n");
      const b = text.split("\n");
      const max = Math.max(a.length, b.length);
      const lines: string[] = [];
      for (let i = 0; i < max; i++) {
        const la = a[i] ?? "";
        const lb = b[i] ?? "";
        if (la === lb) lines.push(`  ${lb}`);
        else {
          if (la) lines.push(`- ${la}`);
          if (lb) lines.push(`+ ${lb}`);
        }
      }
      return { kind: "text", text: lines.join("\n") };
    }
    case "sort-lines": {
      const mode = String(options.mode ?? "sort");
      let lines = text.split("\n");
      if (mode === "sort") lines = [...lines].sort((x, y) => x.localeCompare(y));
      if (mode === "reverse") lines = [...lines].reverse();
      if (mode === "dedupe") lines = [...new Set(lines)];
      return { kind: "text", text: lines.join("\n") };
    }
    case "beautify-minify": {
      const mode = String(options.mode ?? "beautify");
      const lang = String(options.lang ?? "json");
      if (lang === "json") {
        const obj = JSON.parse(text);
        return {
          kind: "text",
          text: mode === "minify" ? JSON.stringify(obj) : JSON.stringify(obj, null, 2),
        };
      }
      if (lang === "css") {
        return {
          kind: "text",
          text:
            mode === "minify"
              ? text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim()
              : text.replace(/;\s*/g, ";\n").replace(/\{\s*/g, "{\n  ").replace(/\s*\}/g, "\n}\n"),
        };
      }
      // html
      return {
        kind: "text",
        text:
          mode === "minify"
            ? text.replace(/>\s+</g, "><").trim()
            : text.replace(/></g, ">\n<"),
      };
    }
    case "meta-extractor": {
      const doc = new DOMParser().parseFromString(text, "text/html");
      const get = (sel: string, attr = "content") =>
        doc.querySelector(sel)?.getAttribute(attr) ?? null;
      const data = {
        title: doc.querySelector("title")?.textContent ?? null,
        description: get('meta[name="description"]'),
        ogTitle: get('meta[property="og:title"]'),
        ogDescription: get('meta[property="og:description"]'),
        ogImage: get('meta[property="og:image"]'),
        twitterCard: get('meta[name="twitter:card"]'),
      };
      return { kind: "text", text: JSON.stringify(data, null, 2) };
    }
    case "user-agent": {
      const ua = text.trim() || navigator.userAgent;
      const mobile = /Mobile|Android|iPhone/i.test(ua);
      const browser =
        /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Unknown";
      const os = /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Android/.test(ua)
            ? "Android"
            : /iPhone|iPad/.test(ua)
              ? "iOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "Unknown";
      return { kind: "text", text: JSON.stringify({ browser, os, mobile, ua }, null, 2) };
    }
    case "color": {
      return { kind: "text", text: JSON.stringify(parseColor(text.trim()), null, 2) };
    }
    case "contrast": {
      const fg = parseColor(String(options.fg ?? "#000000"));
      const bg = parseColor(text.trim() || String(options.bg ?? "#ffffff"));
      const ratio = contrastRatio(fg.rgb, bg.rgb);
      return {
        kind: "text",
        text: JSON.stringify(
          {
            ratio: Number(ratio.toFixed(2)),
            aaNormal: ratio >= 4.5,
            aaLarge: ratio >= 3,
            aaaNormal: ratio >= 7,
          },
          null,
          2,
        ),
      };
    }
    case "gradient": {
      const c1 = String(options.c1 ?? "#0f766e");
      const c2 = text.trim() || String(options.c2 ?? "#134e4a");
      const angle = Number(options.angle ?? 135);
      const css = `linear-gradient(${angle}deg, ${c1}, ${c2})`;
      return { kind: "text", text: css };
    }
    case "aspect-ratio": {
      const w = Number(options.width ?? text);
      const ratio = String(options.ratio ?? "16:9");
      const [rw, rh] = ratio.split(":").map(Number);
      if (!w || !rw || !rh) throw new Error("Provide width and ratio like 16:9");
      const h = Math.round((w * rh) / rw);
      return { kind: "text", text: JSON.stringify({ width: w, height: h, ratio }, null, 2) };
    }
    case "temperature": {
      const value = Number(text);
      const from = String(options.from ?? "C");
      let c = value;
      if (from === "F") c = ((value - 32) * 5) / 9;
      if (from === "K") c = value - 273.15;
      return {
        kind: "text",
        text: JSON.stringify(
          { C: c, F: (c * 9) / 5 + 32, K: c + 273.15 },
          null,
          2,
        ),
      };
    }
    case "length": {
      const value = Number(text);
      const from = String(options.from ?? "m");
      const toM: Record<string, number> = {
        m: 1,
        km: 1000,
        cm: 0.01,
        mm: 0.001,
        mi: 1609.344,
        yd: 0.9144,
        ft: 0.3048,
        in: 0.0254,
      };
      const meters = value * (toM[from] ?? 1);
      const out: Record<string, number> = {};
      for (const [k, f] of Object.entries(toM)) out[k] = meters / f;
      return { kind: "text", text: JSON.stringify(out, null, 2) };
    }
    case "weight": {
      const value = Number(text);
      const from = String(options.from ?? "kg");
      const toKg: Record<string, number> = {
        kg: 1,
        g: 0.001,
        lb: 0.45359237,
        oz: 0.028349523125,
        st: 6.35029318,
      };
      const kg = value * (toKg[from] ?? 1);
      const out: Record<string, number> = {};
      for (const [k, f] of Object.entries(toKg)) out[k] = kg / f;
      return { kind: "text", text: JSON.stringify(out, null, 2) };
    }
    case "data-size": {
      const value = Number(text);
      const from = String(options.from ?? "MB");
      const factors: Record<string, number> = {
        B: 1,
        KB: 1e3,
        MB: 1e6,
        GB: 1e9,
        KiB: 1024,
        MiB: 1024 ** 2,
        GiB: 1024 ** 3,
      };
      const bytes = value * (factors[from] ?? 1);
      const out: Record<string, number> = {};
      for (const [k, f] of Object.entries(factors)) out[k] = bytes / f;
      return { kind: "text", text: JSON.stringify(out, null, 2) };
    }
    case "timestamp": {
      const mode = String(options.mode ?? "to-iso");
      if (mode === "to-unix") {
        const d = new Date(text);
        if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
        return { kind: "text", text: String(Math.floor(d.getTime() / 1000)) };
      }
      const n = Number(text);
      const ms = String(text).length > 10 ? n : n * 1000;
      return { kind: "text", text: new Date(ms).toISOString() };
    }
    case "timezone": {
      const zones = [
        "UTC",
        "America/New_York",
        "America/Los_Angeles",
        "Europe/London",
        "Europe/Paris",
        "Asia/Tokyo",
        "Australia/Sydney",
      ];
      const base = text.trim() ? new Date(text) : new Date();
      if (Number.isNaN(base.getTime())) throw new Error("Invalid datetime");
      const out: Record<string, string> = {};
      for (const z of zones) {
        out[z] = new Intl.DateTimeFormat("en-US", {
          timeZone: z,
          dateStyle: "full",
          timeStyle: "long",
        }).format(base);
      }
      return { kind: "text", text: JSON.stringify(out, null, 2) };
    }
    case "cron": {
      return { kind: "text", text: cronstrue.toString(text.trim()) };
    }
    case "srt-to-vtt": {
      const raw = text || (file ? await file.text() : "");
      const body = raw.replace(/\r/g, "").replace(/(\d+:\d+:\d+),(\d+)/g, "$1.$2");
      const vtt = body.startsWith("WEBVTT") ? body : `WEBVTT\n\n${body}`;
      return { kind: "text", text: vtt, filename: "subtitles.vtt" };
    }
    case "vtt-to-srt": {
      const raw = text || (file ? await file.text() : "");
      const srt = raw
        .replace(/^WEBVTT\s*/i, "")
        .replace(/(\d+:\d+:\d+)\.(\d+)/g, "$1,$2")
        .trim();
      return { kind: "text", text: srt, filename: "subtitles.srt" };
    }
    // ffmpeg paths
    case "mp4-to-webm":
    case "webm-to-mp4":
    case "mov-to-mp4":
    case "mkv-to-mp4":
    case "video-to-gif":
    case "video-to-mp3":
    case "mp3-to-wav":
    case "wav-to-mp3":
    case "trim-video": {
      if (!file) throw new Error("Choose a media file");
      return runFfmpegSlug(slug, file, options, onProgress);
    }
    default:
      throw new Error(`Converter "${slug}" is not implemented yet.`);
  }
}

async function runFfmpegSlug(
  slug: string,
  file: File,
  options: Record<string, string | number | boolean>,
  onProgress?: (ratio: number) => void,
): Promise<ConvertResult> {
  const map: Record<string, { out: string; args: string[] }> = {
    "mp4-to-webm": { out: "out.webm", args: ["-c:v", "libvpx", "-b:v", "1M", "-c:a", "libvorbis"] },
    "webm-to-mp4": { out: "out.mp4", args: ["-c:v", "libx264", "-c:a", "aac"] },
    "mov-to-mp4": { out: "out.mp4", args: ["-c", "copy"] },
    "mkv-to-mp4": { out: "out.mp4", args: ["-c", "copy"] },
    "video-to-gif": {
      out: "out.gif",
      args: ["-vf", "fps=10,scale=480:-1:flags=lanczos", "-t", "15"],
    },
    "video-to-mp3": { out: "out.mp3", args: ["-vn", "-acodec", "libmp3lame", "-q:a", "2"] },
    "mp3-to-wav": { out: "out.wav", args: [] },
    "wav-to-mp3": { out: "out.mp3", args: ["-acodec", "libmp3lame", "-q:a", "2"] },
    "trim-video": {
      out: "out.mp4",
      args: [
        "-ss",
        String(options.start ?? "0"),
        "-t",
        String(options.duration ?? "10"),
        "-c",
        "copy",
      ],
    },
  };
  const cfg = map[slug];
  const blob = await ffmpegConvert({
    file,
    outputName: cfg.out,
    args: cfg.args,
    onProgress,
    maxBytes: slug === "video-to-gif" ? 40 * 1024 * 1024 : undefined,
  });
  return { kind: "download", blob, filename: cfg.out };
}

export function applyConvertResult(result: ConvertResult) {
  if (result.kind === "download") downloadBlob(result.blob, result.filename);
  if (result.kind === "text" && result.filename) downloadText(result.text, result.filename);
  if (result.kind === "multi") {
    for (const f of result.files) downloadBlob(f.blob, f.filename);
  }
}

function replaceExt(name: string, ext: string) {
  return name.replace(/\.[^.]+$/, "") + `.${ext}`;
}

async function rasterConvert(file: File, mime: string, quality?: number) {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  if (mime === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  return canvasToBlob(canvas, mime, quality);
}

async function resizeImage(file: File, width: number, quality: number, exact = false) {
  const img = await loadImage(file);
  const scale = exact ? width / (img.naturalWidth || img.width) : Math.min(1, width / (img.naturalWidth || img.width));
  const w = exact ? width : Math.round((img.naturalWidth || img.width) * scale);
  const h = exact ? width : Math.round((img.naturalHeight || img.height) * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  return canvasToBlob(canvas, "image/png", quality);
}

async function textToPdf(text: string): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pageSize: [number, number] = [612, 792];
  let page = pdf.addPage(pageSize);
  const margin = 50;
  const fontSize = 11;
  const lineHeight = 14;
  const maxWidth = pageSize[0] - margin * 2;
  const lines = wrapText(text, (t) => font.widthOfTextAtSize(t, fontSize), maxWidth);
  let y = pageSize[1] - margin;
  for (const line of lines) {
    if (y < margin) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin;
    }
    page.drawText(line || " ", {
      x: margin,
      y,
      size: fontSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= lineHeight;
  }
  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

function wrapText(text: string, widthOf: (t: string) => number, maxWidth: number) {
  const out: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    if (!paragraph) {
      out.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next) > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
  }
  return out;
}

async function imagesToPdf(files: File[]) {
  const pdf = await PDFDocument.create();
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPng = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
    const image = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
  const out = await pdf.save();
  return new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
}

async function mergePdfs(files: File[]) {
  const merged = await PDFDocument.create();
  for (const file of files) {
    const doc = await PDFDocument.load(await file.arrayBuffer());
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  const out = await merged.save();
  return new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
}

async function splitPdf(file: File, start: number, end: number) {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  const out = await PDFDocument.create();
  const indices = doc
    .getPageIndices()
    .filter((i) => i + 1 >= start && i + 1 <= end);
  if (!indices.length) throw new Error("No pages in that range");
  const pages = await out.copyPages(doc, indices);
  pages.forEach((p) => out.addPage(p));
  const bytes = await out.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

function applyCase(text: string, style: string) {
  const words = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/);
  const lower = words.map((w) => w.toLowerCase());
  switch (style) {
    case "snake":
      return lower.join("_");
    case "kebab":
      return lower.join("-");
    case "pascal":
      return lower.map((w) => w[0]?.toUpperCase() + w.slice(1)).join("");
    case "constant":
      return lower.join("_").toUpperCase();
    case "title":
      return lower.map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
    case "sentence":
      return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    default:
      return lower
        .map((w, i) => (i === 0 ? w : w[0]?.toUpperCase() + w.slice(1)))
        .join("");
  }
}

function bufferToHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function atobUrl(s: string) {
  const pad = s.length % 4 === 0 ? s : s + "=".repeat(4 - (s.length % 4));
  return atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
}

async function md5Hex(text: string) {
  // Lightweight MD5 for demo — uses SubtleCrypto where available for SHA only;
  // fall back to a tiny implementation.
  const { md5 } = await import("@/lib/md5");
  return md5(text);
}

function parseColor(input: string) {
  let hex = input.trim();
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return colorSpaces(r, g, b);
  }
  const rgb = input.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgb) return colorSpaces(+rgb[1], +rgb[2], +rgb[3]);
  throw new Error("Enter a HEX (#0f766e) or rgb(r,g,b) color");
}

function colorSpaces(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
        break;
      case gn:
        h = ((bn - rn) / d + 2) / 6;
        break;
      default:
        h = ((rn - gn) / d + 4) / 6;
    }
  }
  const hex = `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  return {
    hex,
    rgb: { r, g, b },
    hsl: {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    },
    oklch: approxOklch(rn, gn, bn),
  };
}

function approxOklch(r: number, g: number, b: number) {
  // Rough linear sRGB → OKLab approximation for display
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const C = Math.sqrt(a * a + bb * bb);
  const H = (Math.atan2(bb, a) * 180) / Math.PI;
  return {
    l: Number(L.toFixed(3)),
    c: Number(C.toFixed(3)),
    h: Number(((H + 360) % 360).toFixed(1)),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) {
  const L1 = relativeLuminance(a);
  const L2 = relativeLuminance(b);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}
