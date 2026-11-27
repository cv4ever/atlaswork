// Every widget in every view, drawn by PageGrid and DataBlock. Three samples: the demo workspace, an empty one (what
// a new person gets, and each data widget before its first entry), and an overflowing one (the demo plus a year of
// records, and each data widget with long titles and more values than fit). Four widths: the page grid's own.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp, useView } from "../../src/appContext.ts";
import { blockWidths, keepsData, widgetKinds } from "../../src/blocks.ts";
import { addDays } from "../../src/dates.ts";
import type { Block, BlockWidth, Widget } from "../../src/blocks.ts";
import { domainHueName } from "../../src/model.ts";
import PageGrid from "../../src/PageGrid.tsx";
import { DataBlock } from "../../src/Widgets.tsx";
import { widgetIcons } from "../../src/dataBlocks/parts.tsx";
import { Section, Segments } from "./frame.tsx";
import { Workspace } from "./workspace.tsx";
import type { Seed } from "./workspace.tsx";

const fills = { demo: "Demo", empty: "Empty", full: "Overflowing" } as const;
type Fill = keyof typeof fills;
const seedOf: Record<Fill, Seed> = { demo: "demo", empty: "new", full: "large" };
type Width = "columns" | BlockWidth;
const kinds = Object.keys(widgetKinds) as Widget[];

/** Values a data block holds; the sample shown for a kind is the workspace's block holding the most. */
const held = (block: Block) => (block.entries?.length ?? 0) + (block.days?.length ?? 0) + (block.items?.length ?? 0) + (block.steps?.length ?? 0)
  + (block.date ? 1 : 0) + (block.current ? 1 : 0) + (block.noteId ? 1 : 0);

const long = "Renew the passport before the summer trip, with new photographs and the consulate appointment";
/** A data block pushed past what fits: a title that has to wrap or cut, large numbers, and more values than a card shows. */
function stressed(block: Block, today: string): Block {
  const list = <T,>(length: number, item: (index: number) => T) => Array.from({ length }, (_, index) => item(index));
  switch (block.type) {
    case "countdown": return { ...block, title: long, since: addDays(today, -300), date: addDays(today, 465) };
    case "tracker": return { ...block, title: long, unit: "kilometres", target: 12500, entries: list(90, (index) => ({ date: addDays(today, index - 89), value: 9800 + ((index * 37) % 23) * 113 })) };
    case "habit": return { ...block, title: long, days: list(120, (index) => addDays(today, -index)) };
    case "goal": return { ...block, title: long, target: 1250000, current: 1312480 };
    case "checklist": return { ...block, title: long, items: list(24, (index) => ({ text: index % 3 ? `Thing ${index + 1}` : `${long} (${index + 1})`, done: index % 4 === 0 })) };
    case "milestones": return { ...block, title: long, steps: list(14, (index) => ({ title: index % 3 ? `Step ${index + 1}` : long, date: addDays(today, index * 23 - 60), done: index < 3 })) };
    default: return { ...block, title: long };
  }
}

/** `current` is the kind scrolled to (Showcase.tsx), marked in the strip of kinds. */
export default function WidgetGallery({ current }: { current: string }) {
  const domain = useView((view) => view.session.domain);
  const [fill, setFill] = useState<Fill>("demo");
  const [width, setWidth] = useState<Width>("columns");
  const views = <Views key={fill} fill={fill} width={width} follow={domain} />;
  return (
    <Section id="widgets" title="Widgets" shot={false} lede={<>Every widget in every view; the first is each kind&apos;s default. Tasks, projects and resources read the {domain} domain&apos;s records; the others show the workspace&apos;s fullest sample of their kind. Empty is what a new person sees, Overflowing is a year of records, long titles and more values than fit.</>}>
      <div className="ds-kinds">
        <nav aria-label="Widget kinds">{kinds.map((kind) => <a key={kind} href={`#widget-${kind}`} aria-current={current === `widget-${kind}` || undefined}>{widgetKinds[kind].label}</a>)}</nav>
        <Segments label="Sample" value={fill} options={fills} onChange={setFill} />
        <Segments label="Width" value={width} options={{ columns: "Three up", ...blockWidths }} onChange={setWidth} />
      </div>
      {fill === "demo" ? views : <Workspace key={fill} seed={seedOf[fill]}>{views}</Workspace>}
    </Section>
  );
}

/** Drawn inside the sample's own workspace, which follows the toolbar's domain when it has one by that name. */
function Views({ fill, width, follow }: { fill: Fill; width: Width; follow: string }) {
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const today = useView((view) => view.today);
  const domain = useView((view) => view.domains.find((item) => item.name === view.session.domain));
  useEffect(() => {
    if (domain?.name !== follow && data.domains.some((item) => item.name === follow)) actions.switchDomain(follow);
  }, [actions, data.domains, domain?.name, follow]);
  const samples = useMemo(() => {
    const blocks = [...data.domains.flatMap((item) => item.widgets ?? []), ...data.projects.flatMap((item) => item.widgets ?? [])];
    return Object.fromEntries(kinds.map((kind) => {
      const sample = blocks.filter((block) => block.type === kind).sort((a, b) => held(b) - held(a))[0] ?? { id: `showcase-${kind}`, type: kind };
      return [kind, fill === "full" && keepsData(sample) ? stressed(sample, today) : sample];
    })) as Record<Widget, Block>;
  }, [data, fill, today]);
  // Edits stay on this page: a tick, a log or a contribution changes the sample here, never its workspace.
  const [edited, setEdited] = useState<Record<string, Block>>({});
  const span = width === "columns" ? "full" : width;
  return kinds.map((kind) => {
    const Icon = widgetIcons[kind];
    return (
      <div key={kind} id={`widget-${kind}`} className="ds-kind" data-shot={`widget-${kind}`}>
        <h3 className="ds-kind-title"><Icon size={16} />{widgetKinds[kind].label}<small>{widgetKinds[kind].hint}</small></h3>
        <div className="ds-views" data-width={width === "columns" ? undefined : width}>
          {Object.entries(widgetKinds[kind].views).map(([view, { label, hint }], index) => {
            const id = `showcase-${kind}-${view}`;
            const block: Block = keepsData(samples[kind]) ? { ...samples[kind], ...edited[id], id, view, width: span } : { id, type: kind, view, width: span };
            return (
              <figure key={view} className="ds-view">
                <figcaption><strong>{label}</strong> {hint}{index === 0 && <em>default</em>}</figcaption>
                {keepsData(block)
                  ? <div className="page-grid" data-hue={domainHueName(domain?.hue)} style={{ "--hue": domain?.hue } as CSSProperties}><div className={`page-block width-${span}`}>
                      <DataBlock block={block} today={today} notes={data.notes} onChange={(next) => setEdited((all) => ({ ...all, [id]: next }))}
                        onOpenNote={() => undefined} onEditNote={(note, body) => actions.changeNote(note, { body })} />
                    </div></div>
                  : <PageGrid blocks={[block]} domain={domain} />}
              </figure>
            );
          })}
        </div>
      </div>
    );
  });
}
