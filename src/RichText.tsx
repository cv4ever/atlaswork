// An agent reply's Markdown drawn as the chat's own elements (agents-design D64): paragraphs, lists, a table, quotes,
// code, emphasis and links. It reads marked's tokens and builds React elements, never HTML, so a reply can't inject
// markup: raw HTML shows as the text it is, and only web and mail links open. AgentPanel loads it lazily, and only for
// a reply that has marks (`hasMarks`), so plain replies cost nothing. Styles: `.message-rich` in chat-panel.css.
import { Fragment, useMemo } from "react";
import type { ReactNode } from "react";
import { lexer } from "marked";
import type { Token, Tokens } from "marked";

const safeHref = (href: string) => /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : undefined;

function inline(tokens: Token[] | undefined, key: string): ReactNode[] {
  return (tokens ?? []).map((token, index) => {
    const at = `${key}.${index}`;
    switch (token.type) {
      case "strong": return <strong key={at}>{inline(token.tokens, at)}</strong>;
      case "em": return <em key={at}>{inline(token.tokens, at)}</em>;
      case "del": return <del key={at}>{inline(token.tokens, at)}</del>;
      case "codespan": return <code key={at}>{token.text}</code>;
      case "br": return <br key={at} />;
      case "link": {
        const href = safeHref((token as Tokens.Link).href);
        return href ? <a key={at} href={href} target="_blank" rel="noopener noreferrer">{inline(token.tokens, at)}</a>
          : <Fragment key={at}>{inline(token.tokens, at)}</Fragment>;
      }
      case "text": return <Fragment key={at}>{token.tokens ? inline(token.tokens, at) : token.text}</Fragment>;
      // Images, raw HTML and anything newer read as their words.
      default: return <Fragment key={at}>{"text" in token ? token.text : token.raw}</Fragment>;
    }
  });
}

function blocks(tokens: Token[], key: string): ReactNode[] {
  return tokens.map((token, index) => {
    const at = `${key}.${index}`;
    switch (token.type) {
      case "space": return null;
      case "paragraph": return <p key={at}>{inline(token.tokens, at)}</p>;
      // Chat replies have no outline: a heading reads as a bold line.
      case "heading": return <p key={at}><strong>{inline(token.tokens, at)}</strong></p>;
      // A tight list item's words arrive as a block-level text token.
      case "text": return <Fragment key={at}>{token.tokens ? inline(token.tokens, at) : token.text}</Fragment>;
      case "list": {
        const list = token as Tokens.List;
        const items = list.items.map((item, step) => (
          <li key={step} data-task={item.task ? (item.checked ? "done" : "open") : undefined}>{blocks(item.tokens, `${at}.${step}`)}</li>
        ));
        return list.ordered ? <ol key={at} start={typeof list.start === "number" && list.start !== 1 ? list.start : undefined}>{items}</ol> : <ul key={at}>{items}</ul>;
      }
      case "table": {
        const table = token as Tokens.Table;
        const align = (column: number) => table.align[column] ?? undefined;
        return (
          <div key={at} className="rich-table">
            <table>
              <thead><tr>{table.header.map((cell, column) => <th key={column} style={{ textAlign: align(column) }}>{inline(cell.tokens, `${at}.h${column}`)}</th>)}</tr></thead>
              <tbody>{table.rows.map((row, line) => (
                <tr key={line}>{row.map((cell, column) => <td key={column} style={{ textAlign: align(column) }}>{inline(cell.tokens, `${at}.${line}.${column}`)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        );
      }
      case "blockquote": return <blockquote key={at}>{blocks(token.tokens ?? [], at)}</blockquote>;
      case "code": return <pre key={at}><code>{token.text}</code></pre>;
      case "hr": return <hr key={at} />;
      default: return <p key={at}>{"text" in token ? token.text : token.raw}</p>;
    }
  });
}

export default function RichText({ text }: { text: string }) {
  // Single line breaks stay, as in plain replies.
  const tokens = useMemo(() => lexer(text, { gfm: true, breaks: true }), [text]);
  return <div className="message-rich">{blocks(tokens, "m")}</div>;
}
