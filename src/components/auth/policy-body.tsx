"use client";

import { Fragment } from "react";

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
          : <Fragment key={i}>{p.replace(/\*(.*?)\*/g, "$1")}</Fragment>,
      )}
    </>
  );
}

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; text: string };

/** Turns the organisation's Markdown-lite policy text into blocks, grouping list items. */
export function parsePolicy(text: string, org: string): Block[] {
  const out: Block[] = [];
  for (const line of text.replace(/\{\{organisation\}\}/g, org).split("\n")) {
    if (!line.trim()) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    const last = out[out.length - 1];
    if (h) out.push({ kind: "h", level: h[1].length, text: h[2] });
    else if (ul) last?.kind === "ul" ? last.items.push(ul[1]) : out.push({ kind: "ul", items: [ul[1]] });
    else if (ol) last?.kind === "ol" ? last.items.push(ol[1]) : out.push({ kind: "ol", items: [ol[1]] });
    else out.push({ kind: "p", text: line.trim() });
  }
  return out;
}

export function PolicyBody({ text, org }: { text: string; org: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      {parsePolicy(text, org).map((b, i) => {
        if (b.kind === "h") {
          return b.level === 1
            ? <h2 key={i} className="text-lg font-semibold text-foreground">{b.text}</h2>
            : <h3 key={i} className="pt-2 text-base font-semibold text-foreground">{b.text}</h3>;
        }
        if (b.kind === "ul") return <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ul>;
        if (b.kind === "ol") return <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}</ol>;
        return <p key={i}><Inline text={b.text} /></p>;
      })}
    </div>
  );
}
