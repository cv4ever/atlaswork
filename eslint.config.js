// Accessibility checks on the JSX only; types come from `tsc`, style from review. Three boundary rules: product code
// never imports the dev-only engines (dev/chatgpt, dev/echo); only src/main.tsx loads them, in dev builds. No import
// cycles: `session.ts` calls `place.ts` while it loads, so a cycle back through it can crash startup by load order. And
// logic never imports drawing: a `.ts` module may not import a `.tsx` one, so state, rules and the View stay testable
// in node and a component's file holds only what it draws (types it shares live in `ui.ts`, `view.ts` or the logic).
// One language rule: dates, times and numbers format with `locale` from dates.ts, never the browser's language. One
// tooltip rule: controls get their words from <Tip>, not `title` (ADR 0003).
// React Compiler builds the app (vite.config.ts), so the Rules of React are errors: what it can't prove pure, it caches.
import { createNodeResolver, importX } from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const a11y = jsxA11y.flatConfigs.recommended;
// A `title` on any HTML element around a Tip or Picker shows the browser's tooltip over theirs. A component's `title`
// prop (Dialog's heading) is its own.
const noTitleAroundTip = {
  meta: { type: "problem", schema: [] },
  create: (context) => ({
    "JSXOpeningElement[name.name=/^(Tip|Picker)$/]"(node) {
      for (let element = node.parent.parent; element; element = element.parent) {
        const title = element.type === "JSXElement" && /^[a-z]/.test(element.openingElement.name.name ?? "") && element.openingElement.attributes.find((attr) => attr.name?.name === "title");
        if (title) return context.report({ node: title, message: "A title around a Tip or Picker shows its native tooltip over theirs (ADR 0003); put the title on a text element beside it." });
      }
    },
  }),
};
export default [{
  ...a11y,
  files: ["src/**/*.tsx", "dev/**/*.tsx"],
  languageOptions: { ...a11y.languageOptions, parser: tseslint.parser },
  rules: {
    ...a11y.rules,
    // Settings rows nest their label text in <div><strong>; Field (src/Widgets.tsx) renders an <input>.
    "jsx-a11y/label-has-associated-control": ["error", { depth: 3, controlComponents: ["Field"] }],
    // A focusable separator is the ARIA window-splitter pattern (the resize handles).
    "jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["tabpanel", "separator"] }],
  },
}, {
  files: ["src/**/*.ts", "src/**/*.tsx"],
  ignores: ["src/main.tsx"],
  languageOptions: { parser: tseslint.parser },
  plugins: { "import-x": importX, local: { rules: { "no-title-around-tip": noTitleAroundTip } } },
  settings: {
    "import-x/parsers": { "@typescript-eslint/parser": [".ts", ".tsx"] },
    "import-x/resolver-next": [createNodeResolver({ extensions: [".ts", ".tsx", ".js"] })],
  },
  rules: {
    "no-restricted-imports": ["error", { patterns: [{ group: ["**/dev/**"], message: "Dev-only code: only src/main.tsx may load dev/, behind import.meta.env.DEV." }] }],
    "import-x/no-cycle": "error",
    "import-x/no-restricted-paths": ["error", { zones: [{
      target: "./src/**/*.ts", from: "./src/**/*.tsx",
      message: "Logic never imports drawing: move what this module needs out of the component (ui.ts, view.ts or a logic module).",
    }] }],
    "no-restricted-syntax": ["error", ...[
      "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/][arguments.length=0]",
      "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/][arguments.0.type='Identifier'][arguments.0.name='undefined']",
      "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/][arguments.0.type='ArrayExpression']",
      "NewExpression[callee.object.name='Intl'][arguments.length=0]",
      "NewExpression[callee.object.name='Intl'][arguments.0.type='Identifier'][arguments.0.name='undefined']",
      "NewExpression[callee.object.name='Intl'][arguments.0.type='ArrayExpression']",
    ].map((selector) => ({ selector, message: "Format with `locale` from dates.ts: the app is English, whatever the browser's language." })), {
      selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/][arguments.length>1]",
      message: "Use formatDate or formatNumber from dates.ts: toLocale…String with options builds a new formatter on every call.",
    }, {
      selector: "JSXOpeningElement[name.name=/^(button|label)$/] > JSXAttribute[name.name='title']",
      message: "Wrap the control in <Tip label=…> from Popups.tsx instead (ADR 0003): title shows late, unstyled and never on focus.",
    }],
    "local/no-title-around-tip": "error",
  },
}, {
  // Every relative import names its file, extension included (`./model.ts`, `./Dialog.tsx`), as node's test runner
  // and the Deno function need: an import that only Vite and tsc can resolve breaks the moment a module moves into code
  // those run. Dynamic `import()` isn't checked here; write it the same way.
  files: ["src/**/*.ts", "src/**/*.tsx", "dev/**/*.ts", "dev/**/*.tsx"],
  languageOptions: { parser: tseslint.parser },
  plugins: { "import-x": importX },
  settings: {
    "import-x/parsers": { "@typescript-eslint/parser": [".ts", ".tsx"] },
    "import-x/resolver-next": [createNodeResolver({ extensions: [".ts", ".tsx", ".js"] })],
  },
  rules: { "import-x/extensions": ["error", "always", { ignorePackages: true }] },
}, {
  files: ["src/**/*.tsx", "src/**/*.ts"],
  languageOptions: { parser: tseslint.parser },
  plugins: { "react-hooks": reactHooks },
  rules: { ...reactHooks.configs["recommended-latest"].rules },
}, {
  // Size and width budgets (2026-11-21), so a module stays readable in one sitting and a diff names one change: a file
  // up to 600 lines and a function up to 150 (blank lines and comments not counted), a code line up to 160 characters
  // (strings, comments and URLs may run longer). Every file fits them, with no exceptions. When a part outgrows them,
  // split it the way src/shell/, src/chat/ and src/room/ did, rather than raising a number or excusing a file.
  files: ["src/**/*.ts", "src/**/*.tsx"],
  ignores: ["src/**/*.test.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: {
    "max-lines": ["error", { max: 600, skipBlankLines: true, skipComments: true }],
    "max-lines-per-function": ["error", { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true }],
    "max-len": ["error", { code: 160, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreComments: true, ignoreUrls: true, ignoreRegExpLiterals: true }],
  },
}];
