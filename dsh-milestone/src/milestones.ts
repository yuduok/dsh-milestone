/**
 * Milestone fold types: the pure vocabulary of the `milestones` projection —
 * one milestone per conversation turn.
 *
 * This module is intentionally dependency-free: the fold in `applyLog` and the
 * summarizer in `summarizeUserMessage` are plain functions over plain data, so
 * they unit-test without any dsh or cordis runtime.
 *
 * @module dsh-milestone/milestones
 */

/** Lifecycle of one milestone (one conversation turn). */
export type MilestoneStatus = 'running' | 'closed';

/**
 * One milestone: a whole conversation turn's user-facing summary line.
 * Plain JSON only — the projection state must persist through the
 * projection-cache checkpoint contract.
 */
export interface Milestone {
    /** The turn number this milestone covers (`turn/start.turn`). */
    turn: number;
    /** Epoch ms of the `turn/start` event. */
    startTime: number;
    /** `running` between `turn/start` and `turn/end`; `closed` afterwards. */
    status: MilestoneStatus;
    /** Epoch ms of the `turn/end` event; absent while running. */
    endTime?: number;
    /** The `turn/end` reason `kind`; absent while running. */
    endReason?: string;
    /** First human message of the turn, summarized; absent until one arrives. */
    summary?: string;
    /** Epoch ms of that first human `user/message` event; absent until one arrives. */
    userTime?: number;
}

/** Fold state: milestones indexed by turn plus the last-seen turn slot. Plain JSON. */
export interface MilestonesState {
    /** Milestones by turn number. */
    turns: Record<string, Milestone>;
    /** The most recently opened turn; `null` for an empty log. */
    lastTurn: number | null;
}

/**
 * First human message of a turn, summarized to a single short line: the first
 * text block's leading run, newlines flattened, trimmed, capped at 80 chars.
 * Non-text-only leading blocks (images, tool calls) yield `undefined` — a
 * turn that opened with an attachment shows as untitled rather than showing
 * a wrong summary.
 * @param content - the user message's content blocks.
 * @returns the summary line, or `undefined` when no leading text exists.
 */
export function summarizeUserMessage(content: readonly { type: string; text?: string }[]): string | undefined {
    for (const block of content) {
        if (block.type !== 'text' || typeof block.text !== 'string') break;
        const text = block.text.replaceAll(/[\r\n]+/g, ' ').trim();
        if (text.length > 0) return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    }
    return undefined;
}

/**
 * Fold one committed session event into the milestone state. Pure and
 * synchronous; uninteresting events return the SAME state reference so the
 * projection registry's eager drive does zero downstream work for them.
 *
 * Rules:
 * - `turn/start` opens a milestone; re-opening an existing turn never resets
 *   its `startTime` (out-of-order/replayed defense).
 * - `user/message` records the first human message's summary and time on the
 *   open turn. Only `source.kind === 'user'` is human — plugin injections
 *   (`kind: 'plugin'`), goal-continuation rounds (`kind: 'goal'`), steering
 *   claims recorded later, and tool results are all skipped.
 * - `turn/end` closes the turn with its reason kind; closing an unknown turn
 *   or a second close of a closed turn is a no-op.
 * @param state - the state covering all prior events.
 * @param event - one committed session event (structurally checked; the fold
 *   tolerates plain-JSON replays and plugin-extended vocabularies).
 * @returns the next state, or the same reference when the event is not ours.
 */
export function applyLog(state: MilestonesState, event: unknown): MilestonesState {
    if (typeof event !== 'object' || event === null) return state;
    const { type, time, data } = event as { type?: unknown; time?: unknown; data?: unknown };
    switch (type) {
        case 'turn/start': {
            if (typeof data !== 'object' || data === null) return state;
            const { turn } = data as { turn?: unknown };
            if (typeof turn !== 'number' || typeof time !== 'number') return state;
            const existing = state.turns[String(turn)];
            if (existing) return state;
            const next: MilestonesState = {
                turns: { ...state.turns, [String(turn)]: { turn, startTime: time, status: 'running' } },
                lastTurn: turn,
            };
            return next;
        }
        case 'user/message': {
            if (typeof data !== 'object' || data === null) return state;
            const message = data as { source?: { kind?: unknown }; content?: unknown };
            if (message.source?.kind !== 'user') return state;
            const turn = state.lastTurn;
            if (turn === null) return state;
            const open = state.turns[String(turn)];
            if (!open || open.status !== 'running' || open.summary !== undefined) return state;
            if (!Array.isArray(message.content)) return state;
            const summary = summarizeUserMessage(message.content);
            if (summary === undefined) return state;
            return {
                turns: { ...state.turns, [String(turn)]: { ...open, summary, userTime: time as number } },
                lastTurn: turn,
            };
        }
        case 'turn/end': {
            if (typeof data !== 'object' || data === null) return state;
            const { turn, reason } = data as { turn?: unknown; reason?: unknown };
            if (typeof turn !== 'number' || typeof reason !== 'object' || reason === null) return state;
            const open = state.turns[String(turn)];
            if (!open || open.status !== 'running') return state;
            const endReason = (reason as { kind?: unknown }).kind;
            if (typeof endReason !== 'string') return state;
            return {
                turns: { ...state.turns, [String(turn)]: { ...open, status: 'closed', endTime: time as number, endReason } },
                lastTurn: state.lastTurn,
            };
        }
        default:
            return state;
    }
}

/**
 * The empty-log state. Fresh object every call, mirroring projection `init`
 * semantics (callers may mutate their copy).
 * @returns initial milestones state.
 */
export function initMilestones(): MilestonesState {
    return { turns: {}, lastTurn: null };
}

/**
 * Wire view: milestones in ascending turn order, running turns last (they are
 * the newest). The whole client-visible value for the `milestones` key.
 * @param state - the current fold state.
 * @returns milestones sorted by turn.
 */
export function milestonesView(state: MilestonesState): Milestone[] {
    return Object.values(state.turns).sort((a, b) => a.turn - b.turn);
}
