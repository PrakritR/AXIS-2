import { describe, expect, it } from "vitest";
import { listingGeocodeQuery, parseGeocodeResult, parseNominatimAddressSuggestion } from "@/lib/geocode-address";

describe("listingGeocodeQuery", () => {
  it("joins street, neighborhood, zip, and USA for US zips", () => {
    expect(
      listingGeocodeQuery({
        address: "41932 Paseo Padre Pkwy",
        zip: "94538",
        neighborhood: "Fremont",
        unitLabel: "",
      }),
    ).toBe("41932 Paseo Padre Pkwy, Fremont, 94538, USA");
  });

  it("appends unit when not already in the street line", () => {
    expect(
      listingGeocodeQuery({
        address: "4709B 8th Ave NE",
        zip: "98105",
        neighborhood: "University District",
        unitLabel: "Room 2",
      }),
    ).toBe("4709B 8th Ave NE, Room 2, University District, 98105, USA");
  });

  it("returns empty when no address parts", () => {
    expect(listingGeocodeQuery({ address: "", zip: "", neighborhood: "", unitLabel: "" })).toBe("");
  });
});

describe("parseGeocodeResult", () => {
  it("parses valid lat/lng", () => {
    expect(parseGeocodeResult({ lat: 37.5485, lng: -121.9886 })).toEqual({
      lat: 37.5485,
      lng: -121.9886,
    });
  });

  it("rejects invalid coordinates", () => {
    expect(parseGeocodeResult({ lat: "bad", lng: 0 })).toBeNull();
    expect(parseGeocodeResult({ lat: 91, lng: 0 })).toBeNull();
  });
});

describe("parseNominatimAddressSuggestion", () => {
  it("maps street, zip, and neighborhood from address details", () => {
    expect(
      parseNominatimAddressSuggestion({
        place_id: 1,
        display_name: "5515 22nd Ave NW, Ballard, Seattle, WA 98107, USA",
        lat: "47.6689",
        lon: "-122.3845",
        address: {
          house_number: "5515",
          road: "22nd Avenue Northwest",
          neighbourhood: "Ballard",
          city: "Seattle",
          postcode: "98107",
        },
      }),
    ).toMatchObject({
      address: "5515 22nd Avenue Northwest",
      zip: "98107",
      neighborhood: "Ballard",
      city: "Seattle",
      lat: 47.6689,
      lng: -122.3845,
    });
  });
});
