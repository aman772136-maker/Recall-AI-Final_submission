import type { ReactNode } from "react";
import katex from "katex";

/**
 * Markdown renderer for assistant output.
 *
 * Two safety properties, both deliberate:
 *
 * 1. Model output is parsed into React elements, never concatenated into a
 *    document. `dangerouslySetInnerHTML` is reached in exactly one place —
 *    the <Tex> component below — and only for KaTeX output.
 * 2. KaTeX runs with `trust: false`. That disables \href, \url and
 *    \includegraphics, the commands that could otherwise emit
 *    attacker-chosen URLs or markup. Everything else KaTeX emits is escaped
 *    by KaTeX itself.
 *
 * Supports headings, lists, fenced code, tables, blockquotes, inline code,
 * bold/italic, links, and LaTeX via $inline$ and $$display$$.
 */

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "code"; lang?: string; text: string }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "table"; head: string[]; rows: string[][] };

/**
 * Split on blank lines, but never inside a fenced code block — a fence can
 * legitimately contain blank lines, and splitting there destroys it.
 */
function splitBlocks(src: string): string[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      if (current.length) blocks.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks.filter((b) => b.trim().length > 0);
}

function parseTable(chunk: string): Block | null {
  const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const head = cells(lines[0]);
  if (!/^[\s|:-]+$/.test(lines[1])) return null;
  return { kind: "table", head, rows: lines.slice(2).map(cells) };
}

function parseBlock(chunk: string): Block {
  const fence = chunk.match(/^```([\w-]*)[^\n]*\n([\s\S]*?)\n?```$/);
  if (fence) return { kind: "code", lang: fence[1] || undefined, text: fence[2] };

  const table = parseTable(chunk);
  if (table) return table;

  if (/^---+\s*$/.test(chunk.trim())) return { kind: "hr" };

  const heading = chunk.match(/^(#{1,3})\s+(.*)$/s);
  if (heading) {
    return { kind: "h", level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() };
  }

  if (chunk.startsWith(">")) {
    return {
      kind: "quote",
      text: chunk
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .join("\n"),
    };
  }

  const lines = chunk.split("\n");
  if (lines.every((l) => /^\s*[-*+]\s+/.test(l))) {
    return { kind: "ul", items: lines.map((l) => l.replace(/^\s*[-*+]\s+/, "")) };
  }
  if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
    return { kind: "ol", items: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, "")) };
  }

  return { kind: "p", text: chunk.replace(/\n/g, " ") };
}

/* ------------------------------------------------------------------ */
/* Math                                                                */
/* ------------------------------------------------------------------ */

function Tex({ tex, display }: { tex: string; display: boolean }) {
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      trust: false, // keeps \href, \url, \includegraphics disabled
      strict: false,
      output: "html",
      maxSize: 64,
      maxExpand: 512,
    });
  } catch {
    // A bad formula must never take down the answer.
    return <code>{tex}</code>;
  }

  return (
    <span
      className={display ? "tex tex-display" : "tex tex-inline"}
      // KaTeX output only. `trust: false` and KaTeX's own escaping apply.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

type Segment =
  | { type: "text"; text: string }
  | { type: "math"; math: string; display: boolean };

/** Splits text into alternating plain / math segments. */
function splitMath(text: string): Segment[] {
  const re: RegExp = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", text: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      out.push({ type: "math", math: m[1], display: true });
    } else {
      out.push({ type: "math", math: m[2], display: false });
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** Non-math inline rendering: code, links, emphasis. */
function inlineText(text: string, keyPrefix: string): ReactNode[] {
  if (!text) return [];
  const out: ReactNode[] = [];
  const re =
    /(`[^`\n]+`)|(\[[^\]\n]+\]\((?:https?:\/\/)[^\s)]+\))|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-i${i++}`;

    if (tok.startsWith("`")) {
      out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("[")) {
      const mm = tok.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (mm) {
        out.push(
          <a key={key} href={mm[2]} target="_blank" rel="noopener noreferrer nofollow">
            {mm[1]}
          </a>,
        );
      } else {
        out.push(tok);
      }
    } else if (tok.startsWith("**") || tok.startsWith("__")) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Full inline pass: math segments plus ordinary inline formatting. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];

  splitMath(text).forEach((seg, i) => {
    const key = `${keyPrefix}-s${i}`;
    if (seg.type === "math") {
      out.push(<Tex key={key} tex={seg.math} display={seg.display} />);
    } else {
      out.push(...inlineText(seg.text, key));
    }
  });

  return out.length ? out : [text];
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function Markdown({ text }: { text: string }) {
  const blocks = splitBlocks(text);

  return (
    <div className="md">
      {blocks.map((chunk, bi) => {
        const block = parseBlock(chunk);
        const key = `b${bi}`;

        switch (block.kind) {
          case "h": {
            const Tag = `h${block.level}` as const;
            return <Tag key={key}>{inline(block.text, key)}</Tag>;
          }
          case "ul":
            return (
              <ul key={key}>
                {block.items.map((it, ii) => (
                  <li key={`${key}-${ii}`}>{inline(it, `${key}-${ii}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key}>
                {block.items.map((it, ii) => (
                  <li key={`${key}-${ii}`}>{inline(it, `${key}-${ii}`)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre key={key} data-lang={block.lang ?? undefined}>
                <code>{block.text}</code>
              </pre>
            );
          case "quote":
            return <blockquote key={key}>{inline(block.text, key)}</blockquote>;
          case "hr":
            return <hr key={key} />;
          case "table":
            return (
              <table key={key}>
                <thead>
                  <tr>
                    {block.head.map((h, hi) => (
                      <th key={hi}>{inline(h, `${key}-h${hi}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((c, ci) => (
                        <td key={ci}>{inline(c, `${key}-r${ri}c${ci}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          default:
            return <p key={key}>{inline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}

/** Plain-text form, used for clipboard and title generation. */
export function toPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " [code] ")
    .replace(/\$\$[\s\S]+?\$\$/g, " [formula] ")
    .replace(/\$[^$\n]+?\$/g, (m) => m.slice(1, -1))
    .replace(/[#>*_`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}