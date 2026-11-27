// Shows a part's hover, keyboard-focus and pressed looks side by side (Parts.tsx), from the app's own rules: every
// rule that names :hover, :focus-visible, :focus-within or :active is copied with that pseudo-class swapped for a `data-force`
// attribute, so `<button data-force="hover">` draws exactly what the pointer would. Nothing is restated here, so a
// changed hover in src/styles/ changes the showcase and its screenshot regression with it.

const pseudo = /:(hover|focus-visible|focus-within|active)\b/g;

/** A selector list split at its top-level commas (those inside :is(), :not() and the like stay). */
function selectors(list: string) {
  const out = [""];
  let depth = 0;
  for (const char of list) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && !depth) out.push("");
    else out[out.length - 1] += char;
  }
  return out.map((selector) => selector.trim());
}

function forced(rules: CSSRuleList): string {
  let css = "";
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      // Only the selectors that name a state: copying the others would replay their declarations later in the cascade.
      const named = selectors(rule.selectorText).filter((selector) => selector.search(pseudo) >= 0);
      if (named.length) css += `${named.map((selector) => selector.replace(pseudo, '[data-force~="$1"]')).join(", ")} { ${rule.style.cssText} }\n`;
    } else if (rule instanceof CSSGroupingRule) {
      const inner = forced(rule.cssRules);
      // The at-rule's own prelude (@media, @container, @supports, @layer), whatever it is.
      if (inner) css += `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{\n${inner}}\n`;
    }
  }
  return css;
}

/** Adds the copied rules after every other sheet; returns what removes them. Call once the app's sheets are in. */
export function forceStates() {
  const style = document.createElement("style");
  style.dataset.forcedStates = "";
  let css = "";
  for (const sheet of document.styleSheets) {
    try { css += forced(sheet.cssRules); } catch { /* another origin's sheet */ }
  }
  style.textContent = css;
  document.head.append(style);
  return () => style.remove();
}
