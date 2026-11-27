// When the helper may stop so its app can update (agents-design D85): the app asks on stdin (`{"finish":true}`), and
// the helper stops at once while it holds nothing, else as soon as the work it holds ends, taking no new work meanwhile.
// Work is everything between asking for work and the next wait: a claimed job, a tidy, another computer's search.

export type Finish = {
  /** The app asked: true when the helper may stop now. */
  ask(): boolean;
  /** Work starts: false when the app asked first, so none should start. */
  begin(): boolean;
  /** Work ended: true when the app asked meanwhile, so the helper stops now. */
  end(): boolean;
};

export function finishing(): Finish {
  let asked = false, busy = false;
  return {
    ask() {
      asked = true;
      return !busy;
    },
    begin() {
      busy = !asked;
      return busy;
    },
    end() {
      busy = false;
      return asked;
    },
  };
}
