"use client";

import { useId, useMemo, useRef, useState } from "react";

export type PropertySearchOption = {
  id: string;
  title: string;
  subtitle?: string;
  tags?: string[];
  /** Extra text included when filtering (address, neighborhood, etc.). */
  searchText?: string;
};

const DEFAULT_PREVIEW_LIMIT = 50;

function normalizeSearchHaystack(option: PropertySearchOption): string {
  return [option.title, option.subtitle, option.searchText, ...(option.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function CheckSmIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
      {children}
    </span>
  );
}

export function PropertySearchPicker({
  options,
  value,
  onChange,
  placeholder = "Search by address, neighborhood, or property name…",
  emptyMessage = "No properties match your search.",
  listEmptyMessage = "No properties available right now.",
  previewLimit = DEFAULT_PREVIEW_LIMIT,
  ariaLabel = "Search properties",
}: {
  options: PropertySearchOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  emptyMessage?: string;
  listEmptyMessage?: string;
  previewLimit?: number;
  ariaLabel?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);
  const displayQuery = selected && !focused ? "" : query;

  const filtered = useMemo(() => {
    const q = displayQuery.trim().toLowerCase();
    const matched = q
      ? options.filter((o) => normalizeSearchHaystack(o).includes(q))
      : options;
    const limited = q ? matched : matched.slice(0, previewLimit);
    return {
      items: limited,
      total: matched.length,
      truncated: !q && matched.length > previewLimit,
    };
  }, [options, previewLimit, displayQuery]);

  const showList = focused || displayQuery.length > 0 || !selected;

  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={displayQuery}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            window.setTimeout(() => setFocused(false), 120);
          }}
          placeholder={selected && !focused && !displayQuery ? selected.title : placeholder}
          aria-label={ariaLabel}
          aria-controls={listId}
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        {selected ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary hover:underline"
          >
            Change
          </button>
        ) : null}
      </div>

      {selected && !showList ? (
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 ring-2 ring-primary/10">
          <p className="text-sm font-semibold text-slate-900">{selected.title}</p>
          {selected.subtitle ? <p className="mt-0.5 text-xs text-slate-500">{selected.subtitle}</p> : null}
          {selected.tags && selected.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {selected.tags.map((tag) => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showList ? (
        <div className="space-y-2">
          {options.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {listEmptyMessage}
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                {displayQuery.trim()
                  ? `${filtered.total} ${filtered.total === 1 ? "match" : "matches"}`
                  : filtered.truncated
                    ? `Showing ${filtered.items.length} of ${filtered.total} properties — search to find yours faster`
                    : `${filtered.total} ${filtered.total === 1 ? "property" : "properties"}`}
              </p>
              <ul
                id={listId}
                role="listbox"
                aria-label={ariaLabel}
                className="max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-1"
              >
                {filtered.items.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    {emptyMessage}
                  </li>
                ) : (
                  filtered.items.map((option) => {
                    const isSelected = value === option.id;
                    return (
                      <li key={option.id} role="option" aria-selected={isSelected}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            onChange(option.id);
                            setQuery("");
                            setFocused(false);
                            inputRef.current?.blur();
                          }}
                          className={`w-full rounded-2xl border p-4 text-left transition-all duration-150 ${
                            isSelected
                              ? "border-primary bg-primary/[0.08] ring-2 ring-primary/20"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{option.title}</p>
                              {option.subtitle ? (
                                <p className="mt-0.5 truncate text-xs text-slate-500">{option.subtitle}</p>
                              ) : null}
                              {option.tags && option.tags.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {option.tags.map((tag) => (
                                    <Chip key={tag}>{tag}</Chip>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            <div
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                isSelected ? "border-primary bg-primary text-white" : "border-slate-300 bg-white"
                              }`}
                            >
                              {isSelected ? <CheckSmIcon /> : null}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function buildingGroupsToSearchOptions(
  buildings: {
    buildingId: string;
    buildingName: string;
    address: string;
    neighborhood: string;
    units: unknown[];
  }[],
): PropertySearchOption[] {
  return buildings.map((b) => {
    const count = b.units.length;
    return {
      id: b.buildingId,
      title: b.buildingName,
      subtitle: b.address,
      tags: [b.neighborhood, `${count} ${count === 1 ? "room" : "rooms"} available`],
      searchText: `${b.buildingName} ${b.address} ${b.neighborhood}`,
    };
  });
}
