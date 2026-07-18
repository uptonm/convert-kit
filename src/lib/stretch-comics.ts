import { zipSync, unzipSync, unzlibSync, inflateSync } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { extractPdfStrings, sanitizePdfText } from "@/lib/epub-pdf";
import { canvasToBlob } from "@/lib/download";

/**
 * Comics (CBZ) and DjVu stretch converters — owned, best-effort.
 */

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;

export async function cbzToPdf(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(bytes);
  const names = Object.keys(files)
    .filter((n) => !n.endsWith("/") && IMAGE_RE.test(n) && !n.split("/").pop()?.startsWith("."))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  if (!names.length) throw new Error("No images found in CBZ");

  const pdf = await PDFDocument.create();
  for (const name of names) {
    const data = files[name];
    const lower = name.toLowerCase();
    try {
      if (lower.endsWith(".png")) {
        const img = await pdf.embedPng(data);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
        const img = await pdf.embedJpg(data);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      } else {
        // gif/webp → rasterize via canvas
        const blob = new Blob([data.buffer as ArrayBuffer]);
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.drawImage(bitmap, 0, 0);
        const pngBlob = await canvasToBlob(canvas, "image/png");
        const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
        const img = await pdf.embedPng(pngBytes);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
    } catch {
      // skip undecodable page
    }
  }
  if (pdf.getPageCount() === 0) throw new Error("Could not decode any CBZ images");
  const out = await pdf.save();
  return new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
}

export async function pdfToCbz(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const embedded = extractEmbeddedImages(bytes);
  const entries: Record<string, Uint8Array> = {};

  if (embedded.length) {
    embedded.forEach((img, i) => {
      const ext = img.mime === "image/png" ? "png" : "jpg";
      entries[`page-${String(i + 1).padStart(3, "0")}.${ext}`] = img.bytes;
    });
  } else {
    // Text-forward fallback: one PNG per text chunk via canvas
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pageCount = Math.max(1, pdf.getPageCount());
    const text = extractPdfStrings(bytes);
    const chunks =
      text.length > 0
        ? chunk(text, pageCount)
        : Array.from({ length: pageCount }, (_, i) => `Page ${i + 1}`);
    for (let i = 0; i < chunks.length; i++) {
      entries[`page-${String(i + 1).padStart(3, "0")}.png`] = await textToPngBytes(
        `Page ${i + 1}`,
        chunks[i],
      );
    }
  }

  const zipped = zipSync(entries);
  return new Blob([zipped.buffer as ArrayBuffer], { type: "application/vnd.comicbook+zip" });
}

export async function djvuToPdf(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = extractDjvuText(bytes);
  const images = extractDjvuEmbeddedImages(bytes);
  if (images.length) {
    const pdf = await PDFDocument.create();
    for (const img of images) {
      try {
        const embedded =
          img.mime === "image/png" ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
        const page = pdf.addPage([embedded.width, embedded.height]);
        page.drawImage(embedded, {
          x: 0,
          y: 0,
          width: embedded.width,
          height: embedded.height,
        });
      } catch {
        /* skip */
      }
    }
    if (pdf.getPageCount() > 0) {
      if (text.trim()) {
        const page = pdf.addPage([612, 792]);
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        page.drawText(sanitizePdfText(text).slice(0, 2000), {
          x: 50,
          y: 742,
          size: 10,
          font,
          color: rgb(0.1, 0.1, 0.1),
          maxWidth: 512,
        });
      }
      const out = await pdf.save();
      return new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
    }
  }
  const body =
    text.trim() ||
    "(Best-effort DjVu conversion: no decodeable page images or text layer found. Output is a placeholder PDF.)";
  return textPagesToPdf(file.name.replace(/\.djvu?$/i, "") || "DjVu", [body]);
}

export async function pdfToDjvu(file: File): Promise<Blob> {
  // Build a minimal single-page IFF DjVu with a TEXT chunk (no JB2/IW44 encoder).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = extractPdfStrings(bytes) || file.name;
  return buildTextDjvu(sanitizePdfText(text).slice(0, 50_000));
}

function extractDjvuText(bytes: Uint8Array): string {
  const latin = new TextDecoder("latin1").decode(bytes);
  const chunks: string[] = [];
  // Uncompressed TEXT / TXTa style payloads often contain readable ASCII nearby
  for (const m of latin.matchAll(/(?:TXTz|TXTa|TEXT)/g)) {
    const start = m.index ?? 0;
    const slice = bytes.subarray(start, Math.min(bytes.length, start + 8 + 20000));
    // Try zlib inflate after 8-byte IFF chunk header (4 id + 4 size)
    if (slice.length > 12) {
      try {
        const inflated = inflateRawOrZlib(slice.subarray(8));
        const t = new TextDecoder("utf-8", { fatal: false }).decode(inflated);
        const printable = t.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, " ").trim();
        if (printable.length > 20) chunks.push(printable);
      } catch {
        /* ignore */
      }
    }
  }
  if (chunks.length) return chunks.join("\n\n");
  const runs = latin.match(/[\x20-\x7E]{30,}/g) ?? [];
  return runs.slice(0, 40).join("\n");
}

function extractDjvuEmbeddedImages(bytes: Uint8Array): Array<{ bytes: Uint8Array; mime: string }> {
  const out: Array<{ bytes: Uint8Array; mime: string }> = [];
  for (let i = 0; i < bytes.length - 3; i++) {
    // JPEG
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      let j = i + 2;
      while (j < bytes.length - 1) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          out.push({ bytes: bytes.subarray(i, j + 2), mime: "image/jpeg" });
          i = j + 1;
          break;
        }
        j++;
      }
    }
    // PNG
    if (
      bytes[i] === 0x89 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x4e &&
      bytes[i + 3] === 0x47
    ) {
      const end = findPngEnd(bytes, i);
      if (end > i) {
        out.push({ bytes: bytes.subarray(i, end), mime: "image/png" });
        i = end - 1;
      }
    }
  }
  return out.slice(0, 50);
}

