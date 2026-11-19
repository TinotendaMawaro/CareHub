/**
 * A small, safe subset of Markdown for shift instructions: headings (#), bullet (-) and
 * numbered (1.) lists, **bold**, *italic*, [links](https://...) and bare web addresses.
 * It produces a tree, never HTML, so nothing typed can run as code.
 *
 * The staff app keeps an identical copy in mobile/src/lib/mini-markdown.ts.
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "h"; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] };

/** Only web, email and phone links are allowed; anything else is shown as plain text. */
export function safeHref(raw: string): string | null {
  const h = raw.trim();
  if (/^https?:\/\/[^\s]+$/i.test(h)) return h;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(h)) return h;
  if (/^tel:\+?[0-9 ()-]{3,}$/i.test(h)) return h;
  if (/^www\.[^\s]+$/i.test(h)) return `https://${h}`;
  return null;
}

const TOKEN = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)|((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'"])/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    const m = TOKEN.exec(rest);
    if (!m) { out.push({ t: "text", v: rest }); break; }
    if (m.index > 0) out.push({ t: "text", v: rest.slice(0, m.index) });
    const [whole, bold, linkText, linkHref, star, under, bare] = m;
    if (bold !== undefined) out.push({ t: "b", c: parseInline(bold) });
    else if (linkText !== undefined) {
      const href = safeHref(linkHref);
      out.push(href ? { t: "link", href, c: parseInline(linkText) } : { t: "text", v: whole });
    } else if (star !== undefined || under !== undefined) out.push({ t: "i", c: parseInline(star ?? under) });
    else if (bare !== undefined) {
      const href = safeHref(bare);
      out.push(href ? { t: "link", href, c: [{ t: "text", v: bare }] } : { t: "text", v: bare });
    }
    rest = rest.slice(m.index + whole.length);
  }
  // merge neighbouring text runs
  return out.reduce<Inline[]>((acc, n) => {
    const last = acc[acc.length - 1];
    if (n.t === "text" && last?.t === "text") last.v += n.v;
    else acc.push(n);
    return acc;
  }, []);
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join("\n")) });
    para = [];
  };
  for (const raw of (src ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = /^#{1,3}\s+(.+)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.+)$/.exec(line);
    const ol = /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line);
    if (!line.trim()) { flush(); continue; }
    if (h) { flush(); blocks.push({ t: "h", c: parseInline(h[1]) }); continue; }
    if (ul || ol) {
      flush();
      const kind = ul ? "ul" : "ol";
      const last = blocks[blocks.length - 1];
      const item = parseInline((ul ?? ol)![1]);
      if (last && last.t === kind) last.items.push(item);
      else blocks.push(kind === "ul" ? { t: "ul", items: [item] } : { t: "ol", items: [item] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** Plain text for one-line previews (chips, notifications). */
export function toPlainText(src: string): string {
  const flat = (c: Inline[]): string => c.map((n) => (n.t === "text" ? n.v : flat(n.c))).join("");
  return parseMarkdown(src)
    .map((b) => (b.t === "ul" || b.t === "ol" ? b.items.map((i) => `• ${flat(i)}`).join(" ") : flat(b.c)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
