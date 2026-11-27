// `morph()`: a layout change run as a view transition, so the Atlas button and the chat panel morph into each other.
// Atlas snapshots animate transforms, not per-frame width and height. Shared by the shell, the actions and onboarding.
import { flushSync } from "react-dom";

/** Runs a layout change as a view transition so the Atlas button and chat panel morph into each other. */
export function morph(update: () => void) {
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return update();
  const transition = document.startViewTransition({ update: () => flushSync(update) });
  transition.ready.then(() => {
    for (const animation of document.getAnimations()) {
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect) || effect.pseudoElement !== "::view-transition-group(atlas)") continue;
      const frames = effect.getKeyframes();
      const last = frames.at(-1);
      const width = Number.parseFloat(String(last?.width));
      const height = Number.parseFloat(String(last?.height));
      if (!width || !height) continue;
      // Native group keyframes animate width/height. Scale the snapshots instead, without per-frame layout.
      effect.setKeyframes(frames.map((frame) => ({
        offset: frame.offset,
        easing: frame.easing,
        transform: `${frame.transform} scale(${Number.parseFloat(String(frame.width)) / width}, ${Number.parseFloat(String(frame.height)) / height})`,
      })));
    }
  }, () => { /* A superseding transition can skip snapshot creation. */ });
}
