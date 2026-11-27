// The showcase's clock (agents-design D57). With `?today=YYYY-MM-DD`, the page's whole clock runs from noon that day:
// `Date.now()` and `new Date()` move by the same offset and keep ticking, so the demo seed's dates, the View's minute
// clock and every date-driven widget agree on one day whatever the computer's date, and the screenshot regression
// (scripts/check-visual.mjs) draws the same pixels every day. Imported first by main.tsx, before anything reads the clock.
const pinned = new URLSearchParams(location.search).get("today");

if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) {
  const Real = Date;
  const offset = new Real(`${pinned}T12:00:00`).getTime() - Real.now();
  class PinnedDate extends Real {
    constructor(...args: unknown[]) {
      if (args.length) super(...(args as [string]));
      else super(Real.now() + offset);
    }
    static now() { return Real.now() + offset; }
  }
  globalThis.Date = PinnedDate as DateConstructor;
}

export {};
