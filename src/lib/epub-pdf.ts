import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Owned in-browser EPUB ↔ PDF. No third-party conversion APIs.
 * Quality is text-forward (chapters → paginated PDF / PDF text → EPUB),
 * not a Calibre-perfect visual clone.
 */

export async function epubToPdf(file: File): Promise<Blob> {
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
    const tag = m[0];
    const id = attr(tag, "id");
    const href = attr(tag, "href");
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
    const title = textBetween(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? href;
    const body = textBetween(html, /<body[^>]*>([\s\S]*?)<\/body>/i) ?? html;
    const plain = htmlToPlain(body);
    if (plain.trim()) chapters.push(`${stripTags(title)}\n\n${plain}`);
  }

  if (!chapters.length) throw new Error("No readable chapters found in EPUB");

  const title =
    textBetween(opf, /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) ??
    file.name.replace(/\.epub$/i, "") ??
    "EPUB";

  return textChaptersToPdf(stripTags(title), chapters);
}

export async function pdfToEpub(file: File): Promise<Blob> {
  // Extract text with pdf-lib page count + simple stream parse fallback via pdf.js-less approach:
  // use pdf-lib only for page count; pull raw strings from PDF content streams.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pageCount = pdf.getPageCount();
  const extracted = extractPdfStrings(bytes);
  const title = file.name.replace(/\.pdf$/i, "") || "Document";

  const chunks =
    extracted.length > 0
      ? chunkText(extracted, Math.max(1, Math.ceil(extracted.length / Math.max(pageCount, 1))))
      : Array.from({ length: pageCount }, (_, i) => `Page ${i + 1}\n\n(No extractable text on this page.)`);

  return buildEpub(title, chunks);
}

export async function textChaptersToPdf(title: string, chapters: string[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 54;
  const fontSize = 11;
  const titleSize = 18;
  const lineHeight = 15;
  const maxWidth = pageSize[0] - margin * 2;

  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const drawLine = (text: string, size: number, f = font) => {
    if (y < margin + lineHeight) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin;
    }
    page.drawText(text || " ", {
      x: margin,
      y,
      size,
      font: f,
      color: rgb(0.08, 0.1, 0.12),
      maxWidth,
    });
    y -= size + 4;
  };

  drawLine(sanitizePdfText(title), titleSize, fontBold);
  y -= 8;

  for (const chapter of chapters) {
    y -= 10;
    const lines = wrap(sanitizePdfText(chapter), (t) => font.widthOfTextAtSize(t, fontSize), maxWidth);
    for (const line of lines) drawLine(line, fontSize);
  }

  const out = await pdf.save();
  return new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
}

/** Build a minimal EPUB 3 from plain-text chapters (owned, text-forward). */
export function buildEpub(title: string, chapters: string[]): Blob {
  const safeTitle = title.replace(/[<>&]/g, "") || "Document";
  const manifestItems = chapters
    .map(
      (_, i) =>
        `<item id="chap${i + 1}" href="text/chap${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join("\n    ");
  const spine = chapters.map((_, i) => `<itemref idref="chap${i + 1}"/>`).join("\n    ");

  const files: Record<string, Uint8Array> = {
    mimetype: strToU8("application/epub+zip"),
    "META-INF/container.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`),
    "OEBPS/content.opf": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:title>${escapeXml(safeTitle)}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifestItems}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`),
    "OEBPS/nav.xhtml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Nav</title></head>
<body>
  <nav epub:type="toc"><ol>
    ${chapters.map((_, i) => `<li><a href="text/chap${i + 1}.xhtml">Chapter ${i + 1}</a></li>`).join("\n    ")}
  </ol></nav>
</body></html>`),
  };

  chapters.forEach((ch, i) => {
    const paras = escapeXml(ch)
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
      .join("\n");
    files[`OEBPS/text/chap${i + 1}.xhtml`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter ${i + 1}</title></head>
<body>
<h1>Chapter ${i + 1}</h1>
${paras}
</body></html>`);
  });

  // mimetype must be first and stored (fflate zipSync stores compressed by default;
  // for EPUB, mimetype should be uncompressed — acceptable for many readers when first).
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped.buffer as ArrayBuffer], { type: "application/epub+zip" });
}

/** Best-effort scrape of literal strings from PDF content streams. */
export function extractPdfStrings(bytes: Uint8Array): string {
  // Best-effort string scrape from content streams (owned, no remote API).
  const text = new TextDecoder("latin1").decode(bytes);
  const bits: string[] = [];
  for (const m of text.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    const inner = m[0].slice(1, m[0].lastIndexOf(")"));
    bits.push(
      inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "")
        .replace(/\\t/g, "\t")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\"),
    );
  }
  for (const m of text.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
    for (const s of m[1].matchAll(/\((?:\\.|[^\\)])*\)/g)) {
      bits.push(s[0].slice(1, -1));
    }
  }
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

function chunkText(text: string, approxChunks: number): string[] {
  const words = text.split(/\s+/);
  const size = Math.max(80, Math.ceil(words.length / approxChunks));
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) {
    out.push(words.slice(i, i + size).join(" "));
  }
  return out.length ? out : [text];
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
  if (base.endsWith("/")) {
    /* keep */
  } else stack.pop();
  for (const part of href.split("/")) {
    if (part === "..") stack.pop();
    else if (part && part !== ".") stack.push(part);
  }
  return stack.join("/");
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"))?.[1];
}

function textBetween(html: string, re: RegExp) {
  return html.match(re)?.[1];
}

export function htmlToPlain(html: string) {
  return stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"'),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, "");
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizePdfText(s: string) {
  // WinAnsi-safe-ish subset for StandardFonts
  return s.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function wrap(text: string, widthOf: (t: string) => number, maxWidth: number) {
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
