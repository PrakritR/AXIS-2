import type { InputHTMLAttributes } from "react";

const fieldBase =
  "min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[16px] text-slate-950 outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-slate-400 hover:bg-white focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm";

const textareaBase =
  "min-h-[120px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[16px] text-slate-950 outline-none transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-slate-400 hover:bg-white focus:border-primary/40 focus:bg-white focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm";

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
    <select className={`${fieldBase} ${className}`} {...props}>
      {children}
    </select>
  );
}
