/**
 * Unit spec for the locator pure functions (src/locator.ts): deriveMilestones
 * wire→tick projection, computeActiveTurn viewport→turn geometry, and
 * relativeTime copy selection. All branches, milliseconds, no runtime.
 *
 * @module tests/locator.spec
 */
import { describe, expect, it } from 'vitest';
import {
    computeActiveTurn,
    deriveMilestones,
    focusIndexOf,
    relativeTime,
    stripShift,
    windowTicks,
    STRIP_TICKS,
    TICK_ADVANCE,
    TICK_HEIGHT,
    VIEWPORT_HEIGHT,
    WINDOW_TICKS,
    type TickModel,
    type TurnGeometry,
} from '../src/locator.ts';
import type { Milestone } from '../src/milestones.ts';

/** Build one wire milestone with defaults. */
function milestone(overrides: Partial<Milestone>): Milestone {
    return {
        turn: 1,
        startTime: 1000,
        status: 'closed',
        ...overrides,
    };
}

/** Build one tick with defaults (test-side mirror of deriveMilestones output). */
function tick(overrides: Partial<TickModel>): TickModel {
    return {
        turn: 1,
        status: 'closed',
        time: 1000,
        ...overrides,
    };
}

/** Geometry: turns at 0, 100, 200, … each 100 tall (last one unbounded via its own bottom). */
function geometry(count: number, height = 100, start = 0): TurnGeometry[] {
    return Array.from({ length: count }, (_, i) => ({ turn: i + 1, top: start + i * height, bottom: start + (i + 1) * height }));
}

describe('deriveMilestones', () => {
    it('maps undefined (capability absent) to an empty list', () => {
        expect(deriveMilestones(undefined)).toEqual([]);
    });

    it('maps an empty array to an empty list', () => {
        expect(deriveMilestones([])).toEqual([]);
    });

    it('projects wire milestones onto the tick model in order', () => {
        const value = [
            milestone({ turn: 1, startTime: 100, status: 'running' }),
            milestone({ turn: 2, startTime: 200, summary: 'hello', userTime: 210, endReason: 'completed' }),
        ];
        expect(deriveMilestones(value)).toEqual([
            tick({ turn: 1, status: 'running', time: 100 }),
            tick({ turn: 2, time: 210, summary: 'hello', endReason: 'completed' }),
        ]);
    });

    it('sorts out-of-order wire values into ascending turns', () => {
        const value = [milestone({ turn: 3, startTime: 300 }), milestone({ turn: 1, startTime: 100 })];
        expect(deriveMilestones(value).map((t) => t.turn)).toEqual([1, 3]);
    });

    it('keeps the first occurrence of a duplicated turn', () => {
        const value = [
            milestone({ turn: 1, startTime: 100, summary: 'first' }),
            milestone({ turn: 1, startTime: 100, summary: 'second' }),
        ];
        expect(deriveMilestones(value)).toHaveLength(1);
        expect(deriveMilestones(value)[0].summary).toBe('first');
    });

    it('prefers userTime over startTime for the display time', () => {
        expect(deriveMilestones([milestone({ startTime: 100, userTime: 150 })])[0].time).toBe(150);
    });

    it('falls back to startTime when no user message arrived', () => {
        expect(deriveMilestones([milestone({ startTime: 100 })])[0].time).toBe(100);
    });
});

describe('computeActiveTurn', () => {
    it('returns null for empty geometry', () => {
        expect(computeActiveTurn([], 0, 100)).toBeNull();
    });

    it('picks the single turn covering the viewport', () => {
        expect(computeActiveTurn(geometry(1), 10, 90)).toBe(1);
    });

    it('picks the turn with the largest viewport coverage', () => {
        // Viewport spans 50–250: turn 1 covers 50–100 (50), turn 2 covers 100–200 (100), turn 3 covers 200–250 (50).
        expect(computeActiveTurn(geometry(3), 50, 250)).toBe(2);
    });

    it('breaks ties in favor of the earlier turn', () => {
        // Viewport 0–200 exactly spans turns 1 and 2 with equal coverage.
        expect(computeActiveTurn(geometry(3), 0, 200)).toBe(1);
    });

    it('clamps above the first turn', () => {
        expect(computeActiveTurn(geometry(3), -500, -400)).toBe(1);
    });

    it('clamps below the last turn', () => {
        expect(computeActiveTurn(geometry(3), 1000, 1200)).toBe(3);
    });

    it('keeps the containing turn for a zero-height viewport inside its span', () => {
        expect(computeActiveTurn(geometry(3), 150, 150)).toBe(2);
    });

    it('resolves a zero-height viewport in a gap between turns via the reading-edge fallback', () => {
        // 100 is the boundary: no positive overlap anywhere; fallback = last turn starting at/above 100.
        expect(computeActiveTurn(geometry(3), 100, 100)).toBe(2);
        expect(computeActiveTurn(geometry(3), 100.5, 100.5)).toBe(2);
        expect(computeActiveTurn(geometry(3), 99.5, 99.5)).toBe(1);
    });

    it('handles unsorted input without crashing (defensive parity with wire sort)', () => {
        const g = geometry(3).reverse();
        expect([1, 2, 3]).toContain(computeActiveTurn(g, 120, 180));
    });

    it('works with non-uniform geometry', () => {
        const g: TurnGeometry[] = [
            { turn: 1, top: 0, bottom: 30 },
            { turn: 2, top: 30, bottom: 130 },
            { turn: 3, top: 130, bottom: 140 },
        ];
        expect(computeActiveTurn(g, 0, 100)).toBe(2);
        expect(computeActiveTurn(g, 125, 145)).toBe(3); // turn 2 covers 125–130 (5), turn 3 covers 130–140 (10) — the taller one wins
    });

    it('gives the largest-overlap turn precedence over the reading-edge fallback', () => {
        // Viewport 90–140: turn 1 covers 90–100 (10), turn 2 100–130 (30), turn 3 130–140 (10).
        expect(computeActiveTurn(geometry(3, 30, 70), 90, 140)).toBe(2);
    });
});

