/**
 * Shared helpers for Langfuse ops scripts. Credentials come from env
 * (prefer a transient pull from Vercel Production — never commit keys).
 */
import { Langfuse } from "langfuse";

export function requireLangfuseEnv() {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();
  const baseUrl = (process.env.LANGFUSE_BASE_URL?.trim() || "https://us.cloud.langfuse.com").replace(/\/$/, "");
  if (!publicKey || !secretKey) {
    throw new Error(
      "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are required. Pull them from Vercel Production without writing to disk.",
    );
  }
  return { publicKey, secretKey, baseUrl };
}

export function createLangfuseClient() {
  const { publicKey, secretKey, baseUrl } = requireLangfuseEnv();
  return new Langfuse({ publicKey, secretKey, baseUrl });
}

export function basicAuthHeader(publicKey, secretKey) {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;
}

export async function langfuseFetch(path, { method = "GET", body, query } = {}) {
  const { publicKey, secretKey, baseUrl } = requireLangfuseEnv();
  const url = new URL(path.startsWith("http") ? path : `${baseUrl}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: basicAuthHeader(publicKey, secretKey),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = typeof json?.message === "string" ? json.message : text.slice(0, 500);
    throw new Error(`Langfuse ${method} ${url.pathname} → ${res.status}: ${msg}`);
  }
  return json;
}
