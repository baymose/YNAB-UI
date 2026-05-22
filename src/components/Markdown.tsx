import { Fragment, type ReactNode } from "react";

export function Markdown({ text }: { text: string }) {
  return <>{renderBlocks(text)}</>;
}

function renderBlocks(src: string): ReactNode {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const push = (n: ReactNode) => out.push(<Fragment key={key++}>{n}</Fragment>);

  while (i < lines.length) {
    const line = lines[i];

    // blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // fenced code block
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      push(
        <pre className="my-2 overflow-auto rounded-lg border border-border bg-panel-2 px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground/90">
          <code>{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls =
        level <= 2
          ? "mt-2 mb-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-2"
          : "mt-2 mb-1 text-sm font-semibold text-foreground";
      push(<div className={cls}>{renderInline(h[2])}</div>);
      i++;
      continue;
    }

    // table
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      push(renderTable(header, rows));
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      push(
        <ul className="my-1.5 space-y-1 pl-1">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2 text-sm">
              <span className="mt-[0.55em] inline-block h-1 w-1 shrink-0 rounded-full bg-accent/70" />
              <span className="flex-1">{renderInline(it)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      push(
        <ol className="my-1.5 space-y-1 pl-1">
          {items.map((it, idx) => (
            <li key={idx} className="flex gap-2 text-sm">
              <span className="num shrink-0 text-muted-2">{idx + 1}.</span>
              <span className="flex-1">{renderInline(it)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      push(
        <div className="my-2 border-l-2 border-accent/50 pl-3 text-sm text-muted">
          {renderInline(buf.join(" "))}
        </div>
      );
      continue;
    }

    // paragraph
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|\s*[-*]\s|\s*\d+\.\s|\s*>\s)/.test(lines[i]) &&
      !(/\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    push(<p className="text-sm leading-relaxed">{renderInline(buf.join(" "))}</p>);
  }

  return out;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

function renderTable(header: string[], rows: string[][]): ReactNode {
  // Render as key/value cards when 2 columns, else as a styled table
  if (header.length === 2 && rows.length > 0) {
    return (
      <div className="my-2 overflow-hidden rounded-lg border border-border bg-panel/60">
        {rows.map((r, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2 last:border-b-0"
          >
            <span className="text-sm text-muted">{renderInline(r[0] ?? "")}</span>
            <span className="num text-sm font-medium text-foreground text-right">
              {renderInline(r[1] ?? "")}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-panel-2">
            {header.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2"
              >
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-border/60">
              {r.map((c, ci) => (
                <td key={ci} className="num px-3 py-2 text-foreground/90">
                  {renderInline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text: string): ReactNode {
  // Order matters: code first to avoid further parsing inside
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;

  const patterns: { re: RegExp; render: (m: RegExpExecArray) => ReactNode }[] = [
    {
      re: /`([^`]+)`/,
      render: (m) => (
        <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[12px] text-accent">
          {m[1]}
        </code>
      ),
    },
    {
      re: /\*\*([^*]+)\*\*/,
      render: (m) => <strong className="font-semibold text-foreground">{m[1]}</strong>,
    },
    {
      re: /(?<!\*)\*([^*]+)\*(?!\*)/,
      render: (m) => <em className="italic">{m[1]}</em>,
    },
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      render: (m) => (
        <a
          href={m[2]}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {m[1]}
        </a>
      ),
    },
  ];

  while (rest.length) {
    let earliest: { idx: number; m: RegExpExecArray; render: (m: RegExpExecArray) => ReactNode } | null = null;
    for (const p of patterns) {
      const m = p.re.exec(rest);
      if (m && (!earliest || m.index < earliest.idx)) {
        earliest = { idx: m.index, m, render: p.render };
      }
    }
    if (!earliest) {
      nodes.push(<Fragment key={key++}>{rest}</Fragment>);
      break;
    }
    if (earliest.idx > 0) {
      nodes.push(<Fragment key={key++}>{rest.slice(0, earliest.idx)}</Fragment>);
    }
    nodes.push(<Fragment key={key++}>{earliest.render(earliest.m)}</Fragment>);
    rest = rest.slice(earliest.idx + earliest.m[0].length);
  }

  return nodes;
}
