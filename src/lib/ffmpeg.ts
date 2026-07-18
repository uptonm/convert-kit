type FFmpegInstance = {
  loaded: boolean;
  load: (config: Record<string, string>) => Promise<boolean>;
  on: (event: string, cb: (payload: { progress?: number; message?: string }) => void) => void;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  readFile: (path: string) => Promise<Uint8Array | string>;
  deleteFile: (path: string) => Promise<void>;
  exec: (args: string[]) => Promise<number>;
};

type FFmpegCtor = { FFmpeg: new () => FFmpegInstance };

declare global {
  interface Window {
    FFmpegWASM?: FFmpegCtor;
  }
}

const MAX_BYTES = 80 * 1024 * 1024;
const MAX_DURATION_HINT =
  "Keep clips under ~3 minutes and ~80MB. Longer files need desktop tools.";

let ffmpeg: FFmpegInstance | null = null;
let loading: Promise<FFmpegInstance> | null = null;

export function assertAvLimits(file: File, maxBytes = MAX_BYTES) {
  if (file.size > maxBytes) {
    throw new Error(
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${(maxBytes / 1024 / 1024).toFixed(0)}MB. ${MAX_DURATION_HINT}`,
    );
  }
}

function asError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  try {
    return new Error(`${fallback}: ${JSON.stringify(err)}`);
  } catch {
    return new Error(fallback);
  }
}

async function loadScript(src: string) {
  if (document.querySelector(`script[data-ffmpeg="${src}"]`)) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.ffmpeg = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function toBlobURL(url: string, type: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type }));
}

async function fetchFile(file: Blob) {
  return new Uint8Array(await file.arrayBuffer());
}

export async function getFFmpeg(onProgress?: (ratio: number) => void): Promise<FFmpegInstance> {
  if (ffmpeg?.loaded) {
    if (onProgress) ffmpeg.on("progress", ({ progress }) => onProgress(progress ?? 0));
    return ffmpeg;
  }
  if (!loading) {
    loading = (async () => {
      try {
        await loadScript("/ffmpeg/ffmpeg.js");
        const ctor = window.FFmpegWASM;
        if (!ctor?.FFmpeg) throw new Error("FFmpegWASM global missing after script load");
        const instance = new ctor.FFmpeg();
        const logs: string[] = [];
        instance.on("log", ({ message }) => {
          if (message) logs.push(message);
        });
        const baseURL = `${window.location.origin}/ffmpeg`;
        const [coreURL, wasmURL] = await Promise.all([
          toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        ]);
        await instance.load({ coreURL, wasmURL });
        (instance as FFmpegInstance & { __logs?: string[] }).__logs = logs;
        ffmpeg = instance;
        return instance;
      } catch (err) {
        loading = null;
        throw asError(err, "Failed to load ffmpeg.wasm");
      }
    })();
  }
  const instance = await loading;
  if (onProgress) instance.on("progress", ({ progress }) => onProgress(progress ?? 0));
  return instance;
}

export async function ffmpegConvert(opts: {
  file: File;
  outputName: string;
  args: string[];
  inputName?: string;
  onProgress?: (ratio: number) => void;
  maxBytes?: number;
}): Promise<Blob> {
  assertAvLimits(opts.file, opts.maxBytes);
  try {
    const ff = await getFFmpeg(opts.onProgress);
    const inputName = opts.inputName ?? `input${extOf(opts.file.name)}`;
    await ff.writeFile(inputName, await fetchFile(opts.file));
    const code = await ff.exec(["-i", inputName, ...opts.args, opts.outputName]);
    if (code !== 0) {
      const logs = (ff as FFmpegInstance & { __logs?: string[] }).__logs?.slice(-12).join(" | ") ?? "";
      throw new Error(
        `ffmpeg exited with code ${code}${logs ? ` — ${logs}` : ". Try a shorter clip or different format."}`,
      );
    }
    const data = await ff.readFile(opts.outputName);
    await ff.deleteFile(inputName).catch(() => undefined);
    await ff.deleteFile(opts.outputName).catch(() => undefined);
    const src = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    const copy = new Uint8Array(src.byteLength);
    copy.set(src);
    return new Blob([copy], { type: mimeFor(opts.outputName) });
  } catch (err) {
    throw asError(err, "ffmpeg conversion failed");
  }
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i) : "";
}

function mimeFor(name: string) {
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

export { MAX_DURATION_HINT };
