"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type LeafletMap = import("leaflet").Map;

export function ListingLocationMap({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;

    void import("leaflet").then((LeafletMod) => {
      const L = (LeafletMod as { default?: typeof import("leaflet") }).default ?? LeafletMod;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([lat, lng], 14);
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const icon = L.divIcon({
        className: "border-0 bg-transparent",
        html: `<div style="width:22px;height:22px;border-radius:9999px;background:linear-gradient(135deg,#007aff,#339cff);border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.28)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([lat, lng], { icon }).addTo(map);

      requestAnimationFrame(() => map.invalidateSize());
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng]);

  return <div ref={containerRef} className="z-0 h-[min(22rem,48vh)] min-h-[220px] w-full rounded-2xl border border-slate-200/90 bg-slate-50" />;
}
