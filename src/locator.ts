/**
 * Pure locator logic for the milestone dock: the wire projection value → the
 * ruler's tick model, scrollport geometry → the active turn, and epoch ms →
 * relative-time copy.
 *
 * Dependency-free (only a type-only import of the fold vocabulary), so every
 * branch unit-tests in milliseconds without a dsh or browser runtime.
 *
 * @module dsh-milestone/locator
 */
import type { Milestone, MilestoneStatus } from './milestones.ts';

/** UI tick model for one milestone — exactly what the ruler renders. */
export interface TickModel {
    /** The conversation turn this tick represents. */
    turn: number;
    /** `running` between turn/start and turn/end; `closed` afterwards. */
    status: MilestoneStatus;
    /** First human message of the turn, summarized; absent until one arrives. */
    summary?: string;
    /** Display time: the first human message's time when present, else the turn start. */
    time: number;
    /** The `turn/end` reason kind; absent while running. */
    endReason?: string;
}

/**
 * Project the wire milestone array onto the dock's tick model. Defensive over
 * wire order (sorts ascending) and duplicates (same-turn: the first wins) —
 * the host view already guarantees both, the dock must not regress if the
 * view contract loosens.
 * @param value - the `useProjection('milestones')` value; undefined = capability absent.
 * @returns ticks in ascending turn order.
 */
export function deriveMilestones(value: readonly Milestone[] | undefined): TickModel[] {
    if (value === undefined) return [];
    const byTurn = new Map<number, TickModel>();
    for (const milestone of value) {
        if (byTurn.has(milestone.turn)) continue;
        byTurn.set(milestone.turn, {
            turn: milestone.turn,
            status: milestone.status,
            summary: milestone.summary,
            time: milestone.userTime ?? milestone.startTime,
            endReason: milestone.endReason,
        });
    }
    return [...byTurn.values()].sort((a, b) => a.turn - b.turn);
}

/** Measured scroll geometry of one turn's first rendered row. */
export interface TurnGeometry {
    /** The turn this geometry belongs to. */
    turn: number;
    /** Row top in scroll-content coordinates. */
    top: number;
    /** The row's extent bottom in the same coordinates (callers typically pass the next turn's top). */
    bottom: number;
}

/**
 * The turn whose flow owns the visible reading position: the turn with the
 * largest viewport-coverage overlap wins; ties go to the earlier turn; a
 * viewport entirely out of range clamps to the first (above) or last (below)
 * turn; a zero-height band inside a turn's span resolves to its containing
 * turn via the reading-edge fallback.
 * @param turns - measured geometry in ascending turn order.
 * @param viewportTop - visible band top in scroll-content coordinates.
 * @param viewportBottom - visible band bottom in the same coordinates.
 * @returns the active turn number, or null with no measurable turns.
 */
export function computeActiveTurn(
    turns: readonly TurnGeometry[],
    viewportTop: number,
    viewportBottom: number,
): number | null {
    if (turns.length === 0) return null;
    let best: number | null = null;
    let bestOverlap = 0;
    // Fallback = the last turn starting at/above the reading edge (the first
    // turn until one qualifies), which realizes the clamp behavior.
    let fallback = turns[0].turn;
    for (const g of turns) {
        const overlap = Math.min(g.bottom, viewportBottom) - Math.max(g.top, viewportTop);
        if (overlap > bestOverlap) {
            bestOverlap = overlap;
            best = g.turn;
        }
        if (g.top <= viewportTop) fallback = g.turn;
    }
    return best ?? fallback;
}

/** Dictionary key of one relative-time rendering. */
export type RelativeTimeKey = 'time.now' | 'time.minutes' | 'time.hours' | 'time.days' | 'time.date';

/**
 * Ticks on each side of the focus that READ as highlighted. The focus itself
 * ({@link EMPHASIS_FOCUS}) is the strongest tier; this radius is the
 * "slightly emphasized" neighbours around it; everything further out renders at
 * the NORMAL level.
 */
