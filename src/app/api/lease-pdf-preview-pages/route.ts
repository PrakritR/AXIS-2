import { NextResponse } from "next/server";
import { renderUploadedLeasePdfPages } from "@/lib/uploaded-lease-pdf-render.server";

export const runtime = "nodejs";

const MAX_DATA_URL_BYTES = 12 * 1024 * 1024;

export async function POST(request: Request) {
  let body: { dataUrl?: string };
  try {
    body = (await request.json()) as { dataUrl?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const dataUrl = body.dataUrl?.trim() ?? "";
  if (!dataUrl.startsWith("data:application/pdf")) {
    return NextResponse.json({ error: "A PDF data URL is required." }, { status: 400 });
  }
  if (dataUrl.length > MAX_DATA_URL_BYTES) {
    return NextResponse.json({ error: "PDF is too large to preview." }, { status: 413 });
  }

  try {
    const result = await renderUploadedLeasePdfPages(dataUrl);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Could not render PDF preview." }, { status: 500 });
  }
}
