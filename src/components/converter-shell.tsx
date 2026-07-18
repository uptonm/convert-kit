"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ConverterDef } from "@/lib/registry";
import { EngineBadge } from "@/components/converter-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  applyConvertResult,
  runClientConvert,
  type ConvertResult,
} from "@/lib/client-convert";
import { downloadBlob, downloadText } from "@/lib/download";
import { MAX_DURATION_HINT } from "@/lib/ffmpeg";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ConverterShell({ converter }: { converter: ConverterDef }) {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<Record<string, string | number | boolean>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const comingSoon = converter.status === "coming-soon";
  const needsFile = converter.inputMode === "file" || converter.inputMode === "both";
  const needsText = converter.inputMode === "text" || converter.inputMode === "both";
  const multiFile = ["pdf-merge", "zip-create", "images-to-pdf"].includes(converter.slug);

  const optionFields = useMemo(() => optionSchema(converter.slug), [converter.slug]);

  async function onConvert() {
    setError(null);
    setResult(null);
    setBusy(true);
    setProgress(converter.engine === "ffmpeg" ? 0 : null);
    try {
      if (converter.slug === "currency") {
        const amount = Number(text);
        const from = String(options.from ?? "USD");
        const to = String(options.to ?? "EUR");
        if (!amount || Number.isNaN(amount)) throw new Error("Enter an amount");
        const res = await fetch(
          `/api/rates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`,
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Rate lookup failed");
        const out: ConvertResult = {
          kind: "text",
          text: JSON.stringify(data, null, 2),
        };
        setResult(out);
        return;
      }

      const out = await runClientConvert({
        converter,
        files,
        text,
        options,
        onProgress: (r) => setProgress(Math.round(r * 100)),
      });
      setResult(out);
      if (out.kind === "download") applyConvertResult(out);
      if (out.kind === "multi") toast.success(`Ready: ${out.files.length} files`);
      else toast.success("Conversion complete");
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Conversion failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <EngineBadge engine={converter.engine} status={converter.status} />
          {converter.subgroup ? (
            <span className="text-xs uppercase tracking-wide text-teal-800/70">{converter.subgroup}</span>
          ) : null}
        </div>
        <h1
          className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-foreground sm:text-4xl"
          data-testid="converter-title"
        >
          {converter.title}
        </h1>
        <p className="text-muted-foreground">{converter.description}</p>
        {converter.notes ? (
          <Alert>
            <AlertTitle>Note</AlertTitle>
            <AlertDescription>{converter.notes}</AlertDescription>
          </Alert>
        ) : null}
        {converter.engine === "ffmpeg" ? (
          <Alert>
            <AlertTitle>Browser limits</AlertTitle>
            <AlertDescription>{MAX_DURATION_HINT}</AlertDescription>
          </Alert>
        ) : null}
        {converter.reverseSlug ? (
          <Link
            href={`/${converter.group}/${converter.reverseSlug}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[0.8rem] hover:bg-muted"
          >
            <ArrowLeftRight className="size-3.5" />
            Switch to reverse
          </Link>
        ) : null}
      </div>

      {comingSoon ? (
        <Alert data-testid="coming-soon-alert">
          <AlertTitle>Coming soon</AlertTitle>
          <AlertDescription>
            This converter is listed in the catalog but not implemented yet. No third-party conversion APIs — when it ships, it will run owned code in your browser.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4 rounded-2xl border border-border/80 bg-[var(--surface)] p-5">
          {needsFile ? (
            <div className="space-y-2">
              <Label>File{multiFile ? "s" : ""}</Label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-teal-800/30 bg-teal-50/40 px-4 py-10 text-center transition-colors hover:bg-teal-50/70">
                <input
                  type="file"
                  className="hidden"
                  accept={converter.accept}
                  multiple={multiFile}
                  data-testid="file-input"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
                <span className="text-sm font-medium text-teal-900">
                  {files.length
                    ? files.map((f) => f.name).join(", ")
                    : multiFile
                      ? "Drop or choose files"
                      : "Drop or choose a file"}
                </span>
                <span className="block text-xs text-muted-foreground">Stays on your device</span>
              </label>
            </div>
          ) : null}

          {needsText ? (
            <div className="space-y-2">
              <Label>{converter.slug === "diff" ? "Text B" : "Input"}</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder="Paste input…"
                className="font-mono text-sm"
                data-testid="text-input"
              />
            </div>
          ) : null}

          {optionFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label>{field.label}</Label>
              {field.type === "select" ? (
                <Select
                  value={String(options[field.key] ?? field.defaultValue ?? "")}
                  onValueChange={(v) => setOptions((o) => ({ ...o, [field.key]: v ?? "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={field.label} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.choices?.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === "textarea" ? (
                <Textarea
                  value={String(options[field.key] ?? "")}
                  onChange={(e) => setOptions((o) => ({ ...o, [field.key]: e.target.value }))}
                  rows={6}
                  className="font-mono text-sm"
                />
              ) : (
                <Input
                  type={field.type}
                  value={String(options[field.key] ?? field.defaultValue ?? "")}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value,
                    }))
                  }
                />
              )}
            </div>
          ))}

          {progress !== null ? <Progress value={progress} /> : null}
          {error ? (
            <Alert variant="destructive" data-testid="convert-error">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            className="bg-teal-800 text-teal-50 hover:bg-teal-900"
            disabled={busy}
            onClick={onConvert}
            data-testid="convert-button"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Convert
          </Button>

          {result?.kind === "text" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Result</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    result.filename
                      ? downloadText(result.text, result.filename)
                      : navigator.clipboard.writeText(result.text).then(() => toast.success("Copied"))
                  }
                >
                  <Download className="size-3.5" />
                  {result.filename ? "Download" : "Copy"}
                </Button>
              </div>
              <Textarea readOnly value={result.text} rows={12} className="font-mono text-sm" data-testid="text-result" />
            </div>
          ) : null}

          {result?.kind === "multi" ? (
            <div className="space-y-2">
              <Label>Files</Label>
              <ul className="space-y-2">
                {result.files.map((f) => (
                  <li key={f.filename} className="flex items-center justify-between gap-2 text-sm">
                    <span>{f.label ?? f.filename}</span>
                    <Button size="sm" variant="outline" onClick={() => downloadBlob(f.blob, f.filename)}>
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

type Field = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea";
  defaultValue?: string | number;
  choices?: Array<{ value: string; label: string }>;
};

function optionSchema(slug: string): Field[] {
  switch (slug) {
    case "pdf-split":
      return [
        { key: "start", label: "Start page", type: "number", defaultValue: 1 },
        { key: "end", label: "End page", type: "number", defaultValue: 1 },
      ];
    case "resize-image":
      return [
        { key: "width", label: "Max width (px)", type: "number", defaultValue: 800 },
        { key: "quality", label: "Quality (0–1)", type: "number", defaultValue: 0.85 },
      ];
    case "trim-video":
      return [
        { key: "start", label: "Start (seconds)", type: "text", defaultValue: "0" },
        { key: "duration", label: "Duration (seconds)", type: "text", defaultValue: "10" },
      ];
    case "base64":
    case "url-encode":
    case "html-encode":
      return [
        {
          key: "mode",
          label: "Mode",
          type: "select",
          defaultValue: "encode",
          choices: [
            { value: "encode", label: "Encode" },
            { value: "decode", label: "Decode" },
          ],
        },
      ];
    case "hash":
      return [
        {
          key: "algo",
          label: "Algorithm",
          type: "select",
          defaultValue: "SHA-256",
          choices: ["SHA-256", "SHA-512", "SHA-1", "MD5"].map((v) => ({ value: v, label: v })),
        },
      ];
    case "uuid":
      return [
        {
          key: "mode",
          label: "Mode",
          type: "select",
          defaultValue: "generate",
          choices: [
            { value: "generate", label: "Generate" },
            { value: "validate", label: "Validate" },
          ],
        },
      ];
    case "number-base":
      return [
        {
          key: "fromBase",
          label: "From base",
          type: "select",
          defaultValue: "10",
          choices: [
            { value: "2", label: "Binary" },
            { value: "8", label: "Octal" },
            { value: "10", label: "Decimal" },
            { value: "16", label: "Hex" },
          ],
        },
      ];
    case "case":
      return [
        {
          key: "style",
          label: "Style",
          type: "select",
          defaultValue: "camel",
          choices: [
            { value: "camel", label: "camelCase" },
            { value: "snake", label: "snake_case" },
            { value: "kebab", label: "kebab-case" },
            { value: "pascal", label: "PascalCase" },
            { value: "constant", label: "CONSTANT_CASE" },
            { value: "title", label: "Title Case" },
            { value: "sentence", label: "Sentence case" },
          ],
        },
      ];
    case "lorem":
      return [{ key: "paragraphs", label: "Paragraphs", type: "number", defaultValue: 3 }];
    case "diff":
      return [{ key: "left", label: "Text A", type: "textarea" }];
    case "sort-lines":
      return [
        {
          key: "mode",
          label: "Mode",
          type: "select",
          defaultValue: "sort",
          choices: [
            { value: "sort", label: "Sort" },
            { value: "reverse", label: "Reverse" },
            { value: "dedupe", label: "Dedupe" },
          ],
        },
      ];
    case "beautify-minify":
      return [
        {
          key: "lang",
          label: "Language",
          type: "select",
          defaultValue: "json",
          choices: [
            { value: "json", label: "JSON" },
            { value: "css", label: "CSS" },
            { value: "html", label: "HTML" },
          ],
        },
        {
          key: "mode",
          label: "Mode",
          type: "select",
          defaultValue: "beautify",
          choices: [
            { value: "beautify", label: "Beautify" },
            { value: "minify", label: "Minify" },
          ],
        },
      ];
    case "contrast":
      return [{ key: "fg", label: "Foreground color", type: "text", defaultValue: "#000000" }];
    case "gradient":
      return [
        { key: "c1", label: "Color 1", type: "text", defaultValue: "#0f766e" },
        { key: "angle", label: "Angle", type: "number", defaultValue: 135 },
      ];
    case "aspect-ratio":
      return [
        { key: "width", label: "Width", type: "number", defaultValue: 1920 },
        {
          key: "ratio",
          label: "Ratio",
          type: "select",
          defaultValue: "16:9",
          choices: ["16:9", "4:3", "1:1", "9:16", "21:9"].map((v) => ({ value: v, label: v })),
        },
      ];
    case "temperature":
      return [
        {
          key: "from",
          label: "From",
          type: "select",
          defaultValue: "C",
          choices: [
            { value: "C", label: "Celsius" },
            { value: "F", label: "Fahrenheit" },
            { value: "K", label: "Kelvin" },
          ],
        },
      ];
    case "length":
      return [
        {
          key: "from",
          label: "From",
          type: "select",
          defaultValue: "m",
          choices: ["m", "km", "cm", "mm", "mi", "yd", "ft", "in"].map((v) => ({ value: v, label: v })),
        },
      ];
    case "weight":
      return [
        {
          key: "from",
          label: "From",
          type: "select",
          defaultValue: "kg",
          choices: ["kg", "g", "lb", "oz", "st"].map((v) => ({ value: v, label: v })),
        },
      ];
    case "data-size":
      return [
        {
          key: "from",
          label: "From",
          type: "select",
          defaultValue: "MB",
          choices: ["B", "KB", "MB", "GB", "KiB", "MiB", "GiB"].map((v) => ({ value: v, label: v })),
        },
      ];
    case "timestamp":
      return [
        {
          key: "mode",
          label: "Mode",
          type: "select",
          defaultValue: "to-iso",
          choices: [
            { value: "to-iso", label: "Unix → ISO" },
            { value: "to-unix", label: "ISO/date → Unix" },
          ],
        },
      ];
    case "currency":
      return [
        {
          key: "from",
          label: "From",
          type: "select",
          defaultValue: "USD",
          choices: ["USD", "EUR", "GBP", "CAD", "JPY", "AUD", "CHF"].map((v) => ({
            value: v,
            label: v,
          })),
        },
        {
          key: "to",
          label: "To",
          type: "select",
          defaultValue: "EUR",
          choices: ["USD", "EUR", "GBP", "CAD", "JPY", "AUD", "CHF"].map((v) => ({
            value: v,
            label: v,
          })),
        },
      ];
    default:
      return [];
  }
}