describe('stripShift', () => {
    /** Where the focus tick's center lands inside the viewport for one shift. */
    const focusCenterInViewport = (focusIndex: number): number =>
        focusIndex * TICK_ADVANCE + TICK_HEIGHT / 2 - stripShift(focusIndex);

    it('places the focus tick exactly on the viewport center line', () => {
        for (const focusIndex of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
            expect(focusCenterInViewport(focusIndex)).toBe(VIEWPORT_HEIGHT / 2);
        }
    });

    it('advances by exactly one tick step per focus index', () => {
        expect(stripShift(4) - stripShift(3)).toBe(TICK_ADVANCE);
        expect(stripShift(1) - stripShift(0)).toBe(TICK_ADVANCE);
    });

    it('returns the identity shift for the focus that centers naturally', () => {
        // Viewport shows WINDOW_TICKS rows; the focus at the band's middle
        // needs no travel, which is what makes the resting state stable.
        const middle = Math.floor(WINDOW_TICKS / 2);
        expect(stripShift(middle)).toBe(0);
    });

    it('agrees with the viewport geometry', () => {
        expect(VIEWPORT_HEIGHT).toBe(WINDOW_TICKS * TICK_ADVANCE - (TICK_ADVANCE - TICK_HEIGHT));
        expect(TICK_ADVANCE).toBeGreaterThan(TICK_HEIGHT); // there is a real gap
    });
});

describe('relativeTime', () => {
    const now = 1_000_000_000; // fixed "now" for determinism

    it('reports "just now" for times less than a minute ago', () => {
        expect(relativeTime(now - 59_000, now)).toEqual({ key: 'time.now' });
        expect(relativeTime(now, now)).toEqual({ key: 'time.now' });
    });

    it('clamps future times to "just now"', () => {
        expect(relativeTime(now + 60_000, now)).toEqual({ key: 'time.now' });
    });

    it('reports minutes below an hour', () => {
        expect(relativeTime(now - 5 * 60_000, now)).toEqual({ key: 'time.minutes', params: { n: 5 } });
        expect(relativeTime(now - 59 * 60_000, now)).toEqual({ key: 'time.minutes', params: { n: 59 } });
    });

    it('reports hours below a day', () => {
        expect(relativeTime(now - 60 * 60_000, now)).toEqual({ key: 'time.hours', params: { n: 1 } });
        expect(relativeTime(now - 23 * 3_600_000, now)).toEqual({ key: 'time.hours', params: { n: 23 } });
    });

    it('reports days up to the absolute cutoff', () => {
        expect(relativeTime(now - 24 * 3_600_000, now)).toEqual({ key: 'time.days', params: { n: 1 } });
        expect(relativeTime(now - 30 * 86_400_000, now)).toEqual({ key: 'time.days', params: { n: 30 } });
    });

    it('switches to an absolute date beyond 30 days', () => {
        const then = new Date(2024, 0, 15, 10, 30).getTime();
        expect(relativeTime(then, then + 31 * 86_400_000)).toEqual({ key: 'time.date', params: { date: '2024/1/15' } });
    });
});