function findPngEnd(bytes: Uint8Array, start: number) {
  let o = start + 8;
  while (o + 8 <= bytes.length) {
    const len = (bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3];
    const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    o += 12 + len; // len + type + data + crc
    if (type === "IEND") return o;
    if (len < 0 || o > bytes.length) return -1;
  }
  return -1;
}

function inflateRawOrZlib(data: Uint8Array): Uint8Array {
  try {
    return unzlibSync(data);
  } catch {
    return inflateSync(data);
  }
}

function buildTextDjvu(text: string): Blob {
  const enc = new TextEncoder();
  // INFO chunk: width, height, etc. (10 bytes typical)
  const infoData = new Uint8Array(10);
  // width 612, height 792, minor 0, major 0, dpi 300, gamma 22, flags 0
  infoData[0] = 0x02;
  infoData[1] = 0x64; // 612
  infoData[2] = 0x03;
  infoData[3] = 0x18; // 792
  infoData[4] = 0;
  infoData[5] = 0;
  infoData[6] = 0x01;
  infoData[7] = 0x2c; // 300 dpi
  infoData[8] = 22;
  infoData[9] = 0;

  const textPayload = enc.encode(text);
  // Minimal custom "TEXT" chunk with raw UTF-8 (non-standard but valid IFF)
  const textChunk = makeIffChunk("TEXT", textPayload);
  const infoChunk = makeIffChunk("INFO", infoData);
  const formBody = new Uint8Array(4 + infoChunk.length + textChunk.length);
  formBody.set(enc.encode("DJVU"), 0);
  formBody.set(infoChunk, 4);
  formBody.set(textChunk, 4 + infoChunk.length);
  const form = makeIffChunk("FORM", formBody);
  const out = new Uint8Array(4 + form.length);
  out.set(enc.encode("AT&T"), 0);
  out.set(form, 4);
  return new Blob([out.buffer as ArrayBuffer], { type: "image/vnd.djvu" });
}

function makeIffChunk(id: string, data: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const padded = data.length % 2 === 1;
  const out = new Uint8Array(8 + data.length + (padded ? 1 : 0));
  out.set(enc.encode(id.padEnd(4, " ").slice(0, 4)), 0);
  const len = data.length;
  out[4] = (len >>> 24) & 0xff;
  out[5] = (len >>> 16) & 0xff;
  out[6] = (len >>> 8) & 0xff;
  out[7] = len & 0xff;
  out.set(data, 8);
  return out;
}

function extractEmbeddedImages(bytes: Uint8Array): Array<{ bytes: Uint8Array; mime: string }> {
  const out: Array<{ bytes: Uint8Array; mime: string }> = [];
  const latin = new TextDecoder("latin1").decode(bytes);
  // DCTDecode JPEG streams often start after stream\n
  for (const m of latin.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const inner = m[1];
    const start = (m.index ?? 0) + m[0].indexOf(inner);
    // Prefer scanning bytes at that region for JPEG/PNG magic
    const region = bytes.subarray(Math.max(0, start - 2), Math.min(bytes.length, start + inner.length));
    for (let i = 0; i < region.length - 2; i++) {
      if (region[i] === 0xff && region[i + 1] === 0xd8 && region[i + 2] === 0xff) {
        let j = i + 2;
        while (j < region.length - 1) {
          if (region[j] === 0xff && region[j + 1] === 0xd9) {
            out.push({ bytes: region.subarray(i, j + 2), mime: "image/jpeg" });
            break;
          }
          j++;
        }
        break;
      }
      if (region[i] === 0x89 && region[i + 1] === 0x50) {
        const abs = bytes.subarray(Math.max(0, start - 2) + i);
        const end = findPngEnd(abs, 0);
        if (end > 0) out.push({ bytes: abs.subarray(0, end), mime: "image/png" });
        break;
      }
    }
  }
  return out.slice(0, 100);
}

async function textToPngBytes(title: string, body: string): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = 612;
  canvas.height = 792;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(title, 40, 50);
  ctx.font = "14px sans-serif";
  const words = body.split(/\s+/);
  let line = "";
  let y = 90;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > 532) {
      ctx.fillText(line, 40, y);
      y += 20;
      line = w;
      if (y > 760) break;
    } else line = next;
  }
  if (line && y <= 760) ctx.fillText(line, 40, y);
  const blob = await canvasToBlob(canvas, "image/png");
  return new Uint8Array(await blob.arrayBuffer());
}

async function textPagesToPdf(title: string, chapters: string[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const chapter of chapters) {
    let page = pdf.addPage([612, 792]);
    let y = 742;
    page.drawText(sanitizePdfText(title).slice(0, 80), {
      x: 50,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 28;
    const lines = sanitizePdfText(chapter).split(/\n/);
    for (const line of lines) {
      const chunks = wrapLine(line, 90);
      for (const c of chunks) {
        if (y < 50) {
          page = pdf.addPage([612, 792]);
          y = 742;
        }
        page.drawText(c || " ", { x: 50, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
        y -= 14;
      }
    }
  }
  const out = await pdf.save();
  return new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
}

function wrapLine(s: string, max: number) {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out.length ? out : [""];
}

function chunk(text: string, n: number): string[] {
  const words = text.split(/\s+/);
  const size = Math.max(40, Math.ceil(words.length / n));
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(" "));
  return out.length ? out : [text];
}
