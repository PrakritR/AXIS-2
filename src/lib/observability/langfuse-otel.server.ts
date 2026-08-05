import { LangfuseSpanProcessor } from "@langfuse/otel";

declare global {
  var __axisLangfuseSpanProcessor: LangfuseSpanProcessor | undefined;
  var __axisLangfuseOtelRegistered: boolean | undefined;
}

export function getLangfuseSpanProcessor(): LangfuseSpanProcessor | null {
  if (
    process.env.NODE_ENV === "test" ||
    !process.env.LANGFUSE_PUBLIC_KEY?.trim() ||
    !process.env.LANGFUSE_SECRET_KEY?.trim()
  ) {
    return null;
  }

  globalThis.__axisLangfuseSpanProcessor ??= new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY.trim(),
    secretKey: process.env.LANGFUSE_SECRET_KEY.trim(),
    baseUrl: process.env.LANGFUSE_BASE_URL?.trim() || "https://us.cloud.langfuse.com",
    flushAt: 1,
  });
  return globalThis.__axisLangfuseSpanProcessor;
}