describe('windowTicks', () => {
    /** n consecutive ticks (turns 1..n). */
    const ticks = (n: number): TickModel[] => Array.from({ length: n }, (_, i) => tick({ turn: i + 1 }));
    /** The strip's turn numbers, for readable assertions. */
    const turns = (result: ReturnType<typeof windowTicks>): number[] => result.strip.map((t) => t.turn);
    /** The focus tick's turn number. */
    const focusTurn = (result: ReturnType<typeof windowTicks>): number =>
        result.strip[result.focusIndex]?.turn ?? -1;

    it('reports empty for a conversation with no milestones', () => {
        const result = windowTicks([], null);
        expect(result.empty).toBe(true);
        expect(result.strip).toEqual([]);
        expect(result.focusIndex).toBe(0);
        expect(result.hasOlder).toBe(false);
        expect(result.hasNewer).toBe(false);
    });

    it('renders every tick when the conversation fits the strip', () => {
        for (const n of [1, WINDOW_TICKS, STRIP_TICKS]) {
            const result = windowTicks(ticks(n), 1);
            expect(result.strip).toHaveLength(n);
            expect(result.empty).toBe(false);
            expect(result.hasOlder).toBe(false);
            expect(result.hasNewer).toBe(false);
        }
    });

    it('centres the focus when it is fully inside the conversation', () => {
        const result = windowTicks(ticks(40), 20);
        expect(result.strip).toHaveLength(STRIP_TICKS);
        // The focus sits as close to the strip's middle as the size allows.
        expect(result.focusIndex).toBe(Math.floor(STRIP_TICKS / 2));
        expect(focusTurn(result)).toBe(20);
        expect(result.hasOlder).toBe(true);
        expect(result.hasNewer).toBe(true);
    });

    it('clamps at the conversation start, moving the focus toward the top edge', () => {
        const result = windowTicks(ticks(40), 1);
        expect(turns(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(result.focusIndex).toBe(0);
        expect(result.hasOlder).toBe(false);
        expect(result.hasNewer).toBe(true);
    });

    it('clamps at the conversation end, moving the focus toward the bottom edge', () => {
        const result = windowTicks(ticks(40), 40);
        expect(turns(result)).toEqual([32, 33, 34, 35, 36, 37, 38, 39, 40]);
        expect(result.focusIndex).toBe(STRIP_TICKS - 1);
        expect(result.hasOlder).toBe(true);
        expect(result.hasNewer).toBe(false);
    });

    it('anchors on the newest milestone before the first measurement', () => {
        const result = windowTicks(ticks(40), null);
        expect(focusTurn(result)).toBe(40);
        expect(result.hasNewer).toBe(false);
    });

    it('anchors on the newest milestone when the active turn is not loaded', () => {
        const result = windowTicks(ticks(40), 999);
        expect(focusTurn(result)).toBe(40);
        expect(result.hasOlder).toBe(true);
        expect(result.hasNewer).toBe(false);
    });

    it('slides the strip by exactly one tick as the focus advances', () => {
        const before = windowTicks(ticks(40), 20);
        const after = windowTicks(ticks(40), 21);
        // Interior advance: the strip start shifts by one and the focus index
        // stays put, so the dock's translate moves by one step (a smooth glide).
        expect(turns(after)[0]).toBe(turns(before)[0] + 1);
        expect(after.focusIndex).toBe(before.focusIndex);
    });

    it('keeps the focus index still across the whole interior run', () => {
        // Interior = every focus whose centered strip needs no end clamp. The
        // implementation subtracts `floor(STRIP_TICKS / 2)` from the focus
        // INDEX, so in turn terms the interior starts one turn later than
        // `half` (turn 1 is index 0).
        const half = Math.floor(STRIP_TICKS / 2);
        const firstTurn = half + 1;
        const lastTurn = 40 - half;
        const indices = new Set(
            [firstTurn, 10, 20, 30, lastTurn].map((turn) => windowTicks(ticks(40), turn).focusIndex),
        );
        expect([...indices]).toEqual([half]);
    });

    it('moves the focus index by one at the top clamp boundary', () => {
        const half = Math.floor(STRIP_TICKS / 2);
        // The last turn before the interior: the strip clamps at the start, so
        // the focus sits one slot above center.
        expect(windowTicks(ticks(40), half).focusIndex).toBe(half - 1);
        expect(windowTicks(ticks(40), half + 1).focusIndex).toBe(half);
    });

    it('never mutates or aliases the input array', () => {
        const all = ticks(3);
        const result = windowTicks(all, 1);
        expect(result.strip).not.toBe(all);
        expect(result.strip).toEqual(all);
    });
});

describe('focusIndexOf', () => {
    const ticks = (n: number): TickModel[] => Array.from({ length: n }, (_, i) => tick({ turn: i + 1 }));

    it('returns -1 for an empty conversation', () => {
        expect(focusIndexOf([], null)).toBe(-1);
    });

    it('finds the active turn wherever it sits', () => {
        expect(focusIndexOf(ticks(10), 1)).toBe(0);
        expect(focusIndexOf(ticks(10), 7)).toBe(6);
        expect(focusIndexOf(ticks(10), 10)).toBe(9);
    });

    it('falls back to the newest milestone when the active turn is absent or unset', () => {
        expect(focusIndexOf(ticks(10), null)).toBe(9);
        expect(focusIndexOf(ticks(10), 99)).toBe(9);
    });
});
