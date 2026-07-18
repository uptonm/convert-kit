import { NextResponse } from "next/server";

/**
 * Supplementary FX rates only — conversion math stays in our app.
 * Uses Frankfurter (ECB-derived), no file-conversion SaaS.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = (searchParams.get("from") || "USD").toUpperCase();
  const to = (searchParams.get("to") || "EUR").toUpperCase();
  const amount = Number(searchParams.get("amount") || "1");

  if (!amount || Number.isNaN(amount)) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?amount=${amount}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch rates" }, { status: 502 });
    }
    const data = (await res.json()) as {
      amount: number;
      base: string;
      date: string;
      rates: Record<string, number>;
    };
    return NextResponse.json({
      amount: data.amount,
      from: data.base,
      to,
      result: data.rates[to],
      date: data.date,
      source: "frankfurter.app (ECB)",
      note: "Rate data only — conversion arithmetic is local to this request.",
    });
  } catch {
    return NextResponse.json({ error: "Rate lookup failed" }, { status: 502 });
  }
}
