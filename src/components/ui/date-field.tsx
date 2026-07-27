"use client";

/**
 * A typing-friendly date field: a free-text input the user can type into
 * naturally (any of a handful of common formats, with or without
 * separators), backed by a hidden native `<input type="date">` that powers
 * an optional calendar-icon picker. Replaces the raw `<input type="date">`
 * previously used across the rental application wizard, whose segment-by-
 * segment entry, cursor-jumping, and paste-rejecting behavior is what the
 * "hard to type a date" complaint was about — see AGENTS.md.
 *
 * Contract: `value`/`onChange` are always a strict `yyyy-mm-dd` ISO string
 * (or "" when empty), identical to what `<input type="date">` used to carry,
 * so call sites and the rest of the date-math in
 * `src/lib/rental-application/lease-dates.ts` need no changes.
 */

import { useEffect, useRef, useState, type ClipboardEvent, type InputHTMLAttributes } from "react";
import { Calendar } from "lucide-react";

const fieldBase =
  "min-h-[44px] w-full rounded-2xl border border-border bg-auth-input-bg py-2.5 pl-4 pr-11 text-[16px] text-foreground outline-none shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-muted/70 hover:border-primary/25 focus:border-primary/40 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function toIso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses a human-typed or pasted date into a strict `yyyy-mm-dd` string, or
 * null if it isn't (yet, or ever going to be) a real calendar date. Accepts,
 * in order: ISO (`2026-07-31`), numeric US month/day/year with `/`, `-`, or
 * `.` separators and a 2- or 4-digit year (`07/31/2026`, `7-31-26`), and a
 * month-name form for pasted text (`July 31, 2026`, `Jul 31 2026`).
 */
export function parseTypedDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    return isRealCalendarDate(year, month, day) ? toIso(year, month, day) : null;
  }

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(trimmed);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    let year = Number(m[3]);
    if (m[3]!.length === 2) year += year < 70 ? 2000 : 1900;
    return isRealCalendarDate(year, month, day) ? toIso(year, month, day) : null;
  }

  m = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(trimmed);
  if (m) {
    const month = MONTH_NAMES[m[1]!.toLowerCase()];
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (!month) return null;
    return isRealCalendarDate(year, month, day) ? toIso(year, month, day) : null;
  }

  return null;
}

/** Formats a strict `yyyy-mm-dd` string as `MM/DD/YYYY`. Returns "" for anything else. */
export function formatDateDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/**
 * Masks whatever the user typed into `MM/DD/YYYY`, honoring both separators they
 * type themselves AND digit-only entry. A purely positional digit mask turns the
 * completely natural `3/15/2027` (single-digit month, explicit slashes) into
 * `31/52/027`, because it can't tell "3, then a separator" from "3, then more
 * month digits". This walks the input into month(2)/day(2)/year(4) fields where
 * an explicit `/`, `-`, or `.` advances to the next field even when the current
 * one is short, and a field that fills to capacity auto-advances (so a digits
 * typist still gets `03152027` → `03/15/2027`). A short month/day is padded once
 * the input has moved past it, so `3/` → `03/` and `3/1/2027` → `03/01/2027`.
 */
export function maskTypedDate(raw: string): string {
  const normalized = raw.replace(/[.\-]/g, "/").replace(/[^\d/]/g, "");
  const caps = [2, 2, 4];
  const fields = ["", "", ""];
  let fi = 0;
  for (const ch of normalized) {
    if (ch === "/") {
      if (fi < 2) fi += 1;
      continue;
    }
    if (fields[fi]!.length >= caps[fi]!) {
      if (fi >= 2) break; // year full — ignore extra digits
      fi += 1;
    }
    fields[fi] += ch;
  }
  // Pad a lone month/day digit only once the input has advanced past it.
  if (fi >= 1 && fields[0]!.length === 1) fields[0] = `0${fields[0]}`;
  if (fi >= 2 && fields[1]!.length === 1) fields[1] = `0${fields[1]}`;
  let out = fields[0]!;
  if (fi >= 1) out += `/${fields[1]}`;
  if (fi >= 2) out += `/${fields[2]}`;
  return out;
}

function clampIso(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

export interface DateFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
}

export function DateField({ value, onChange, min, max, disabled, className = "", placeholder = "MM/DD/YYYY", id, ...rest }: DateFieldProps) {
  const [text, setText] = useState(() => formatDateDisplay(value));
  const focusedRef = useRef(false);
  const nativeRef = useRef<HTMLInputElement>(null);

  // Syncs from external changes (property switch resetting the field,
  // reconciliation loading a draft, the hidden native picker) — but never
  // while the user is actively typing, or every completed 8-digit commit
  // would immediately re-format out from under the caret mid-entry.
  useEffect(() => {
    if (focusedRef.current) return;
    setText(formatDateDisplay(value));
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const atEnd = caret >= raw.length;
    const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, "").length;
    const masked = maskTypedDate(raw);
    setText(masked);

    // Typing at the end (the overwhelmingly common case) simply keeps the caret
    // at the end. For a mid-string edit, re-derive the caret from how many
    // digits preceded it before the re-mask so an inserted "/" never shoves the
    // caret to the end.
    let newCaret = masked.length;
    if (!atEnd) {
      let seen = 0;
      newCaret = masked.length;
      for (let i = 0; i < masked.length; i++) {
        if (seen >= digitsBeforeCaret) {
          newCaret = i;
          break;
        }
        if (/\d/.test(masked[i]!)) seen++;
      }
    }
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(newCaret, newCaret);
    });

    const digits = masked.replace(/\D/g, "");
    if (digits.length >= 8) {
      const parsed = parseTypedDate(masked);
      if (parsed) onChange(clampIso(parsed, min, max));
    } else if (digits.length === 0) {
      onChange("");
    }
  }

  function handleFocus() {
    focusedRef.current = true;
  }

  function handleBlur() {
    focusedRef.current = false;
    const parsed = parseTypedDate(text);
    if (parsed) {
      const finalIso = clampIso(parsed, min, max);
      onChange(finalIso);
      setText(formatDateDisplay(finalIso));
    } else if (text.trim() === "") {
      onChange("");
      setText("");
    }
    // Otherwise leave the incomplete/unparseable text exactly as typed — the
    // step's own required-field check flags it on Continue rather than us
    // silently discarding what the person typed.
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    const parsed = parseTypedDate(pasted);
    if (!parsed) return; // fall through to default paste; onChange's masking still cleans it up
    e.preventDefault();
    const finalIso = clampIso(parsed, min, max);
    setText(formatDateDisplay(finalIso));
    onChange(finalIso);
  }

  function openPicker() {
    const el = nativeRef.current;
    if (!el || disabled) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      // fall through to focus/click below (e.g. blocked without a fresh user gesture)
    }
    el.focus();
    el.click();
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        className={`${fieldBase} ${className}`}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Open calendar picker"
        disabled={disabled}
        onClick={openPicker}
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Calendar className="h-4 w-4" aria-hidden />
      </button>
      <input
        ref={nativeRef}
        type="date"
        id={id ? `${id}-picker` : undefined}
        name={id ? `${id}-picker` : undefined}
        tabIndex={-1}
        aria-hidden
        aria-label="Date picker"
        disabled={disabled}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          setText(formatDateDisplay(next));
        }}
        className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
      />
    </div>
  );
}
