import type { InputHTMLAttributes } from "react";

const fieldBase =
  "w-full rounded-2xl border border-[#e0e4ec] bg-auth-input-bg px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-slate-400 focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_var(--ring)]";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldBase} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-[120px] ${fieldBase} px-3 py-2 ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${fieldBase} px-3 py-2 ${className}`} {...props}>
      {children}
    </select>
  );
}
