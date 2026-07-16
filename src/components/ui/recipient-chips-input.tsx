"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import {
  commitOtherRecipientToken,
  type OtherRecipientToken,
} from "@/lib/communication-other-recipients";

/**
 * iOS / email-style recipient field: typing + Space/Comma/Enter turns a
 * valid email or phone into a removable chip.
 */
export function RecipientChipsInput({
  tokens,
  onChange,
  placeholder,
  id,
  dataAttr,
  disabled,
}: {
  tokens: OtherRecipientToken[];
  onChange: (next: OtherRecipientToken[]) => void;
  placeholder?: string;
  id?: string;
  dataAttr?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tryCommit = (raw: string): boolean => {
    const committed = commitOtherRecipientToken(raw);
    if (!committed) return false;
    const key = `${committed.kind}:${committed.value}`;
    if (tokens.some((t) => `${t.kind}:${t.value}` === key)) {
      setDraft("");
      return true;
    }
    onChange([...tokens, committed]);
    setDraft("");
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !draft && tokens.length > 0) {
      e.preventDefault();
      onChange(tokens.slice(0, -1));
      return;
    }
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
      if (!draft.trim()) {
        if (e.key === "Enter") e.preventDefault();
        return;
      }
      e.preventDefault();
      tryCommit(draft);
      return;
    }
    if (e.key === " ") {
      // Commit when the draft is already a valid email/phone (iOS-style).
      // Incomplete phone fragments keep the space in the draft (e.g. 510 309…).
      if (tryCommit(draft)) {
        e.preventDefault();
      }
    }
  };

  const removeAt = (index: number) => {
    onChange(tokens.filter((_, i) => i !== index));
    inputRef.current?.focus();
  };

  return (
    <div
      className={[
        "mt-1 flex min-h-[44px] w-full flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-auth-input-bg px-2.5 py-2",
        "shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,box-shadow] duration-200",
        "focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10",
        disabled ? "cursor-not-allowed opacity-50" : "hover:border-primary/25",
      ].join(" ")}
      data-attr={dataAttr}
      onClick={() => inputRef.current?.focus()}
    >
      {tokens.map((token, index) => (
        <span
          key={`${token.kind}:${token.value}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/15 py-1 pl-2.5 pr-1 text-[13px] font-medium text-foreground"
        >
          <span className="min-w-0 truncate">{token.label}</span>
          <button
            type="button"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-primary/20 hover:text-foreground"
            aria-label={`Remove ${token.label}`}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              removeAt(index);
            }}
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="email"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        value={draft}
        placeholder={tokens.length === 0 ? placeholder : ""}
        className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-[16px] text-foreground outline-none placeholder:text-muted/70 sm:min-w-[10rem] sm:text-sm"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (draft.trim()) tryCommit(draft);
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (!text || (!text.includes(",") && !text.includes(";") && !text.includes("\n") && !text.includes(" "))) {
            return;
          }
          e.preventDefault();
          const parts = text.split(/[,;\n]+/).flatMap((p) => p.trim().split(/\s+/)).filter(Boolean);
          const next = [...tokens];
          const seen = new Set(next.map((t) => `${t.kind}:${t.value}`));
          let leftover = "";
          for (const part of parts) {
            const committed = commitOtherRecipientToken(part);
            if (!committed) {
              leftover = part;
              continue;
            }
            const key = `${committed.kind}:${committed.value}`;
            if (seen.has(key)) continue;
            seen.add(key);
            next.push(committed);
          }
          onChange(next);
          setDraft(leftover);
        }}
      />
    </div>
  );
}
