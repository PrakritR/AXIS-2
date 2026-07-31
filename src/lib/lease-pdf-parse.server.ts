import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import {
  inferLeaseKindFromText,
  parseLeasePlainText,
  parsedLeaseToHtml,
  splitLeaseTextIntoSections,
  type ParsedLeaseDocument,
  type ParsedLeaseSection,
} from "@/lib/lease-pdf-parse";
import type { PropertyLeaseTemplateKind } from "@/lib/property-lease-templates";

export async function extractPdfTextFromBuffer(bytes: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n\n") : String(text ?? "");
  return joined.replace(/\r\n/g, "\n").trim();
}

async function structureLeaseWithAi(
  plainText: string,
  kindHint?: PropertyLeaseTemplateKind,
): Promise<ParsedLeaseSection[] | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;
  const client = new Anthropic();
  const clipped = plainText.slice(0, 120_000);
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You structure lease PDF text into PropLane sections. Return ONLY valid JSON: an array of objects with "title" and "body" (plain text, preserve paragraph breaks with \\n). Use concise section titles. Lease format hint: ${kindHint ?? "unknown"}.\n\nLEASE TEXT:\n${clipped}`,
      },
    ],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  const raw = block.text.trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const sections = parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const title = String((row as { title?: unknown }).title ?? "").trim();
        const body = String((row as { body?: unknown }).body ?? "").trim();
        if (!title && !body) return null;
        return { title: title || "Lease terms", body };
      })
      .filter((s): s is ParsedLeaseSection => Boolean(s));
    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

export async function parseLeasePdfBuffer(args: {
  bytes: Buffer;
  docName: string;
  docUrl?: string | null;
  kindHint?: PropertyLeaseTemplateKind;
}): Promise<{ html: string; parsed: ParsedLeaseDocument }> {
  const plainText = await extractPdfTextFromBuffer(args.bytes);
  if (!plainText.trim()) {
    throw new Error("Could not read text from that PDF. Try a text-based PDF or a clearer scan.");
  }

  const inferredKind = args.kindHint ?? inferLeaseKindFromText(plainText);
  const aiSections = await structureLeaseWithAi(plainText, inferredKind).catch(() => null);
  const sections = aiSections ?? splitLeaseTextIntoSections(plainText);
  const parsed: ParsedLeaseDocument = {
    sections,
    inferredKind,
    plainText,
  };
  const html = parsedLeaseToHtml(parsed, args.docName, args.docUrl);
  return { html, parsed };
}

export { parseLeasePlainText };
