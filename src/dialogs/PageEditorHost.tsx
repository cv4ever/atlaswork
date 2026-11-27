// Customize: the page editor over the page on screen (Widgets.tsx's PageEditor), saving through the actions.
import { useApp, useView } from "../appContext.ts";
import { todayCards } from "../session.ts";
import type { TodayCard } from "../session.ts";
import { PageEditor } from "../dataBlocks/PageEditor.tsx";

export function PageEditorHost() {
  const { actions } = useApp();
  const page = useView((view) => view.screen.page);
  const pinnable = useView((view) => view.screen.pinnable);
  const today = useView((view) => view.today);
  const hidden = useView((view) => view.session.todayHidden);
  // Today's own cards are switches; the plate always shows, and their order is the day's (docs/page-design.md, "Today").
  const cards = !page.place && (
    <div className="today-card-switches" role="group" aria-label="Today's cards">
      <h3 className="page-editor-title">Today's cards</h3>
      {(Object.entries(todayCards) as [TodayCard, (typeof todayCards)[TodayCard]][]).map(([card, { label, hint }]) => (
        <label key={card} className="switch-row">
          <input type="checkbox" role="switch" checked={!hidden.includes(card)}
            onChange={(event) => void actions.updateSession({
              todayHidden: event.target.checked ? hidden.filter((item) => item !== card) : [...hidden, card] })} />
          <span className="switch" aria-hidden="true" />
          <span><strong>{label}</strong><small>{hint}</small></span>
        </label>
      ))}
    </div>
  );
  return <PageEditor name={page.name} blocks={page.blocks} today={today} custom={page.custom} todayPage={!page.place} cards={cards || undefined}
    notes={pinnable} onArrange={actions.arrangePage} onReset={actions.resetPage} onPurge={actions.purgeBlock} onClose={actions.closeModal} />;
}
