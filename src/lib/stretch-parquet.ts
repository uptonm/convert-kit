import Papa from "papaparse";
import { parquetReadObjects } from "hyparquet";
import { parquetWriteBuffer } from "hyparquet-writer";

/**
 * Parquet ↔ CSV (hyparquet / hyparquet-writer).
 */

export async function parquetToCsv(file: File): Promise<Blob> {
  const buf = await file.arrayBuffer();
  const rows = (await parquetReadObjects({
    file: buf,
  })) as Record<string, unknown>[];
  if (!rows.length) {
    return new Blob([""], { type: "text/csv" });
  }
  const csv = Papa.unparse(rows);
  return new Blob([csv], { type: "text/csv" });
}

export async function csvToParquet(file: File | null, text?: string): Promise<Blob> {
  const raw = (text && text.trim()) || (file ? await file.text() : "");
  if (!raw.trim()) throw new Error("Provide CSV");
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data;
  if (!rows.length) throw new Error("CSV has no data rows");
  const columns = Object.keys(rows[0]);
  const columnData = columns.map((name) => {
    const values = rows.map((r) => r[name] ?? "");
    const asNums = values.map((v) => (v === "" ? null : Number(v)));
    const allNumeric = asNums.every((v) => v === null || (typeof v === "number" && !Number.isNaN(v)));
    if (allNumeric) {
      return {
        name,
        data: asNums.map((v) => (v === null ? 0 : v)),
        type: "DOUBLE" as const,
      };
    }
    return { name, data: values, type: "STRING" as const };
  });
  const arrayBuffer = parquetWriteBuffer({ columnData });
  return new Blob([arrayBuffer], { type: "application/vnd.apache.parquet" });
}
