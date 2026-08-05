export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getLangfuseSpanProcessor } = await import(
    "@/lib/observability/langfuse-otel.server"
  );
  const processor = getLangfuseSpanProcessor();
  if (!processor || globalThis.__axisLangfuseOtelRegistered) return;

  const { registerOTel } = await import("@vercel/otel");
  registerOTel({
    serviceName: "proplane-agent",
    spanProcessors: [processor],
  });
  globalThis.__axisLangfuseOtelRegistered = true;
}
