import { unzipSync, strFromU8, strToU8 } from "fflate";
import { buildEpub, htmlToPlain } from "@/lib/epub-pdf";

/**
 * Ebook stretch converters (MOBI/AZW3/FB2 ↔ EPUB).
 * Text-forward, unprotected files only — no DRM removal.
 */

export async function mobiToEpub(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { title, html } = parsePalmMobi(bytes);
  const chapters = htmlToChapters(html);
  return buildEpub(title || file.name.replace(/\.(mobi|azw3?)$/i, "") || "Book", chapters);
}

export async function azw3ToEpub(file: File): Promise<Blob> {
  // AZW3/KF8 is a PalmDB/MOBI container; reuse the same text scrape path.
  return mobiToEpub(file);
}

export async function epubToMobi(file: File): Promise<Blob> {
  const chapters = await epubChapters(file);
  const title = file.name.replace(/\.epub$/i, "") || "Book";
  const html = chapters
    .map((c, i) => `<h1>Chapter ${i + 1}</h1>\n${plainToHtml(c)}`)
    .join("\n<mbp:pagebreak/>\n");
  return buildSimpleMobi(title, html, "MOBI");
}

export async function epubToAzw3(file: File): Promise<Blob> {
  const chapters = await epubChapters(file);
  const title = file.name.replace(/\.epub$/i, "") || "Book";
  const html = chapters
    .map((c, i) => `<h1>Chapter ${i + 1}</h1>\n${plainToHtml(c)}`)
    .join("\n<mbp:pagebreak/>\n");
  // Minimal KF8-labelled PalmDB (same body as MOBI; readers that accept text MOBI open it).
  return buildSimpleMobi(title, html, "AZW3");
}

export async function fb2ToEpub(file: File): Promise<Blob> {
  const xml = await file.text();
  const title =
    xml.match(/<book-title[^>]*>([\s\S]*?)<\/book-title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ||
    file.name.replace(/\.fb2$/i, "") ||
    "Book";
  const bodies = [...xml.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/gi)].map((m) =>
    htmlToPlain(fb2SectionToHtml(m[1])),
  );
  const fallback = htmlToPlain(
    fb2SectionToHtml(xml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? xml),
  );
  const chapters = (bodies.length ? bodies : [fallback]).filter((c) => c.trim());
  if (!chapters.length) throw new Error("No readable text found in FB2");
  return buildEpub(title, chapters);
}

export async function epubToFb2(file: File): Promise<Blob> {
  const chapters = await epubChapters(file);
  const title = file.name.replace(/\.epub$/i, "") || "Book";
  const sections = chapters
    .map((c, i) => {
      const paras = escapeXml(c)
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, " ")}</p>`)
        .join("\n");
      return `<section>\n<title><p>Chapter ${i + 1}</p></title>\n${paras}\n</section>`;
    })
    .join("\n");
  const fb2 = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description>
    <title-info>
      <book-title>${escapeXml(title)}</book-title>
      <lang>en</lang>
    </title-info>
    <document-info>
      <program-used>ConvertKit</program-used>
    </document-info>
  </description>
  <body>
${sections}
  </body>
</FictionBook>
`;
  return new Blob([fb2], { type: "application/x-fictionbook+xml" });
}

async function epubChapters(file: File): Promise<string[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(bytes);
  const container = findFile(files, "META-INF/container.xml");
  if (!container) throw new Error("Invalid EPUB: missing container.xml");
  const containerXml = strFromU8(container);
  const opfPath = attr(containerXml, "full-path");
  if (!opfPath) throw new Error("Invalid EPUB: no OPF path");
  const opfBytes = getPath(files, opfPath);
  if (!opfBytes) throw new Error("Invalid EPUB: OPF missing");
  const opf = strFromU8(opfBytes);
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const manifest = new Map<string, string>();
  for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
    const id = attr(m[0], "id");
    const href = attr(m[0], "href");
    if (id && href) manifest.set(id, decodeURIComponent(href));
  }
  const spineIds = [...opf.matchAll(/<itemref\b[^>]*idref=["']([^"']+)["']/gi)].map((m) => m[1]);
  const chapters: string[] = [];
  for (const id of spineIds) {
    const href = manifest.get(id);
    if (!href) continue;
    const path = resolvePath(opfDir, href);
    const raw = getPath(files, path);
    if (!raw) continue;
    const html = strFromU8(raw);
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
    const plain = htmlToPlain(body);
    if (plain.trim()) chapters.push(plain);
  }
  if (!chapters.length) throw new Error("No readable chapters found in EPUB");
  return chapters;
}

