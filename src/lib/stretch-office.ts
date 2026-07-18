import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractPdfStrings, sanitizePdfText } from "@/lib/epub-pdf";

/**
 * Office / document stretch converters (text-forward, owned in-browser).
 */

async function docxRawText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const BufferCtor = (globalThis as { Buffer?: typeof Buffer }).Buffer;
  const result = BufferCtor
    ? await mammoth.extractRawText({ buffer: BufferCtor.from(arrayBuffer) })
    : await mammoth.extractRawText({ arrayBuffer });
  return result.value?.trim() || "";
}

export async function pdfToDocx(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = extractPdfStrings(bytes) || "(No extractable text in this PDF.)";
  const title = file.name.replace(/\.pdf$/i, "") || "Document";
  const paras = text.split(/\n{2,}|\r\n{2,}/).filter((p) => p.trim());
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
          }),
          ...paras.map(
            (p) =>
              new Paragraph({
                children: [new TextRun(sanitizePdfText(p.replace(/\s+/g, " ").trim()))],
              }),
          ),
        ],
      },
    ],
  });
  const out = await Packer.toBlob(doc);
  return out;
}

export async function docxToPdf(file: File): Promise<Blob> {
  const text = (await docxRawText(file)) || "(Empty document)";
  return plainTextToPdf(file.name.replace(/\.docx$/i, "") || "Document", text);
}

export async function docxToOdt(file: File): Promise<Blob> {
  const text = await docxRawText(file);
  const title = file.name.replace(/\.docx$/i, "") || "Document";
  return buildMinimalOdt(title, text);
}

export async function odtToDocx(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(bytes);
  const content = getZipText(files, "content.xml");
  if (!content) throw new Error("Invalid ODT: missing content.xml");
  const text = xmlTextContent(content);
  const title =
    getZipText(files, "meta.xml")?.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]?.trim() ||
    file.name.replace(/\.odt$/i, "") ||
    "Document";
  const paras = text.split(/\n+/).filter((p) => p.trim());
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          ...paras.map(
            (p) =>
              new Paragraph({
                children: [new TextRun(p)],
              }),
          ),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}

export async function pptxToPdf(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = unzipSync(bytes);
  const slideNames = Object.keys(files)
    .filter((k) => /ppt\/slides\/slide\d+\.xml$/i.test(k.replace(/^\/+/, "")))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/i)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)/i)?.[1] ?? 0);
      return na - nb;
    });
  if (!slideNames.length) throw new Error("No slides found in PPTX");
  const pages = slideNames.map((name, i) => {
    const xml = strFromU8(files[name]);
    const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)].map((m) =>
      decodeXml(m[1]),
    );
    const body = texts.join("\n").trim() || `(Slide ${i + 1} — no extractable text)`;
    return `Slide ${i + 1}\n\n${body}`;
  });
  return plainTextToPdf(file.name.replace(/\.pptx$/i, "") || "Presentation", pages.join("\n\n———\n\n"));
}

export async function xlsxToPdf(file: File): Promise<Blob> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`Sheet: ${name}\n\n${csv}`);
  }
  if (!parts.length) throw new Error("Workbook is empty");
  return plainTextToPdf(file.name.replace(/\.xlsx$/i, "") || "Spreadsheet", parts.join("\n\n———\n\n"));
}

export async function latexToPdf(file: File | null, text?: string): Promise<Blob> {
  const raw = (text && text.trim()) || (file ? await file.text() : "");
  if (!raw.trim()) throw new Error("Provide a LaTeX document");
  let plain = "";
  try {
    const { parse, HtmlGenerator } = await import("latex.js");
    const generator = new HtmlGenerator({ hyphenate: false });
    parse(raw, { generator });
    plain = generator.domFragment().textContent?.trim() || "";
  } catch {
    plain = "";
  }
  if (!plain) plain = stripLatex(raw);
  if (!plain.trim()) throw new Error("Could not extract text from LaTeX");
  return plainTextToPdf("LaTeX", plain);
}

function stripLatex(src: string): string {
  return src
    .replace(/\\begin\{document\}/gi, "")
    .replace(/\\end\{document\}/gi, "")
    .replace(/\\documentclass\{[^}]*\}/gi, "")
    .replace(/\\usepackage\{[^}]*\}/gi, "")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, (m, _o, brace) => {
      if (brace) return brace.slice(1, -1);
      return " ";
    })
    .replace(/[{}]/g, "")
    .replace(/%[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function plainTextToPdf(title: string, text: string): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 50;
  const fontSize = 11;
  const lineHeight = 14;
  const maxWidth = pageSize[0] - margin * 2;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const draw = (line: string, size: number, f = font) => {
    if (y < margin + lineHeight) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin;
    }
    page.drawText(line || " ", {
      x: margin,
      y,
      size,
      font: f,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 3;
  };

  draw(sanitizePdfText(title).slice(0, 80), 16, fontBold);
  y -= 6;
  for (const line of wrap(sanitizePdfText(text), (t) => font.widthOfTextAtSize(t, fontSize), maxWidth)) {
    draw(line, fontSize);
  }
  const out = await pdf.save();
  return new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
}

function buildMinimalOdt(title: string, text: string): Blob {
  const paras = text
    .split(/\n+/)
    .filter((p) => p.trim())
    .map((p) => `<text:p>${escapeXml(p)}</text:p>`)
    .join("\n");
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 office:version="1.2">
  <office:body>
    <office:text>
      <text:h text:outline-level="1">${escapeXml(title)}</text:h>
      ${paras || "<text:p></text:p>"}
    </office:text>
  </office:body>
</office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2">
  <office:styles/>
</office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">
  <office:meta><dc:title>${escapeXml(title)}</dc:title></office:meta>
</office:document-meta>`;
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;
  const zipped = zipSync({
    mimetype: strToU8("application/vnd.oasis.opendocument.text"),
    "content.xml": strToU8(content),
    "styles.xml": strToU8(styles),
    "meta.xml": strToU8(meta),
    "META-INF/manifest.xml": strToU8(manifest),
  });
  return new Blob([zipped.buffer as ArrayBuffer], {
    type: "application/vnd.oasis.opendocument.text",
  });
}

function getZipText(files: Record<string, Uint8Array>, name: string) {
  const key = Object.keys(files).find((k) => k.replace(/^\/+/, "") === name);
  return key ? strFromU8(files[key]) : undefined;
}

function xmlTextContent(xml: string) {
  return xml
    .replace(/<text:h\b[^>]*>/gi, "\n")
    .replace(/<\/text:h>/gi, "\n")
    .replace(/<text:p\b[^>]*>/gi, "\n")
    .replace(/<\/text:p>/gi, "\n")
    .replace(/<text:line-break\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
