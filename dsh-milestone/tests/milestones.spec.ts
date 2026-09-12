/**
 * Unit spec for the milestone fold (src/milestones.ts) — pure functions, no
 * dsh runtime. Covers: empty log, normal turn, injected-message skip, long
 * summary truncation, every turn/end reason kind, and out-of-order defense.
 *
 * @module tests/milestones.spec
 */
import { describe, expect, it } from 'vitest';
import { applyLog, initMilestones, milestonesView, summarizeUserMessage, type MilestonesState } from '../src/milestones.ts';

/** A minimal structural event shape — the fold only needs type/time/data. */
interface FakeEvent {
    type: string;
    seq: number;
    time: number;
    data: unknown;
}

let seq = 0;

/** Build a minimal turn/start event shaped like the durable log's. */
function turnStart(turn: number, time = 1000): FakeEvent {
    return { type: 'turn/start', seq: seq++, time, data: { turn } };
}

/** Build a turn/end event with a structured reason like the loop emits. */
function turnEnd(turn: number, reason: { kind: string; [key: string]: unknown }, time = 2000): FakeEvent {
    return { type: 'turn/end', seq: seq++, time, data: { turn, reason } };
}

/** Build a user/message event with the given source kind and text content. */
function userMessage(kind: string, text: string, time = 1500, extraSource: Record<string, unknown> = {}): FakeEvent {
    return {
        type: 'user/message',
        seq: seq++,
        time,
        data: { source: { kind, ...extraSource }, content: [{ type: 'text', text }] },
    };
}

/** Fold events over a fresh state. */
function fold(...events: FakeEvent[]): MilestonesState {
    return events.reduce<MilestonesState>((state, event) => applyLog(state, event), initMilestones());
}

describe('empty log', () => {
    it('inits to an empty turn record and null lastTurn', () => {
        expect(initMilestones()).toEqual({ turns: {}, lastTurn: null });
        expect(milestonesView(initMilestones())).toEqual([]);
    });
});

describe('normal turn', () => {
    it('opens, summarizes the first human message, and closes', () => {
        const state = fold(turnStart(1), userMessage('user', 'hello world'), turnEnd(1, { kind: 'completed' }));
        expect(state.lastTurn).toBe(1);
        expect(state.turns['1']).toEqual({
            turn: 1,
            startTime: 1000,
            status: 'closed',
            endTime: 2000,
            endReason: 'completed',
            summary: 'hello world',
            userTime: 1500,
        });
        expect(milestonesView(state)).toEqual([state.turns['1']]);
    });

    it('leaves the turn running until turn/end arrives', () => {
        const state = fold(turnStart(1), userMessage('user', 'hi'));
        expect(state.turns['1'].status).toBe('running');
        expect(state.turns['1'].endTime).toBeUndefined();
        expect(state.turns['1'].endReason).toBeUndefined();
    });

    it('keeps the first summary when a second human message arrives', () => {
        const state = fold(turnStart(1), userMessage('user', 'first'), userMessage('user', 'second'));
        expect(state.turns['1'].summary).toBe('first');
    });
});

describe('injected messages are skipped', () => {
    it('ignores plugin-injected context (agent.inject)', () => {
        const state = fold(turnStart(1), userMessage('plugin', 'file-change notice', 1200, { plugin: 'fs-watch' }), userMessage('user', 'actual ask'));
        expect(state.turns['1'].summary).toBe('actual ask');
    });

    it('ignores goal-continuation rounds', () => {
        const state = fold(turnStart(1), userMessage('goal', 'continue the goal', 1200, { round: 2 }), userMessage('user', 'the human ask'));
        expect(state.turns['1'].summary).toBe('the human ask');
    });

    it('ignores tool-result user-role messages', () => {
        const toolResult = {
            type: 'user/message',
            seq: seq++,
            time: 1200,
            data: { source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'tool-result', toolCallId: 'c1', content: [] }] },
        };
        const state = fold(turnStart(1), toolResult, userMessage('user', 'real question'));
        expect(state.turns['1'].summary).toBe('real question');
    });

    it('leaves summary absent when only injections entered the turn', () => {
        const state = fold(turnStart(1), userMessage('plugin', 'context dump'));
        expect(state.turns['1'].summary).toBeUndefined();
        expect(state.turns['1'].status).toBe('running');
    });
});

describe('summary extraction', () => {
    it('truncates long summaries to 80 chars with an ellipsis', () => {
        const long = 'x'.repeat(120);
        const state = fold(turnStart(1), userMessage('user', long));
        expect(state.turns['1'].summary).toHaveLength(81);
        expect(state.turns['1'].summary).toBe(`${'x'.repeat(80)}…`);
    });

    it('flattens newlines and trims whitespace', () => {
        expect(summarizeUserMessage([{ type: 'text', text: '  line one\nline two\r\n  ' }])).toBe('line one line two');
    });

    it('skips a leading empty text block and uses the next one', () => {
        expect(summarizeUserMessage([{ type: 'text', text: '   \n  ' }, { type: 'text', text: 'real text' }])).toBe('real text');
    });

    it('yields undefined for a non-text leading block (image)', () => {
        expect(summarizeUserMessage([{ type: 'image' }, { type: 'text', text: 'caption' }])).toBeUndefined();
    });

    it('yields undefined for an empty content array', () => {
        expect(summarizeUserMessage([])).toBeUndefined();
    });
});