function parsePalmMobi(bytes: Uint8Array): { title: string; html: string } {
  if (bytes.length < 78) throw new Error("File too small to be MOBI/AZW3");
  const decoder = new TextDecoder("latin1");
  const type = decoder.decode(bytes.subarray(60, 64));
  if (type !== "BOOK" && type !== "TEXT") {
    // Still attempt text scrape — some variants differ
  }
  const numRecords = (bytes[76] << 8) | bytes[77];
  if (numRecords < 1 || 78 + numRecords * 8 > bytes.length) {
    throw new Error("Invalid PalmDB record table");
  }
  const offsets: number[] = [];
  for (let i = 0; i < numRecords; i++) {
    const o = 78 + i * 8;
    offsets.push((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]);
  }
  const rec0 = bytes.subarray(offsets[0], offsets[1] ?? bytes.length);
  let title = "";
  let textStart = 1;
  let textEnd = numRecords;
  let compression = 1;
  if (rec0.length >= 16) {
    compression = (rec0[0] << 8) | rec0[1];
    // MOBI header often follows PalmDOC at offset 16
    if (rec0.length > 20 && decoder.decode(rec0.subarray(16, 20)) === "MOBI") {
      const headerLen = readU32(rec0, 20);
      const fullNameOffset = rec0.length > 88 ? readU32(rec0, 84) : 0;
      const fullNameLength = rec0.length > 92 ? readU32(rec0, 88) : 0;
      if (fullNameOffset && fullNameLength && fullNameOffset + fullNameLength <= rec0.length) {
        title = new TextDecoder("utf-8", { fatal: false }).decode(
          rec0.subarray(fullNameOffset, fullNameOffset + fullNameLength),
        );
      }
      if (rec0.length > 248) {
        textStart = readU32(rec0, 244) || 1;
        textEnd = readU32(rec0, 248) || numRecords;
      }
      // Prefer first image/content boundary if EXTH hints missing
      void headerLen;
    }
  }

  const parts: string[] = [];
  const end = Math.min(textEnd, numRecords);
  for (let i = Math.max(1, textStart); i < end; i++) {
    const start = offsets[i];
    const stop = offsets[i + 1] ?? bytes.length;
    if (start >= stop || start >= bytes.length) continue;
    let chunk = bytes.subarray(start, stop);
    // Skip trailing overlapping entries that look like images (JPEG/PNG magic)
    if (chunk[0] === 0xff && chunk[1] === 0xd8) continue;
    if (chunk[0] === 0x89 && chunk[1] === 0x50) continue;
    try {
      if (compression === 2) chunk = palmDocDecompress(chunk);
      parts.push(decoder.decode(chunk));
    } catch {
      parts.push(decoder.decode(bytes.subarray(start, stop)));
    }
  }

  let html = parts.join("");
  // Strip nulls / binary noise; keep markup-ish content
  html = html.replace(/\0/g, "");
  if (!html.trim()) {
    // Last-resort: scrape printable runs from whole file
    const raw = decoder.decode(bytes);
    const runs = raw.match(/[\x20-\x7E\n\r\t]{40,}/g) ?? [];
    html = runs.join("\n\n");
  }
  if (!html.trim()) throw new Error("No extractable text (DRM or unsupported MOBI variant)");
  return { title: title.trim(), html };
}

/** PalmDOC LZ77-ish decompression (compression type 2). */
function palmDocDecompress(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const b = data[i++];
    if (b === 0) {
      out.push(0);
    } else if (b >= 1 && b <= 8) {
      for (let j = 0; j < b && i < data.length; j++) out.push(data[i++]);
    } else if (b >= 0x80 && b <= 0xbf) {
      if (i >= data.length) break;
      const b2 = data[i++];
      const distance = (((b << 8) | b2) & 0x3fff) >> 3;
      const length = (b2 & 7) + 3;
      for (let j = 0; j < length; j++) {
        const idx = out.length - distance;
        out.push(idx >= 0 ? out[idx] : 0);
      }
    } else if (b >= 0xc0) {
      out.push(32, b ^ 0x80);
    } else {
      out.push(b);
    }
  }
  return Uint8Array.from(out);
}

