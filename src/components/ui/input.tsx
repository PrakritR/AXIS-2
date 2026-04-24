import type { InputHTMLAttributes } from "react";

const fieldBase =
  "min-h-[44px] w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-[16px] text-slate-950 outline-none shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-primary/35 focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm";

const textareaBase =
  "min-h-[120px] w-full resize-y rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-[16px] text-slate-950 outline-none shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-primary/35 focus:bg-white focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm";

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