export const WINDOW_RADIUS = 1;
/** Visible ticks on each side of the focus (the viewport shows `2r + 1`). */
export const VISIBLE_RADIUS = 4;
/** Ticks the viewport shows at once. */
export const VISIBLE_TICKS = VISIBLE_RADIUS * 2 + 1;
/**
 * Extra ticks rendered beyond the visible band on each side. They are what the
 * strip travels THROUGH while sliding, so a step is a continuous glide instead
 * of an unmount/remount swap; the viewport's edge softening hides them.
 */
export const STRIP_OVERSCAN = 2;
/** Total ticks rendered in the strip. */
export const STRIP_TICKS = VISIBLE_TICKS + STRIP_OVERSCAN * 2;
/** Legacy alias kept for the visible-band width (the "5 or fewer" budget became
 * a 9-tick band; the name survives because tests and README cite it). */
export const WINDOW_TICKS = VISIBLE_TICKS;

/** Emphasis tier of one tick, by its distance from the focus. */
export const EMPHASIS_FOCUS = 0;
/** Tier of the focus's immediate neighbours. */
export const EMPHASIS_NEAR = 1;
/** Tier of everything beyond the neighbours — normal, still fully legible. */
export const EMPHASIS_NORMAL = 2;

/**
 * The emphasis tier for a tick `distance` steps from the focus. Pure so the CSS
 * contract (a `data-emphasis` value) and its tests share one definition: the
 * focus stands out, its neighbours are slightly emphasized, and nothing ever
 * drops below "normal" — a de-emphasis must not read as a missing row.
 * @param distance - absolute distance in ticks from the focus.
 * @returns the tier: {@link EMPHASIS_FOCUS} | {@link EMPHASIS_NEAR} | {@link EMPHASIS_NORMAL}.
 */
export function emphasisOf(distance: number): number {
    if (distance <= 0) return EMPHASIS_FOCUS;
    if (distance <= WINDOW_RADIUS) return EMPHASIS_NEAR;
    return EMPHASIS_NORMAL;
}

/**
 * The rail's sliding-strip model: a contiguous run of milestones plus the
 * index (within that run) of the focus tick.
 *
 * The dock renders `strip` as one translated column and positions the focus
 * tick at the rail's center, so a focus change becomes a smooth `transform`
 * transition. `offset` is what the dock multiplies by the per-tick step to get
 * that transform; `hasOlder`/`hasNewer` drive the edge cues.
 *
 * `offset` counts in TICKS, and the strip is sized so the focus can always sit
 * at the center: with fewer milestones than the strip, every tick is rendered
 * and the whole conversation simply centers.
 */
export interface TickStrip {
    /** The contiguous ticks to render, in ascending turn order. */
    strip: TickModel[];
    /** Index of the focus tick within `strip` (0 when the strip is empty). */
    focusIndex: number;
    /** True when milestones exist before the strip's first tick. */
    hasOlder: boolean;
    /** True when milestones exist after the strip's last tick. */
    hasNewer: boolean;
    /** True when nothing should render (no milestones). */
    empty: boolean;
}

/**
 * Resolve the focus tick's index in `ticks`: the active turn when it is
 * present, otherwise the newest milestone (a fresh session is pinned to the
 * bottom, and an active turn outside the loaded window has no better answer).
 * @param ticks - all milestones in ascending turn order.
 * @param activeTurn - the viewport's turn, or null before the first measure.
 * @returns the focus index, or -1 when there are no ticks.
 */
export function focusIndexOf(ticks: readonly TickModel[], activeTurn: number | null): number {
    if (ticks.length === 0) return -1;
    const found = activeTurn === null ? -1 : ticks.findIndex((tick) => tick.turn === activeTurn);
    return found < 0 ? ticks.length - 1 : found;
}

