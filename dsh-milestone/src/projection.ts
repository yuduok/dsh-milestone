/**
 * The `milestones` projection unit: a pure fold of turn boundaries and human
 * user messages into per-turn navigation milestones.
 *
 * `turn/start` opens, the first `source.kind === 'user'` `user/message`
 * summarizes, `turn/end` closes. State is plain JSON
 * (`turns` record + `lastTurn` slot); the wire view is the turn-ordered
 * milestone array the client dock renders.
 *
 * @module dsh-milestone/projection
 */
import { z } from 'zod';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
import { applyLog, initMilestones, milestonesView, type Milestone, type MilestonesState } from './milestones.ts';

declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionMap {
        /** Per-turn navigation milestones, turn-ascending; see {@link Milestone}. */
        milestones: Milestone[];
    }

    interface SessionProjectionStateMap {
        /** Milestone fold state (plain JSON); see {@link MilestonesState}. */
        milestones: MilestonesState;
    }
}

const milestoneSchema: z.ZodType<Milestone> = z.object({
    turn: z.number().int().nonnegative(),
    startTime: z.number().nonnegative(),
    status: z.enum(['running', 'closed']),
    endTime: z.number().nonnegative().optional(),
    endReason: z.string().optional(),
    summary: z.string().optional(),
    userTime: z.number().nonnegative().optional(),
});

const milestonesViewSchema = z.array(milestoneSchema);

const milestonesStateSchema: z.ZodType<MilestonesState> = z.object({
    turns: z.record(z.string(), milestoneSchema),
    lastTurn: z.number().int().nonnegative().nullable(),
});

/**
 * The `milestones` unit registered on `ctx.sessionProjections` (exported for
 * the unit spec). All functions are synchronous; state is plain JSON per the
 * projection-cache contract.
 */
export const milestonesProjectionDefinition = {
    key: 'milestones',
    stateVersion: 1,
    stateSchema: milestonesStateSchema,
    init: initMilestones,
    apply: (state: MilestonesState, event: SessionEvent) => applyLog(state, event),
    wire: {
        viewSchema: milestonesViewSchema,
        view: milestonesView,
    },
} satisfies ProjectionDefinition<'milestones', MilestonesState>;
