"use client";

/**
 * Renders an assistant chat reply's markdown (GFM: tables, lists, bold) with
 * portal-styled elements, shared by the Axis assistant and the /demo chat.
 * Raw HTML in model output is never rendered — react-markdown escapes it by
 * default, and untrusted tenant text can flow into replies.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-4">{children}</ol>,
          li: ({ children }) => <li className="leading-snug">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-foreground/[0.06] px-1 py-0.5 text-[0.85em]">{children}</code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 border-l-2 border-border pl-3 text-muted">{children}</blockquote>
          ),
          hr: () => <hr className="my-2 border-border/60" />,
          // The prompt discourages headers; render any that slip through as
          // compact bold lines rather than shouty page headings.
          h1: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          h2: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          h3: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          h4: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-border bg-background/60">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-foreground/[0.04]">{children}</thead>,
          th: ({ children }) => (
            <th className="whitespace-nowrap px-2.5 py-1.5 text-left font-medium text-muted">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-t border-border/60 px-2.5 py-1.5 align-top">{children}</td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
