import { NextRequest } from "next/server";

export function jsonRequest(
  url: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
): NextRequest {
  const { method = "GET", body, headers = {}, cookies = {} } = init;
  const req = new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
      ...(Object.keys(cookies).length
        ? { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return req;
}

export async function parseJsonResponse<T = unknown>(res: Response): Promise<{ status: number; data: T }> {
  const text = await res.text();
  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = text as T;
  }
  return { status: res.status, data };
}
