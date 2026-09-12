/**
 * Bundle verification for the client half — the checks a Node smoke test CANNOT
 * make:
 *
 *  1. Materialization in a CLEAN context. The real ClientModuleLoader calls the
 *     factory as `factory(require)` with a single argument, and the browser
 *     scope has no `module` binding — so a factory body that reads
 *     `module.exports` without declaring it dies at materialization with
 *     "ReferenceError: module is not defined". Node supplies a global `module`,
 *     so `require('./lib/client.js')` passes while the browser fails. Hence the
 *     vm sandbox below, which installs only `window.__ModuleLoader__` plus the
 *     builtins a browser really has.
 *
 *  2. `apply(ctx)` actually running against a stub of the client context. This
 *     exercises the plugin body (slot registration, locale dictionaries, CSS
 *     injection) instead of merely asserting that exports exist.
 *
 *  3. The injected stylesheet carrying RESOLVED geometry. dock.css.ts
 *     interpolates locator.ts constants into a template literal, and reading the
 *     bundle's SOURCE shows the unevaluated `${...}` form — so only the
 *     evaluated string proves the CSS and the JS transform agree.
 *
 * Run after `npm run build`:  node scripts/verify-bundle.mjs
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const bundlePath = process.argv[2] ?? './lib/client.js';
const src = readFileSync(bundlePath, 'utf8');

/** Registrations made through `window.__ModuleLoader__.load`. */
const registrations = [];
/** Stylesheet text captured from `document.head.appendChild`. */
const injectedStyles = [];

const sandbox = {
    // The ONLY platform surface a plugin bundle may assume.
    window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } },
    // JS builtins a browser provides. Deliberately absent: module, exports,
    // require, process, Buffer, __dirname — their presence would mask the bug.
    Symbol, Object, JSON, Math, Date, Array, Map, Set, WeakMap, WeakSet, Number,
    String, Boolean, Error, TypeError, RangeError, ReferenceError, Promise, RegExp,
    console,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    document: {
        querySelector: () => null,
        createElement: () => ({ dataset: {}, textContent: '', appendChild() {} }),
        head: { appendChild: (el) => injectedStyles.push(el.textContent) },
    },
};
sandbox.globalThis = sandbox;

new vm.Script(src, { filename: bundlePath }).runInContext(vm.createContext(sandbox));

if (registrations.length !== 1) {
    throw new Error(`expected exactly 1 __ModuleLoader__ registration, got ${registrations.length}`);
}
const registration = registrations[0];
if (registration.id !== 'dsh-milestone') {
    throw new Error(`registration id must be the package name, got "${registration.id}"`);
}

/**
 * The platform seed table (recovered from the shell's frontend dist). A bundle
 * may only `require` these names or packages declared in `dsh.client.inject`;
 * anything else throws "missed the module table" in the browser.
 */
const SEED = {
    react: {
        createElement: () => ({}), Fragment: {},
        useCallback: (fn) => fn, useEffect: () => {}, useMemo: (fn) => fn(),
        useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}],
        memo: (component) => component,
    },
    'react/jsx-runtime': { jsx: () => ({}), jsxs: () => ({}), Fragment: {} },
    'react-dom': { createPortal: () => ({}) },
    'react-dom/client': {},
    '@deepseek-ai/cordis': {},
    '@deepseek-ai/dsh-client-ui-slots': {},
    '@deepseek-ai/dsh-client-ui-primitives': {},
};

// Materialize exactly like ClientModuleLoader: factory(require), one argument.
const exports = registration.factory((spec) => {
    if (!(spec in SEED)) throw new Error(`require("${spec}") missed the module table`);
    return SEED[spec];
});

for (const name of ['apply', 'inject', 'MilestoneRuler', 'NS', 'ANCHOR_SLOT']) {
    if (!(name in exports)) throw new Error(`missing export: ${name}`);
}
if (typeof exports.apply !== 'function') throw new Error('apply must be a function');

// Exercise the plugin body: slot registration, locale dictionary, CSS injection.
const injectedSlots = [];
const bodyRegistrations = [];
const effects = [];
exports.apply({
    slots: {
        inject(key, callback) { injectedSlots.push(key); callback(); return () => {}; },
        register(spec, component) { bodyRegistrations.push({ spec, component }); return () => {}; },
    },
    effect(fn, label) { effects.push(label); fn(); return () => {}; },
    locale: { register(namespace, dictionaries) { bodyRegistrations.push({ namespace, dictionaries }); return () => {}; } },
});

const entry = bodyRegistrations.find((r) => r.spec !== undefined);
if (entry === undefined) throw new Error('apply() registered no slot entry');
if (entry.spec.name !== exports.ANCHOR_SLOT) throw new Error('entry registered into the wrong slot');
if (typeof entry.component !== 'function') throw new Error('entry component must be a function');

const dictionary = bodyRegistrations.find((r) => r.namespace === exports.NS);
if (dictionary === undefined) throw new Error('apply() registered no locale dictionary');
const zhKeys = Object.keys(dictionary.dictionaries.zh).sort();
const enKeys = Object.keys(dictionary.dictionaries.en).sort();
if (zhKeys.join() !== enKeys.join()) throw new Error('zh/en dictionary keys differ');

// The injected CSS must carry fully resolved geometry.
const css = injectedStyles.join('\n');
if (css.length === 0) throw new Error('apply() injected no stylesheet');
const unresolved = css.match(/\$\{[^}]*\}/g);
if (unresolved !== null) throw new Error(`unresolved template placeholders in CSS: ${unresolved.join(', ')}`);
const viewport = /\.dms-viewport\{[^}]*height:(\d+)px/.exec(css);
const tickBox = /\.dms-tick\{[^}]*height:(\d+)px;margin:0 0 (\d+)px/.exec(css);
if (viewport === null || tickBox === null) throw new Error('CSS geometry not found in the injected stylesheet');

console.log(`bundle:          ${bundlePath}`);
console.log(`registration id: ${registration.id}`);
console.log(`exports:         ${Object.keys(exports).sort().join(', ')}`);
console.log(`injected slot:   ${injectedSlots.join(', ')}`);
console.log(`entry:           ${JSON.stringify(entry.spec)}`);
console.log(`effects:         ${effects.join(', ')}`);
console.log(`locale keys:     zh=${zhKeys.length} en=${enKeys.length}`);
console.log(`viewport height: ${viewport[1]}px`);
console.log(`tick height/gap: ${tickBox[1]}px / ${tickBox[2]}px`);
console.log('VERIFY OK — materialized and applied in a clean browser-like context');
