import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonRequest, parseJsonResponse } from "../helpers/api-request";

const mocks = vi.hoisted(() => ({
  resolveVendorPortalUserId: vi.fn(),
  createSupabaseServiceRoleClient: vi.fn(),
  resolveOwnVendorRecords: vi.fn(),
}));

vi.mock("@/lib/auth/vendor-api-access", () => ({
  resolveVendorPortalUserId: mocks.resolveVendorPortalUserId,
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceRoleClient: mocks.createSupabaseServiceRoleClient,
}));

vi.mock("@/lib/vendor-own-record", () => ({
  resolveOwnVendorRecords: mocks.resolveOwnVendorRecords,
}));

import { POST as UPLOAD } from "@/app/api/vendor/documents/upload/route";
import { GET as DOWNLOAD } from "@/app/api/vendor/documents/file/route";
import { VENDOR_DOCUMENTS_BUCKET } from "@/lib/vendor-documents-storage";

const VENDOR_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const PDF_DATA_URL = "data:application/pdf;base64,JVBERi0xLjQK";

function mockStorage(uploaded: string[] = [], downloaded: string[] = []) {
  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string) => {
        if (bucket !== VENDOR_DOCUMENTS_BUCKET) {
          return { error: { message: `unexpected bucket ${bucket}` } };
        }
        uploaded.push(path);
        return { error: null };
      },
      download: async (path: string) => {
        if (bucket !== VENDOR_DOCUMENTS_BUCKET) {
          return { data: null, error: { message: `unexpected bucket ${bucket}` } };
        }
        downloaded.push(path);
        return { data: new Blob(["pdf-bytes"], { type: "application/pdf" }), error: null };
      },
    }),
  };
  return storage;
}

describe("vendor documents storage routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveVendorPortalUserId.mockResolvedValue({ ok: true, userId: VENDOR_ID });
    mocks.resolveOwnVendorRecords.mockResolvedValue([
      {
        id: "mv-1",
        managerUserId: "mgr-1",
        row: { id: "mv-1", managerUserId: "mgr-1", vendorDocuments: [], updatedAt: "2026-01-01T00:00:00.000Z" },
      },
    ]);
  });

  it("uploads to the private vendor-documents bucket", async () => {
    const uploaded: string[] = [];
    const updated: Record<string, unknown>[] = [];
    mocks.createSupabaseServiceRoleClient.mockReturnValue({
      storage: mockStorage(uploaded),
      from: () => ({
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updated.push(patch);
            return { error: null };
          },
        }),
      }),
    });

    const res = await UPLOAD(
      jsonRequest("http://t/api/vendor/documents/upload", {
        method: "POST",
        body: { dataUrl: PDF_DATA_URL, kind: "insurance", fileName: "cert.pdf" },
      }),
    );
    const { status, data } = await parseJsonResponse<{ document?: { storagePath?: string } }>(res);

    expect(status).toBe(200);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatch(new RegExp(`^vendor-documents/${VENDOR_ID}/insurance-`));
    expect(data.document?.storagePath).toBe(uploaded[0]);
    expect(updated[0]?.row_data).toBeTruthy();
  });

  it("refuses unauthenticated download", async () => {
    mocks.resolveVendorPortalUserId.mockResolvedValue({ ok: false, status: 401 });
    mocks.createSupabaseServiceRoleClient.mockReturnValue({ storage: mockStorage() });

    const res = await DOWNLOAD(jsonRequest("http://t/api/vendor/documents/file?kind=insurance"));
    const { status, data } = await parseJsonResponse<{ error?: string }>(res);

    expect(status).toBe(401);
    expect(data.error).toMatch(/unauthorized/i);
  });

  it("downloads from the private vendor-documents bucket for the owner", async () => {
    const storagePath = `vendor-documents/${VENDOR_ID}/insurance-1.pdf`;
    const downloaded: string[] = [];
    mocks.resolveOwnVendorRecords.mockResolvedValue([
      {
        id: "mv-1",
        managerUserId: "mgr-1",
        row: {
          id: "mv-1",
          managerUserId: "mgr-1",
          vendorDocuments: [
            {
              kind: "insurance",
              fileName: "cert.pdf",
              storagePath,
              url: "/api/vendor/documents/file?kind=insurance",
              uploadedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      },
    ]);
    mocks.createSupabaseServiceRoleClient.mockReturnValue({ storage: mockStorage([], downloaded) });

    const res = await DOWNLOAD(jsonRequest("http://t/api/vendor/documents/file?kind=insurance"));
    expect(res.status).toBe(200);
    expect(downloaded).toEqual([storagePath]);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
