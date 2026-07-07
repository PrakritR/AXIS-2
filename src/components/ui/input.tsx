import type { InputHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

const fieldBase =
  "min-h-[44px] w-full rounded-2xl border border-border bg-auth-input-bg px-4 py-2.5 text-[16px] text-foreground outline-none shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-muted/70 hover:border-primary/25 focus:border-primary/40 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

const selectField =
  `${fieldBase} box-border h-[44px] appearance-none pr-10`;

const textareaBase =
  "min-h-[80px] w-full resize-none [field-sizing:content] rounded-2xl border border-border bg-auth-input-bg px-4 py-3 text-[16px] text-foreground outline-none shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-muted/70 hover:border-primary/25 focus:border-primary/40 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldBase} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${textareaBase} ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select className={`${selectField} ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  );
}