/**
 * Build the sliding strip around the reading position. The focus stays as
 * close to the strip's center as the conversation's ends allow, so that when
 * the reader scrolls the motion is a pure glide rather than an edge-anchored
 * jump; near either end the strip clamps and the focus index moves toward the
 * edge instead.
 *
 * Pure, so the dock only renders the result and every branch pins in tests.
 * @param ticks - all milestones in ascending turn order.
 * @param activeTurn - the viewport's turn, or null before the first measure.
 * @returns the strip plus the focus index and the hidden-beyond-each-edge flags.
 */
export function windowTicks(ticks: readonly TickModel[], activeTurn: number | null): TickStrip {
    const focus = focusIndexOf(ticks, activeTurn);
    if (focus < 0) return { strip: [], focusIndex: 0, hasOlder: false, hasNewer: false, empty: true };
    if (ticks.length <= STRIP_TICKS) {
        return { strip: [...ticks], focusIndex: focus, hasOlder: false, hasNewer: false, empty: false };
    }
    // Keep the focus centered where possible; clamp at both ends.
    const start = Math.max(0, Math.min(focus - Math.floor(STRIP_TICKS / 2), ticks.length - STRIP_TICKS));
    const end = start + STRIP_TICKS;
    return {
        strip: ticks.slice(start, end),
        focusIndex: focus - start,
        hasOlder: start > 0,
        hasNewer: end < ticks.length,
        empty: false,
    };
}

/** Vertical advance (height + gap) of one tick in the rail, px. */
export const TICK_ADVANCE = 20;
/** Tick mark height, px (the box the tick column advances by). */
export const TICK_HEIGHT = 14;
/**
 * Height of the rail's window onto the strip, px: exactly
 * {@link WINDOW_TICKS} rows, the last without a trailing gap.
 */
export const VIEWPORT_HEIGHT = WINDOW_TICKS * TICK_ADVANCE - (TICK_ADVANCE - TICK_HEIGHT);

/**
 * The strip's `translateY` that puts the focus tick's CENTER on the viewport's
 * center line.
 *
 * Derived from the geometry rather than from the strip's own middle: the
 * viewport is a fixed-height window, so what must be centered is the focus
 * tick within the WINDOW, and the strip's middle is only incidental. (Centering
 * the focus within the strip instead lands it near the viewport's edge whenever
 * the strip is taller than the window.)
 * @param focusIndex - the focus tick's index within the strip.
 * @returns the translation in px; the caller applies `translateY(-shift)`.
 */
export function stripShift(focusIndex: number): number {
    const focusCenter = focusIndex * TICK_ADVANCE + TICK_HEIGHT / 2;
    return focusCenter - VIEWPORT_HEIGHT / 2;
}

/** A relative-time rendering: a dictionary key plus its template params. */
export interface RelativeTimeText {
    key: RelativeTimeKey;
    params?: Record<string, string | number>;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** Beyond this age the relative form stops being useful; an absolute date renders instead. */
const ABSOLUTE_AFTER_DAYS = 30;

/**
 * Human "time ago" for a milestone tick: now / N minutes / N hours / N days,
 * then an absolute `Y/M/D` date beyond 30 days. Pure — `nowMs` is injected so
 * tests pin every branch; future times clamp to "just now".
 * @param timeMs - the milestone display time (epoch ms).
 * @param nowMs - the current time (epoch ms).
 * @returns dictionary key and params for the `t` seat.
 */
export function relativeTime(timeMs: number, nowMs: number): RelativeTimeText {
    const diff = Math.max(0, nowMs - timeMs);
    const minutes = Math.floor(diff / MINUTE_MS);
    if (minutes < 1) return { key: 'time.now' };
    if (minutes < 60) return { key: 'time.minutes', params: { n: minutes } };
    const hours = Math.floor(diff / HOUR_MS);
    if (hours < 24) return { key: 'time.hours', params: { n: hours } };
    const days = Math.floor(diff / DAY_MS);
    if (days <= ABSOLUTE_AFTER_DAYS) return { key: 'time.days', params: { n: days } };
    const date = new Date(timeMs);
    return {
        key: 'time.date',
        params: { date: `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}` },
    };
}
