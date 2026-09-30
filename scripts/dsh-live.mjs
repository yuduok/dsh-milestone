/**
 * Point a plugin project's dev-time `@deepseek-ai/*` resolution at a *live*
 * dsh installation instead of the npm-published baseline.
 *
 * Why: dsh ships its internal packages inside the app bundle / global npm
 * checkout and does NOT publish every rc to npm. 2026-09 reality: the running
 * harness was `0.2.0-rc.2` while npm's newest `@deepseek-ai/dsh-client-*` was
 * `0.1.1-rc.2`. Typing against the npm baseline proves nothing about the
 * version the plugin actually runs on.
 *
 * `link` replaces `node_modules/@deepseek-ai/<pkg>` with symlinks to the live
 * checkout. Real symlinks (not tsconfig `paths`) are deliberate: they keep the
 * packages' `exports` maps in play, so subpath type faces such as
 * `@deepseek-ai/dsh-session-projection/types` resolve to the SAME module symbol
 * as the package root. A `paths` wildcard resolves those subpaths to a
 * different file, which silently breaks declaration merging — the projection
 * key augmentation lands on another copy of the interface and collapses to
 * `never` (and any subpath the new version dropped falls back to the OLD
 * installed copy, contaminating the whole check).
 *
 * Restore the npm baseline with plain `npm install`.
 *
 * Usage:
 *   node dsh-live.mjs status [projectRoot]   # report live vs installed versions
 *   node dsh-live.mjs link   [projectRoot]   # symlink every live @deepseek-ai package
 *
 * Env overrides: DSH_LIVE_DIR (dir that directly contains the @deepseek-ai
 * packages), DSH_LIVE_ROOT (the dsh package owning them, for version reporting).
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const command = process.argv[2] ?? 'status';
const projectRoot = resolve(process.argv[3] ?? process.cwd());
const NM = join(projectRoot, 'node_modules', '@deepseek-ai');

/** Read a package.json version, or null. */
function versionOf(dir) {
    const file = join(dir, 'package.json');
    if (!existsSync(file)) return null;
    try {
        return JSON.parse(readFileSync(file, 'utf8')).version ?? null;
    } catch {
        return null;
    }
}

/** Every `@deepseek-ai/*` package directory in a live set. */
function livePackages(live) {
    return readdirSync(live, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name)
        .filter((name) => versionOf(join(live, name)) !== null);
}

/**
 * Candidate live package sets, most specific first: an explicit override, then
 * the global npm checkout that owns the `dsh` launcher. (The desktop app keeps
 * its copy inside `app.asar`; point DSH_LIVE_DIR at an extraction of that.)
 */
function candidates() {
    const globalRoot = join(dirname(process.execPath), '..', 'lib', 'node_modules');
    const dshRoot = join(globalRoot, '@deepseek-ai', 'dsh');
    const out = [];
    if (process.env.DSH_LIVE_DIR) {
        const dir = resolve(process.env.DSH_LIVE_DIR);
        out.push({ dir, dshRoot: process.env.DSH_LIVE_ROOT ? resolve(process.env.DSH_LIVE_ROOT) : dir });
    }
    out.push({ dir: join(dshRoot, 'node_modules', '@deepseek-ai'), dshRoot });
    return out;
}

/** The first candidate that actually holds a live package set. */
function findLive() {
    for (const candidate of candidates()) {
        if (!existsSync(candidate.dir)) continue;
        if (livePackages(candidate.dir).length === 0) continue;
        return candidate;
    }
    return null;
}

function status() {
    const live = findLive();
    if (live === null) {
        console.log('live dsh: NOT FOUND (set DSH_LIVE_DIR to its @deepseek-ai directory)');
        return 1;
    }
    const versions = [...new Set(livePackages(live.dir).map((name) => versionOf(join(live.dir, name))))].sort();
    console.log(`live dsh packages: ${live.dir} (dsh ${versionOf(live.dshRoot) ?? '?'})`);
    console.log(`live versions present: ${versions.join(', ')}`);
    for (const name of ['dsh-client-runtime', 'dsh-api-session-controller', 'dsh-client-ui-chat', 'dsh-client-ui-renderer', 'dsh-session-projection']) {
        const installed = join(NM, name);
        const kind = !existsSync(installed)
            ? 'absent'
            : lstatSync(installed).isSymbolicLink()
              ? 'symlink(live)'
              : `npm ${versionOf(installed) ?? '?'}`;
        console.log(`  ${name}: ${kind}; live ${versionOf(join(live.dir, name)) ?? '?'}`);
    }
    return 0;
}

function link() {
    const live = findLive();
    if (live === null) {
        console.error('dsh-live: no live dsh checkout found; keeping the npm-installed baseline.');
        return 1;
    }
    mkdirSync(NM, { recursive: true });
    let linked = 0;
    for (const name of livePackages(live.dir)) {
        const target = join(NM, name);
        if (existsSync(target)) rmSync(target, { recursive: true, force: true });
        symlinkSync(join(live.dir, name), target, 'dir');
        linked += 1;
    }
    console.log(`dsh-live: linked ${linked} packages into ${projectRoot} from ${live.dir} (dsh ${versionOf(live.dshRoot) ?? '?'})`);
    return 0;
}

process.exit(command === 'link' ? link() : status());
