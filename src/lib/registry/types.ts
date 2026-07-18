export type GroupSlug =
  | "documents"
  | "images"
  | "audio-video"
  | "archives"
  | "data"
  | "encoding"
  | "text"
  | "code"
  | "design"
  | "units";

export type Engine = "client" | "ffmpeg";

export type Ambition = "core" | "stretch";

export type ConverterStatus = "live" | "coming-soon";

export type InputMode = "file" | "text" | "both";

export interface ConverterDef {
  id: string;
  slug: string;
  title: string;
  description: string;
  group: GroupSlug;
  subgroup?: string;
  from: string;
  to: string;
  reverseSlug?: string;
  engine: Engine;
  ambition: Ambition;
  status: ConverterStatus;
  inputMode: InputMode;
  accept?: string;
  maxBytes?: number;
  maxDurationSec?: number;
  popular?: boolean;
  notes?: string;
}

export interface GroupDef {
  slug: GroupSlug;
  name: string;
  description: string;
}
