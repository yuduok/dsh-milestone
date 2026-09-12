/**
 * MilestoneRuler styles: injected at materialization as one
 * `style[data-plugin-css]` tag (the ui-goal GoalBar pattern — module side
 * effects live inside the factory closure). Colors read only dsw alias /
 * specific variables; no hardcoded palette. Class names are stable and
 * `dms-`-prefixed (dsh-milestone styles) instead of hashed — a plugin bundle
 * owns one namespace.
 *
 * Geometry: the root is an absolutely-positioned vertical rail inside the
 * frame-wide `shell.overlay` layer (`inset:0; pointer-events:none` whose
 * direct children opt back in). `left` is set inline from a runtime
 * measurement of the conversation column; `top`/`bottom` pin it to the
 * viewport with a comfortable inset so it never collides with the header or
 * composer.
 *
 * The tick metrics are interpolated from locator.ts so the CSS and the JS
 * transform can never disagree about how far one tick advances.
 */
import { EMPHASIS_FOCUS, EMPHASIS_NEAR, TICK_ADVANCE, TICK_HEIGHT, VIEWPORT_HEIGHT } from './locator.ts';

const TICK_GAP = TICK_ADVANCE - TICK_HEIGHT;
/**
 * Tick-mark widths per emphasis tier, px, across the 26px rail. Calibrated to
 * the carousel-indicator reference (longest ≈ 100%, neighbours ≈ 75%, the rest
 * ≈ 45–50%): normal must stay a solid, deliberate mark — a shorter tick that
 * still reads as "a milestone", not a stub that reads as "broken".
 */
const NORMAL_WIDTH = 12;
const NEAR_WIDTH = 18;
const FOCUS_WIDTH = 24;

const css = `
.dms-rail{position:absolute;top:96px;bottom:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:26px;pointer-events:auto;z-index:1}
/* Fixed-height window onto the strip: exactly the visible band is tall enough to
   show. The mask only SOFTENS the outermost row so the overscan ticks appear to
   emerge from the edge instead of being clipped mid-stroke — it must not fade
   them to nothing, or the outside ticks read as "missing" rather than "further
   away" (the emphasis itself lives in the data-emphasis rules below). */
.dms-viewport{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:${VIEWPORT_HEIGHT}px;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 9%,#000 91%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 9%,#000 91%,transparent 100%)}
.dms-ruler{display:flex;flex-direction:column;align-items:center;width:100%;margin:0;padding:0;list-style:none;border:none;background:transparent;will-change:transform;transition:transform .34s cubic-bezier(.22,.61,.36,1)}
@media (prefers-reduced-motion:reduce){.dms-ruler{transition:none}}
.dms-tickWrap{display:flex;align-items:center;justify-content:center;width:100%;margin:0;padding:0;list-style:none}
.dms-tick{position:relative;display:flex;align-items:center;justify-content:flex-end;width:100%;height:${TICK_HEIGHT}px;margin:0 0 ${TICK_GAP}px;padding:0;border:none;background:transparent;cursor:pointer}
.dms-tickWrap:last-child .dms-tick{margin-bottom:0}
.dms-tick:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px;border-radius:2px}
/* Three emphasis tiers, carousel-indicator style (see emphasisOf in locator.ts):
   the FOCUS tick is longest / brightest / thickest, its immediate NEIGHBOURS are
   a step longer and brighter than the rest, and every other tick sits at the
   NORMAL level — shorter and dimmer, but still plainly visible. Nothing is faded
   toward invisible: a de-emphasis must never read as a missing row. */
.dms-line{display:block;width:${NORMAL_WIDTH}px;height:2px;border-radius:1px;background:var(--dsw-alias-label-secondary);opacity:.55;transition:width .2s ease,height .2s ease,opacity .2s ease,background .2s ease}
.dms-tick[data-emphasis="${EMPHASIS_NEAR}"] .dms-line{width:${NEAR_WIDTH}px;opacity:.75;background:var(--dsw-alias-label-secondary)}
.dms-tick[data-emphasis="${EMPHASIS_FOCUS}"] .dms-line{width:${FOCUS_WIDTH}px;height:3px;opacity:1;background:var(--dsw-alias-label-primary)}
.dms-tick:hover .dms-line{width:${NEAR_WIDTH}px;opacity:.95;background:var(--dsw-alias-label-secondary)}
.dms-dot{position:absolute;right:-2px;top:50%;width:3px;height:3px;margin-top:-1.5px;border-radius:50%;background:var(--dsw-alias-label-primary);opacity:0;transition:opacity .2s ease}
.dms-tick[data-emphasis="${EMPHASIS_FOCUS}"] .dms-dot{opacity:1}
.dms-tick[data-running="1"] .dms-line{animation:dms-pulse 1.6s ease-in-out infinite}
.dms-tick[data-running="1"]:hover .dms-line,.dms-tick[data-running="1"][data-emphasis="${EMPHASIS_FOCUS}"] .dms-line{animation:none}
@keyframes dms-pulse{0%,100%{opacity:.35}50%{opacity:.9}}
@media (prefers-reduced-motion:reduce){.dms-tick[data-running="1"] .dms-line{animation:none}}
.dms-cue,.dms-cueSpacer{display:block;height:10px;line-height:8px;font-size:10px;color:var(--dsw-alias-label-caption);opacity:.7;user-select:none;transition:opacity .2s ease}
.dms-cueSpacer{visibility:hidden}
.dms-tip{position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);z-index:20;box-sizing:border-box;width:260px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-specific-tip);box-shadow:var(--dsw-shadow-lv2);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;pointer-events:none;text-align:left;white-space:normal}
.dms-tip::after{content:"";position:absolute;right:100%;top:50%;margin-top:-5px;border:5px solid transparent;border-right-color:var(--dsw-alias-border-l1)}
.dms-tipHead{display:flex;justify-content:space-between;gap:8px;margin-bottom:2px}
.dms-tipTurn{font-weight:600;color:var(--dsw-alias-label-primary)}
.dms-tipTime{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;flex:none}
.dms-tipSummary{color:var(--dsw-alias-label-primary-dimmed);word-break:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dms-tipNone{color:var(--dsw-alias-label-caption);font-style:italic}
.dms-tipStatus{margin-top:4px;color:var(--dsw-alias-label-secondary)}
.dms-tipStatus [data-kind="error"]{color:var(--dsw-alias-state-error-primary)}
.dms-tipStatus [data-kind="aborted"]{color:var(--dsw-alias-state-warn-primary)}
.dms-tipStatus [data-kind="running"]{color:var(--dsw-alias-state-business-primary)}
`;

const tagId = 'dsh-milestone/milestone-dock.css';

/**
 * Inject the dock stylesheet once per document (idempotent across HMR
 * reloads: the tagId lookup skips the second append).
 */
export function injectDockCss(): void {
    if (typeof document === 'undefined') return;
    if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) !== null) return;
    const tag = document.createElement('style');
    tag.dataset.plugin = 'dsh-milestone';
    tag.dataset.pluginCss = tagId;
    tag.textContent = css;
    document.head.appendChild(tag);
}
