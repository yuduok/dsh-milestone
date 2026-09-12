/**
 * dsh-milestone host entry: registers the `milestones` projection unit so web
 * sessions can render per-turn conversation-milestone navigation.
 *
 * @module dsh-milestone
 */
import type { Context } from '@deepseek-ai/cordis';
import { milestonesProjectionDefinition } from './projection.ts';

/** Cordis plugin name (the patch `name` and client entry id — Node-resolved package name). */
export const name = 'dsh-milestone';

/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
export const inject = ['sessionProjections'];

/**
 * Register the `milestones` unit; the registration is an effect on this
 * plugin's fiber, so unloading removes the key.
 * @param ctx - registrant context carrying the projection registry.
 */
export function apply(ctx: Context): void {
    ctx.sessionProjections.register(milestonesProjectionDefinition);
}