describe('turn/end reasons', () => {
    const reasons = [
        { kind: 'completed' },
        { kind: 'aborted', reason: { kind: 'user' } },
        { kind: 'blocked' },
        { kind: 'error', error: { message: 'boom', code: 'UNKNOWN' } },
        { kind: 'max-tokens' },
        { kind: 'interrupted' },
    ];

    for (const reason of reasons) {
        it(`closes with ${reason.kind}`, () => {
            const state = fold(turnStart(1), turnEnd(1, reason));
            expect(state.turns['1'].status).toBe('closed');
            expect(state.turns['1'].endReason).toBe(reason.kind);
            expect(state.turns['1'].endTime).toBe(2000);
        });
    }
});

describe('out-of-order and defensive folds', () => {
    it('never resets startTime when a turn re-opens (replayed turn/start)', () => {
        const opened = fold(turnStart(1, 1000));
        const replayed = applyLog(opened, turnStart(1, 9999));
        expect(replayed).toBe(opened);
        expect(replayed.turns['1'].startTime).toBe(1000);
    });

    it('ignores turn/end for an unknown turn', () => {
        const state = fold(turnStart(1), turnEnd(2, { kind: 'completed' }));
        expect(state.turns['1'].status).toBe('running');
        expect(state.turns['2']).toBeUndefined();
    });

    it('ignores a second close of an already-closed turn', () => {
        const closed = fold(turnStart(1), turnEnd(1, { kind: 'completed' }));
        const again = applyLog(closed, turnEnd(1, { kind: 'aborted', reason: { kind: 'hook' } }, 3000));
        expect(again).toBe(closed);
    });

    it('ignores user messages when no turn is open (lastTurn null)', () => {
        const base = initMilestones();
        expect(applyLog(base, userMessage('user', 'orphan'))).toBe(base);
        expect(base.turns).toEqual({});
    });

    it('returns the same reference for every uninteresting event', () => {
        const state = fold(turnStart(1));
        for (const event of [
            { type: 'step/start', seq: seq++, time: 1100, data: { turn: 1, step: 1 } },
            { type: 'assistant/chunk', seq: seq++, time: 1150, data: { turn: 1, step: 1, chunk: { type: 'text-delta', delta: 'x' } } },
            { type: 'assistant/message', seq: seq++, time: 1200, data: { turn: 1, step: 1, message: { role: 'assistant', content: [] } } },
            { type: 'tool/call', seq: seq++, time: 1250, data: { turn: 1, step: 1, callId: 'c1', name: 't', arguments: '{}' } },
            { type: 'tool/result', seq: seq++, time: 1300, data: { turn: 1, step: 1, message: { role: 'user', content: [] } } },
            { type: 'todo/write', seq: seq++, time: 1310, data: { todos: [] } },
            { type: 'request/header', seq: seq++, time: 1320, data: { header: {}, reason: 'initial' } },
            { type: 'session/end-seed', seq: seq++, time: 1330, data: {} },
        ]) {
            expect(applyLog(state, event)).toBe(state);
        }
    });

    it('tolerates malformed payloads without throwing', () => {
        const state = initMilestones();
        expect(applyLog(state, null)).toBe(state);
        expect(applyLog(state, 42)).toBe(state);
        expect(applyLog(state, { type: 'turn/start', time: 1, data: null })).toBe(state);
        expect(applyLog(state, { type: 'turn/start', time: 1, data: {} })).toBe(state);
        expect(applyLog(state, { type: 'turn/start', time: 'x', data: { turn: 1 } })).toBe(state);
        expect(applyLog(state, { type: 'turn/end', time: 1, data: { turn: 1 } })).toBe(state);
        expect(applyLog(state, { type: 'turn/end', time: 1, data: { turn: 1, reason: null } })).toBe(state);
        expect(applyLog(state, { type: 'user/message', time: 1, data: null })).toBe(state);
    });
});

describe('multi-turn ordering', () => {
    it('views milestones in ascending turn order', () => {
        const state = fold(turnStart(3), turnEnd(3, { kind: 'completed' }), turnStart(1), turnEnd(1, { kind: 'completed' }), turnStart(2));
        expect(milestonesView(state).map((m) => m.turn)).toEqual([1, 2, 3]);
        expect(milestonesView(state)[0].status).toBe('closed');
        expect(milestonesView(state)[1].status).toBe('running');
    });
});
