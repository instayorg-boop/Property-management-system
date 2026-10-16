import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { Info, Lightbulb, WarningCircle } from "@phosphor-icons/react";

/** Markdown component overrides so article text reads like a styled doc page (tables, bold,
 * lists) instead of browser-default markdown -- matches the rest of the dashboard's type scale
 * and colors rather than its own thing. */
const markdownComponents: Components = {
  p: (props) => <p className="mt-4 text-sm leading-7 text-muted first:mt-0" {...props} />,
  strong: (props) => <strong className="font-semibold text-ink" {...props} />,
  a: (props) => <a className="font-medium text-brand underline underline-offset-2" {...props} />,
  ul: (props) => <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted" {...props} />,
  ol: (props) => <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-muted" {...props} />,
  li: (props) => <li className="pl-1" {...props} />,
  h3: (props) => <h3 className="mt-6 text-sm font-bold text-ink" {...props} />,
  code: (props) => <code className="rounded bg-mist px-1.5 py-0.5 text-[13px] text-ink" {...props} />,
  table: (props) => (
    <div className="mt-5 mb-1 overflow-hidden overflow-x-auto rounded-xl border border-line shadow-sm">
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-mist/80" {...props} />,
  th: (props) => (
    <th
      className="border-b border-line px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-muted"
      {...props}
    />
  ),
  td: (props) => <td className="border-b border-line/70 px-4 py-3 align-top text-ink" {...props} />,
  tbody: (props) => <tbody className="[&>tr:last-child>td]:border-b-0" {...props} />,
  tr: (props) => <tr className="even:bg-mist/30" {...props} />,
};

type CalloutKind = "note" | "tip" | "warning";

const CALLOUT_STYLES: Record<CalloutKind, { wrap: string; icon: typeof Info }> = {
  note: { wrap: "border-sky-200 bg-sky-50 text-sky-900", icon: Info },
  tip: { wrap: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: Lightbulb },
  warning: { wrap: "border-amber-200 bg-amber-50 text-amber-900", icon: WarningCircle },
};

type Segment = { kind: "markdown"; content: string } | { kind: "callout"; type: CalloutKind; content: string };

/** Article text is written with a spaced double hyphen (" -- ") as a plain-ASCII em dash, same
 * convention used everywhere else in this codebase's prose/comments. Markdown doesn't typeset
 * that on its own, so without this it rendered as a literal "--" instead of a dash. */
function normalizeDashes(text: string): string {
  return text.replace(/ -- /g, " — ");
}

/** Splits a block's body on ":::note / :::tip / :::warning" fences (content authors write these
 * directly in Supabase, no schema change needed) so the parts in between render as highlighted
 * callout boxes rather than another paragraph of plain text -- the whole point being that a guide
 * can emphasize "don't skip this" visually instead of relying on the reader to notice it mid-wall
 * of text. */
function parseSegments(body: string): Segment[] {
  // \r?\n matters: content saved from a SQL heredoc (or edited on Windows) round-trips with
  // CRLF line endings, and a bare \n silently fails to match ":::note\r\n...", which rendered
  // the whole fence as a literal line of text instead of a callout.
  const FENCE_RE = /:::(note|tip|warning)\r?\n([\s\S]*?)\r?\n:::/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "markdown", content: body.slice(lastIndex, match.index) });
    }
    segments.push({ kind: "callout", type: match[1] as CalloutKind, content: match[2] });
    lastIndex = FENCE_RE.lastIndex;
  }
  if (lastIndex < body.length) {
    segments.push({ kind: "markdown", content: body.slice(lastIndex) });
  }
  return segments;
}

function Callout({ type, content }: { type: CalloutKind; content: string }) {
  const { wrap, icon: Icon } = CALLOUT_STYLES[type];
  return (
    <div className={`mt-5 flex gap-3 rounded-xl border px-4.5 py-3.5 ${wrap}`}>
      <Icon size={19} weight="fill" className="mt-0.5 shrink-0 opacity-80" />
      <div className="min-w-0 text-sm leading-7 [&>p]:mt-0 [&>p]:text-current [&_strong]:text-current">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

/** Renders a help block's body: markdown (bold, lists, tables, links) with ":::note/tip/warning"
 * fences lifted out into styled callout boxes, so a guide isn't limited to flat paragraph text. */
export default function HelpBody({ text }: { text: string }) {
  if (!text.trim()) return null;
  const segments = parseSegments(normalizeDashes(text));
  return (
    <div>
      {segments.map((seg, i) =>
        seg.kind === "callout" ? (
          <Callout key={i} type={seg.type} content={seg.content} />
        ) : seg.content.trim() ? (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {seg.content}
          </ReactMarkdown>
        ) : null
      )}
    </div>
  );
}