function buildSimpleMobi(title: string, html: string, kind: "MOBI" | "AZW3"): Blob {
  const enc = new TextEncoder();
  const text = enc.encode(html);
  // PalmDOC uncompressed (compression=1)
  const palmDoc = new Uint8Array(16);
  palmDoc[0] = 0;
  palmDoc[1] = 1; // no compression
  writeU32(palmDoc, 4, text.length);
  palmDoc[12] = 0;
  palmDoc[13] = 0; // max record size unused
  // MOBI header
  const mobi = new Uint8Array(0x100);
  mobi.set(enc.encode("MOBI"), 0);
  writeU32(mobi, 4, 0xe8); // header length
  writeU32(mobi, 8, kind === "AZW3" ? 2 : 2); // mobi type = ebook
  writeU32(mobi, 12, 65001); // utf-8
  writeU32(mobi, 0xc0 - 16, 1); // first content? relative — keep zeros mostly
  const titleBytes = enc.encode(title.slice(0, 64));
  const rec0 = new Uint8Array(16 + mobi.length + titleBytes.length + 2);
  rec0.set(palmDoc, 0);
  rec0.set(mobi, 16);
  writeU32(rec0, 16 + 84, 16 + mobi.length); // full name offset within record
  writeU32(rec0, 16 + 88, titleBytes.length);
  writeU32(rec0, 16 + 244, 1); // first content record
  writeU32(rec0, 16 + 248, 2); // last content record index (exclusive-ish)
  rec0.set(titleBytes, 16 + mobi.length);

  const chunkSize = 4096;
  const textRecords: Uint8Array[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    textRecords.push(text.subarray(i, Math.min(i + chunkSize, text.length)));
  }
  if (!textRecords.length) textRecords.push(new Uint8Array([0]));

  const records = [rec0, ...textRecords];
  const name = enc.encode((title || "BOOK").slice(0, 32).padEnd(32, "\0").slice(0, 32));
  const header = new Uint8Array(78);
  header.set(name, 0);
  header.set(enc.encode("BOOK"), 60);
  header.set(enc.encode("MOBI"), 64);
  header[76] = (records.length >> 8) & 0xff;
  header[77] = records.length & 0xff;

  const recordList = new Uint8Array(records.length * 8 + 2);
  let offset = 78 + recordList.length;
  for (let i = 0; i < records.length; i++) {
    const o = i * 8;
    recordList[o] = (offset >> 24) & 0xff;
    recordList[o + 1] = (offset >> 16) & 0xff;
    recordList[o + 2] = (offset >> 8) & 0xff;
    recordList[o + 3] = offset & 0xff;
    recordList[o + 4] = 0; // attrs
    recordList[o + 5] = 0;
    recordList[o + 6] = 0;
    recordList[o + 7] = i & 0xff; // unique id low byte
    offset += records[i].length;
  }

  const total = offset;
  const out = new Uint8Array(total);
  out.set(header, 0);
  out.set(recordList, 78);
  let pos = 78 + recordList.length;
  for (const r of records) {
    out.set(r, pos);
    pos += r.length;
  }
  return new Blob([out.buffer as ArrayBuffer], {
    type: kind === "AZW3" ? "application/vnd.amazon.ebook" : "application/x-mobipocket-ebook",
  });
}

function htmlToChapters(html: string): string[] {
  const parts = html.split(/<mbp:pagebreak\s*\/?>|<\s*(?:mbp:)?pagebreak[^>]*>/i);
  const chapters = parts
    .map((p) => htmlToPlain(p))
    .map((p) => p.trim())
    .filter(Boolean);
  if (chapters.length) return chapters;
  const plain = htmlToPlain(html).trim();
  if (!plain) throw new Error("No readable text found");
  // Chunk long text
  const words = plain.split(/\s+/);
  const size = 800;
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(" "));
  return out;
}

function fb2SectionToHtml(s: string) {
  return s
    .replace(/<title[\s\S]*?<\/title>/gi, (m) => `<h2>${m.replace(/<[^>]+>/g, "")}</h2>`)
    .replace(/<subtitle[\s\S]*?<\/subtitle>/gi, (m) => `<h3>${m.replace(/<[^>]+>/g, "")}</h3>`)
    .replace(/<empty-line\s*\/?>/gi, "<br/>")
    .replace(/<emphasis>/gi, "<em>")
    .replace(/<\/emphasis>/gi, "</em>")
    .replace(/<strong>/gi, "<strong>")
    .replace(/<\/strong>/gi, "</strong>");
}

function plainToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeXml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function readU32(b: Uint8Array, o: number) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function writeU32(b: Uint8Array, o: number, v: number) {
  b[o] = (v >>> 24) & 0xff;
  b[o + 1] = (v >>> 16) & 0xff;
  b[o + 2] = (v >>> 8) & 0xff;
  b[o + 3] = v & 0xff;
}

function findFile(files: Record<string, Uint8Array>, name: string) {
  const key = Object.keys(files).find((k) => k.replace(/^\/+/, "") === name || k.endsWith("/" + name));
  return key ? files[key] : undefined;
}

function getPath(files: Record<string, Uint8Array>, path: string) {
  const norm = path.replace(/^\/+/, "");
  if (files[norm]) return files[norm];
  const key = Object.keys(files).find((k) => k.replace(/^\/+/, "") === norm);
  return key ? files[key] : undefined;
}

function resolvePath(base: string, href: string) {
  if (!base) return href;
  const stack = base.split("/").filter(Boolean);
  if (!base.endsWith("/")) stack.pop();
  for (const part of href.split("/")) {
    if (part === "..") stack.pop();
    else if (part && part !== ".") stack.push(part);
  }
  return stack.join("/");
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1];
}
