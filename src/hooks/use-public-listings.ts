"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MockProperty } from "@/data/types";
import {
  isPropertyActiveForLeads,
  loadPublicExtraListingsFromServer,
  PROPERTY_PIPELINE_EVENT,
  readExtraListingsPublic,
} from "@/lib/demo-property-pipeline";

function readActivePublicListings(): MockProperty[] {
  return readExtraListingsPublic().filter(isPropertyActiveForLeads);
}

export function usePublicListings() {
  const [listings, setListings] = useState<MockProperty[]>(() =>
    typeof window === "undefined" ? [] : readActivePublicListings(),
  );
  const [loading, setLoading] = useState(() =>
    typeof window === "undefined" ? true : readActivePublicListings().length === 0,
  );

  const refreshFromCache = useCallback(() => {
    setListings(readActivePublicListings());
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadPublicExtraListingsFromServer()
      .then((loaded) => {
        if (cancelled) return;
        setListings(loaded.filter(isPropertyActiveForLeads));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const on = () => refreshFromCache();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => {
      cancelled = true;
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
    };
  }, [refreshFromCache]);

  return { listings, loading };
}
