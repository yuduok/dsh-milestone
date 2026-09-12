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

/** Milestones shown at once: the active turn plus this many on each side. */
export const WINDOW_RADIUS = 2;
/** Total ticks in the sliding window (2 * {@link WINDOW_RADIUS} + 1). */
export const WINDOW_TICKS = WINDOW_RADIUS * 2 + 1;

/** The sliding tick window plus whether milestones are hidden beyond each edge. */
export interface TickWindow {
    /** The ticks to render, in ascending turn order. */
    visible: TickModel[];
    /** True when milestones exist before the window's first tick. */
    hasOlder: boolean;
    /** True when milestones exist after the window's last tick. */
    hasNewer: boolean;
}

/**
 * The sliding window around the reading position: the active tick plus
 * {@link WINDOW_RADIUS} neighbours on each side, clamped at either end of the
 * conversation. With no active turn yet — or one outside the loaded ticks —
 * the window anchors on the newest milestone.
 *
 * Pure, so the dock only renders the result and every branch pins in tests.
 * @param ticks - all milestones in ascending turn order.
 * @param activeTurn - the viewport's turn, or null before the first measure.
 * @returns the visible slice plus the hidden-beyond-each-edge flags.
 */
export function windowTicks(ticks: readonly TickModel[], activeTurn: number | null): TickWindow {
    if (ticks.length <= WINDOW_TICKS) return { visible: [...ticks], hasOlder: false, hasNewer: false };
    const found = activeTurn === null ? -1 : ticks.findIndex((tick) => tick.turn === activeTurn);
    const anchor = found < 0 ? ticks.length - 1 : found;
    const start = Math.max(0, Math.min(anchor - WINDOW_RADIUS, ticks.length - WINDOW_TICKS));
    const end = Math.min(ticks.length, start + WINDOW_TICKS);
    return { visible: ticks.slice(start, end), hasOlder: start > 0, hasNewer: end < ticks.length };
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
