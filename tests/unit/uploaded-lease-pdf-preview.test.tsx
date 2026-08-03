// @vitest-environment jsdom
//
// Pins the lease PDF preview's two render paths.
//
// The regression this exists for: the iOS/native path used to POST the whole
// PDF to `/api/lease-pdf-preview-pages` and rasterize it server-side with
// unpdf's `renderPageAsImage`, which needs the optional `@napi-rs/canvas` peer
// dep. That dep was never installed, so the route threw on EVERY request and
// every manager and resident on the mobile app saw "Could not render this PDF
// in the preview." Rendering now happens in the browser, so this test asserts
// the preview never reaches for the network.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { UploadedLeasePdfPreview } from "@/components/portal/uploaded-lease-pdf-preview";

const renderPage = vi.fn();
const getPage = vi.fn(async () => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
  render: (...args: unknown[]) => {
    renderPage(...args);
    return { promise: Promise.resolve() };
  },
  cleanup: vi.fn(),
}));

const getDocument = vi.fn(() => ({
  promise: Promise.resolve({ numPages: 2, getPage }),
  destroy: () => Promise.resolve(),
}));

vi.mock("unpdf/pdfjs", () => ({ getDocument: (...a: unknown[]) => getDocument(...(a as [])) }));

const DATA_URL = "data:application/pdf;base64,JVBERi0xLjcK";

/** jsdom has no canvas backend; the component only needs a context + toDataURL. */
function stubCanvas() {
  const proto = window.HTMLCanvasElement.prototype;
  vi.spyOn(proto, "getContext").mockReturnValue({
    fillStyle: "",
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(proto, "toDataURL").mockReturnValue("data:image/jpeg;base64,PAGE");
}

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  getDocument.mockClear();
  getPage.mockClear();
  renderPage.mockClear();
  document.documentElement.removeAttribute("data-native");
});

describe("UploadedLeasePdfPreview", () => {
  it("rasterizes in the browser on iOS without any network request", async () => {
    stubCanvas();
    setUserAgent(IPHONE_UA);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<UploadedLeasePdfPreview dataUrl={DATA_URL} title="Lease PDF preview" fileName="Lease.pdf" />);

    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getByAltText("Lease PDF preview — page 1")).toBeDefined();
    // The whole point: no server round trip, so no egress and no dead route.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Could not render this PDF/)).toBeNull();
  });

  it("rasterizes in the native shell even when the UA is not an iPhone", async () => {
    stubCanvas();
    setUserAgent(DESKTOP_UA);
    document.documentElement.setAttribute("data-native", "android");

    render(<UploadedLeasePdfPreview dataUrl={DATA_URL} title="Lease PDF preview" />);

    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));
  });

  it("keeps the browser's own PDF viewer on desktop", async () => {
    setUserAgent(DESKTOP_UA);

    const { container } = render(
      <UploadedLeasePdfPreview dataUrl={DATA_URL} title="Lease PDF preview" fileName="Lease.pdf" />,
    );

    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe(DATA_URL);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("always keeps the Open full document escape hatch pointed at the file", async () => {
    stubCanvas();
    setUserAgent(IPHONE_UA);

    render(<UploadedLeasePdfPreview dataUrl={DATA_URL} title="Lease PDF preview" fileName="Lease.pdf" />);

    const link = screen.getByRole("link", { name: /Open full document — Lease\.pdf/ });
    expect(link.getAttribute("href")).toBe(DATA_URL);
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("falls back to the escape-hatch message when the document cannot be parsed", async () => {
    stubCanvas();
    setUserAgent(IPHONE_UA);
    getDocument.mockReturnValueOnce({
      promise: Promise.reject(new Error("bad pdf")),
      destroy: () => Promise.resolve(),
    } as unknown as ReturnType<typeof getDocument>);

    render(<UploadedLeasePdfPreview dataUrl={DATA_URL} title="Lease PDF preview" />);

    await waitFor(() => expect(screen.getByText(/Could not render this PDF/)).toBeDefined());
    expect(screen.getByText(/Use Open full document above/)).toBeDefined();
  });
});
