import { describe, expect, it } from "vitest";
import { isEmbeddableFlyerImageUrl, sanitizeFlyerImages } from "@/lib/promotion-flyer";

describe("flyer image embed rules", () => {
  it("accepts base64 data URLs and public listing-photos URLs", () => {
    const listing =
      "https://project.supabase.co/storage/v1/object/public/listing-photos/mgr/u/hero.jpg";
    expect(isEmbeddableFlyerImageUrl("data:image/jpeg;base64,abcd")).toBe(true);
    expect(isEmbeddableFlyerImageUrl(listing)).toBe(true);
    expect(isEmbeddableFlyerImageUrl("https://evil.example/photo.jpg")).toBe(false);
    expect(sanitizeFlyerImages([listing, "https://evil.example/x.jpg"])).toEqual([listing]);
  });
});
