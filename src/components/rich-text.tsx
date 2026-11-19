import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/lib/mini-markdown";
import { cn } from "@/lib/utils";

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.t === "text") return <Fragment key={i}>{n.v}</Fragment>;
        if (n.t === "b") return <strong key={i} className="font-semibold"><Inlines nodes={n.c} /></strong>;
        if (n.t === "i") return <em key={i}><Inlines nodes={n.c} /></em>;
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-primary underline underline-offset-2">
            <Inlines nodes={n.c} />
          </a>
        );
      })}
    </>
  );
}

/** Renders shift instructions written with the small formatting set (see mini-markdown). */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);
  if (!blocks.length) return null;
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed", className)}>
      {blocks.map((b, i) => {
        if (b.t === "h") return <p key={i} className="text-sm font-semibold"><Inlines nodes={b.c} /></p>;
        if (b.t === "p") return <p key={i} className="whitespace-pre-line"><Inlines nodes={b.c} /></p>;
        const List = b.t === "ul" ? "ul" : "ol";
        return (
          <List key={i} className={cn("space-y-0.5 pl-5", b.t === "ul" ? "list-disc" : "list-decimal")}>
            {b.items.map((it, j) => <li key={j}><Inlines nodes={it} /></li>)}
          </List>
        );
      })}
    </div>
  );
}
