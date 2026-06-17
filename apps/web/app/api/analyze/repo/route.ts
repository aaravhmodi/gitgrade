import { NextRequest, NextResponse } from "next/server";

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const response = await fetch(`${ANALYZER_URL}/analyze/repo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text || "Analyzer request failed." }, { status: response.status });
  }

  return NextResponse.json(await response.json(), { status: 200 });
}
