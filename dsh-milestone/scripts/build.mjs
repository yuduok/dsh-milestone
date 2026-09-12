/**
 * Minimal client-bundle builder: esbuild → one CJS factory registered through
 * `window.__ModuleLoader__.load({ id, factory })` (the ModuleLoader CJS model —
 * lazy factory, all side effects inside the closure).
 *
 * tsdown cannot emit this wrapper shape, so the script postwraps the CJS
 * output in the exact registration form the shipped client bundles use:
 *
 *   window.__ModuleLoader__.load({ id: "dsh-milestone", factory: (require) => { …bundle… } })
 *
 * A `typeof window` guard keeps the artifact loadable under Node (smoke
 * tests) while staying byte-compatible in the browser, where the facade is
 * always installed before plugin bundles run.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(root, '..');
const entry = join(pkgRoot, 'src/client.tsx');
const outfile = join(pkgRoot, 'lib/client.js');

const EXTERNALS = [
    'react',
    'react/jsx-runtime',
    // The rail portals into the frame's overlay layer, so react-dom becomes a
    // real runtime require. It is a platform seed word (the shell's module
    // table provides it), alongside react/react-dom/client.
    'react-dom',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-runtime/client',
];

await build({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    outfile,
    external: EXTERNALS,
    legalComments: 'none',
    sourcemap: false,
    logLevel: 'info',
});

// Wrap the plain CJS module into the ModuleLoader factory registration. The
// CJS output assigns and reads `module.exports`, but the real
// ClientModuleLoader calls the factory with `(require)` ALONE — the browser
// scope has no `module` binding of its own, so the factory must declare it
// first (the exact shape the shipped bundles use: `var module = { exports: {} };`
// then `var exports = module.exports;`). Omitting this throws
// "ReferenceError: module is not defined" at materialization — and Node smoke
// tests cannot catch it, because Node's CJS wrapper supplies a global `module`.
const body = readFileSync(outfile, 'utf8');
const registration = [
    'typeof window !== "undefined" && window.__ModuleLoader__ && window.__ModuleLoader__.load({',
    '\tid: "dsh-milestone",',
    '\tfactory: (require) => {',
    '\t\tvar module = { exports: {} };',
    '\t\tvar exports = module.exports;',
    body
        .split('\n')
        .map((line) => (line.length > 0 ? `\t\t${line}` : line))
        .join('\n'),
    '\t\treturn module.exports;',
    '\t}',
    '});',
    '',
].join('\n');

// Header comment (kept out of the wrapped body above so the CJS stays pristine).
const header = [
    '/*! dsh-milestone client bundle — window.__ModuleLoader__.load({id, factory}) CJS factory */',
    '/* eslint-disable */',
    '',
].join('\n');
mkdirSync(dirname(outfile), { recursive: true });
writeFileSync(outfile, header + registration);

// The bundle requires only what the source imports at runtime; type-only
// imports (cordis, client-runtime, ui-slots) vanish at compile time, so the
// externals check counts the requires that actually remain.
const present = EXTERNALS.filter((spec) => body.includes(`require("${spec}")`));
console.log(
    `dsh-milestone: built lib/client.js (${(header.length + registration.length) / 1024 | 0} KiB);` +
    ` runtime externals required: ${present.length > 0 ? present.join(', ') : 'none (pure output)'}` +
    `; declared external: ${EXTERNALS.join(', ')}`,
);
