/**
 * dsh-milestone client half: the MilestoneRuler entry in the frame-wide
 * `shell.overlay` layer, positioned as a vertical rail along the LEFT edge of
 * the conversation column (the ui-goal posture — a plain registrant plugin so
 * the declaration survives independent activation and reload).
 *
 * Placement: `shell.overlay` is a root-scope list slot whose layer is
 * `position:absolute; inset:0; pointer-events:none` with interactive direct
 * children — so the rail floats over the chat without taking layout space and
 * without displacing any shipped column. The horizontal anchor is measured
 * from the conversation scrollport (`[data-conversation-scroll]`) at runtime,
 * which keeps it correct across sidebar collapse/expand and window resizes.
 *
 * Window: the rail renders a fixed-size strip of milestones and translates it
 * so the focus (the viewport's turn) sits on the center line. Only the focus ±
 * {@link WINDOW_RADIUS} reads as legible; the overscan ticks beyond that band
 * are faded and blurred by CSS (see dock.css.ts), so ~5 milestones show while
 * the motion through them is one continuous glide rather than a swap. Edge
 * chevrons mark milestones hidden beyond the strip.
 *
 * The live milestone data arrives through `useProjection('milestones')` (the
 * framework's fifth standard hook seat — no client-side folding); scroll
 * synchronization reads the conversation DOM (`[data-conversation-scroll]`
 * scrollport, `[data-chat-anchor-key]` rows) and the `useSession` snapshot's
 * `chat.timeline.turnOrder` / `chat.locations.getTurn(turn)`.
 *
 * @module dsh-milestone/client
 */
/**
 * Slot-map, standard-kit, and locale-namespace augmentations live in the
 * layout / conversation / runtime / locale packages' `./client` type faces.
 * They are type-only here (`import type`), so the bundler emits no require for
 * them — at runtime the host always provides these packages.
 *
 * `ui-layout` contributes the `shell.overlay` seat this entry registers into;
 * without its face in the program that key is unknown to `SlotMap`.
 */
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-runtime/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Context } from '@deepseek-ai/cordis';
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import { injectDockCss } from './dock.css.ts';
import {
    computeActiveTurn,
    deriveMilestones,
    relativeTime,
    stripShift,
    windowTicks,
    emphasisOf,
    type TickModel,
    type TurnGeometry,
} from './locator.ts';

/** Dictionary namespace owned by this plugin. */
export const NS = 'milestones';

/** The zh dictionary — the key-set source of truth. */
const zh = {
    'dock.aria': '对话里程碑导航',
    'tick.aria': '第 {n} 轮',
    'tip.turn': '第 {n} 轮',
    'tip.none': '（无用户提问）',
    'status.running': '进行中',
    'reason.completed': '已完成',
    'reason.aborted': '已中止',
    'reason.blocked': '已阻塞',
    'reason.error': '出错',
    'reason.max-tokens': '达到输出上限',
    'reason.interrupted': '因中断结束',
    'time.now': '刚刚',
    'time.minutes': '{n} 分钟前',
    'time.hours': '{n} 小时前',
    'time.days': '{n} 天前',
    'time.date': '{date}',
} as const;

/** The en dictionary — checked complete against the zh key set. */
const en: Record<keyof typeof zh, string> = {
    'dock.aria': 'Conversation milestone navigation',
    'tick.aria': 'Turn {n}',
    'tip.turn': 'Turn {n}',
    'tip.none': '(no user message)',
    'status.running': 'Running',
    'reason.completed': 'Completed',
    'reason.aborted': 'Aborted',
    'reason.blocked': 'Blocked',
    'reason.error': 'Failed',
    'reason.max-tokens': 'Output cap reached',
    'reason.interrupted': 'Ended by interruption',
    'time.now': 'just now',
    'time.minutes': '{n} min ago',
    'time.hours': '{n} h ago',
    'time.days': '{n} d ago',
    'time.date': '{date}',
};

/** rAF coalescing budget for scroll-position recompute. */
const ACTIVE_TURN_REFRESH_MS = 150;
/**
 * Inset of the rail's LEFT edge from the conversation column's left edge, px.
 * The rail lives INSIDE the chat column (the "会话页面" the user means — the
 * center column, sidebar excluded), not in the sidebar's margin: a negative
 * offset would park it against the sidebar's right border, which reads as
 * "attached to the sidebar" rather than "inside the conversation".
 */
const RAIL_INSET = 12;
/**
 * The session-scope seat this entry registers into. Chosen as a pure ANCHOR:
 * it delivers the session standard kit (`useSession`, `useProjection`) and
 * nothing more. It is a list seat (additive — never displaces a shipped
 * control), and the entry renders no content in place, portaling the rail into
 * the frame's overlay layer instead.
 */
export const ANCHOR_SLOT = 'conversation.session.header.actions';
/** The frame-wide floating layer the rail portals into (ui-layout's AppFrame). */
export const OVERLAY_HOST_SELECTOR = '[data-shell-overlay]';

/** Copy for one milestone's status/end-reason line: a running marker or the
 * closed reason kind's localized label (unknown plugin-extended kinds fall
 * back to the raw kind).
 */
function reasonLabel(t: MilestoneRulerProps['t'], tick: TickModel): { label: string; kind: string } {
    if (tick.status === 'running') return { label: t('status.running'), kind: 'running' };
    const key = `reason.${tick.endReason ?? ''}` as keyof typeof zh;
    const label = Object.hasOwn(zh, key) ? t(key) : (tick.endReason ?? '');
    return { label, kind: tick.endReason ?? '' };
}

/** Format a template string with `{name}` params (the locale seat's contract). */
function format(template: string, params?: Record<string, string | number>): string {
    if (params === undefined) return template;
    return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
}

/** The scrollport the conversation view renders (`[data-conversation-scroll]`). */
function scrollportOf(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-conversation-scroll]');
}

/** First rendered anchor row of a turn, resolved through the location index. */
function firstAnchorKeyOf(snapshot: ConversationSnapshot, turn: number): string | undefined {
    const keys = snapshot.chat.locations.getTurn(turn);
    return keys[0];
}

/**
 * The sliding strip around the reading position. The implementation is
 * {@link windowTicks} in locator.ts (pure) — it returns the strip plus the
 * focus index, and this file only renders and translates that result.
 */

/**
 * Props of the registered anchor entry. The entry registers into a
 * SESSION-scope seat ({@link ANCHOR_SLOT}) because that is what delivers the
 * session standard kit (`useSession` + `useProjection`); it renders no content
 * there and portals the rail into the frame's overlay layer instead, which is
 * where a left-docked floating rail belongs.
 */
type MilestoneRulerProps = PropsRuntime<'conversation.session.header.actions'> & {
    /** The framework locale seat bound to this plugin's namespace. */
    t: TranslateNS<'milestones'>;
};

/**
 * The milestone ruler: a vertical rail hugging the left edge of the
 * conversation column. About five milestones around the reading position read
 * clearly (the rest of the strip is faded and blurred), the viewport's turn
 * sits on the center line, hovering a tick opens its card, and clicking jumps
 * to that turn. Renders nothing while the projection capability is absent or
 * the conversation has no turns yet.
 */
export const MilestoneRuler = function MilestoneRuler({
    useProjection,
    useSession,
    t,
}: MilestoneRulerProps) {
    const milestones = useProjection('milestones');
    const ticks = useMemo(() => deriveMilestones(milestones), [milestones]);
    const [activeTurn, setActiveTurn] = useState<number | null>(null);
    const [hoverTurn, setHoverTurn] = useState<number | null>(null);
    /** Rail's left offset within the overlay layer, or null before the first measure. */
    const [railLeft, setRailLeft] = useState<number | null>(null);
    /** Measured conversation-column left edge (debug/explicit anchor; see measureRailLeft). */
    const [railOrigin, setRailOrigin] = useState<number | null>(null);
    /** The overlay layer element to portal into; null until resolved (and while absent). */
    const [host, setHost] = useState<HTMLElement | null>(null);
    const rafRef = useRef(0);
    const lastRunRef = useRef(0);
    const railRef = useRef<HTMLDivElement | null>(null);

    /** Turn → first anchor key, from the session snapshot (recomputed per snapshot). */
    const anchorKeys = useSession(useCallback(
        (snapshot: ConversationSnapshot) => {
            const map = new Map<number, string | undefined>();
            for (const turn of snapshot.chat.timeline.turnOrder) map.set(turn, firstAnchorKeyOf(snapshot, turn));
            return map;
        },
        [],
    ));

    /**
     * The conversation column's left edge, offset from the overlay layer's own
     * box, plus {@link RAIL_INSET}. Measuring (rather than reading the layout's
     * inline grid template) keeps the rail correct through sidebar
     * collapse/expand, sidebar drag, details-panel opening, and window resizes
     * — every one of which moves the column without changing anything this
     * plugin owns.
     *
     * The measured column left doubles as the lower clamp: whichever way the
     * column moves, the rail can never render to the LEFT of it, so it cannot
     * drift over the sidebar. The inset then places it just inside the chat.
     */
    const measureRailLeft = useCallback((): void => {
        const scrollport = scrollportOf();
        const layer = host;
        if (scrollport === null || layer === null) return;
        const layerRect = layer.getBoundingClientRect();
        const columnLeft = scrollport.getBoundingClientRect().left - layerRect.left;
        // Guard against a transient pre-layout rect (0-width column) so a bogus
        // measurement never parks the rail at the frame's left edge.
        if (!Number.isFinite(columnLeft) || columnLeft <= 0) return;
        setRailLeft(Math.round(columnLeft + RAIL_INSET));
        setRailOrigin(Math.round(columnLeft));
    }, [host]);

    // The frame's overlay layer is created by ui-layout, which may activate
    // after this entry; poll on a short interval until it exists (then stop).
    useEffect(() => {
        const resolve = (): boolean => {
            const layer = document.querySelector<HTMLElement>(OVERLAY_HOST_SELECTOR);
            if (layer === null) return false;
            setHost(layer);
            return true;
        };
        if (resolve()) return;
        const timer = setInterval(() => {
            if (resolve()) clearInterval(timer);
        }, 500);
        return () => clearInterval(timer);
    }, []);

    const measure = useCallback((): TurnGeometry[] | null => {
        const scrollport = scrollportOf();
        if (scrollport === null || anchorKeys.size === 0) return null;
        const scrollRect = scrollport.getBoundingClientRect();
        const geometry: TurnGeometry[] = [];
        let lastBottom = 0;
        for (const [turn, key] of anchorKeys) {
            if (key === undefined) continue;
            const anchor = findAnchor(scrollport, key);
            if (anchor === null) continue;
            const top = anchor.getBoundingClientRect().top - scrollRect.top + scrollport.scrollTop;
            geometry.push({ turn, top, bottom: top });
            lastBottom = top;
        }
        // Each turn spans until the next measured turn; the last one extends one
        // viewport below so a bottom-clamped scrollport keeps it active.
        for (let i = 0; i < geometry.length; i++) {
            geometry[i].bottom = i + 1 < geometry.length ? geometry[i + 1].top : lastBottom + scrollport.clientHeight;
        }
        return geometry;
    }, [anchorKeys]);

    const refreshActive = useCallback((force = false) => {
        if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            const now = performance.now();
            measureRailLeft();
            if (!force && now - lastRunRef.current < ACTIVE_TURN_REFRESH_MS) return;
            lastRunRef.current = now;
            const geometry = measure();
            if (geometry === null) return;
            const scrollport = scrollportOf();
            if (scrollport === null) return;
            setActiveTurn(computeActiveTurn(geometry, scrollport.scrollTop, scrollport.scrollTop + scrollport.clientHeight));
        });
    }, [measure, measureRailLeft]);

    // Follow scroll, resize, and conversation growth (new rows, older pages).
    // Gated on `host`: before the overlay layer exists the DOM readers have
    // nothing to work with, and the measurement effect must re-run once it does.
    useEffect(() => {
        if (host === null) return;
        const scrollport = scrollportOf();
        if (scrollport === null) return;
        const onScroll = () => refreshActive();
        scrollport.addEventListener('scroll', onScroll, { passive: true });
        const observer = new ResizeObserver(() => refreshActive(true));
        observer.observe(scrollport);
        const mutation = new MutationObserver(() => refreshActive(true));
        mutation.observe(scrollport, { childList: true, subtree: true });
        // The column's left edge moves when the sidebar collapses, drags, or the
        // details panel opens — none of which changes the scrollport's own size,
        // so the frame and the overlay host are both watched.
        const frame = scrollport.closest<HTMLElement>('[style*="grid-template-columns"]');
        if (frame !== null) {
            observer.observe(frame);
            observer.observe(host);
        }
        window.addEventListener('resize', onScroll);
        refreshActive(true);
        return () => {
            scrollport.removeEventListener('scroll', onScroll);
            observer.disconnect();
            mutation.disconnect();
            window.removeEventListener('resize', onScroll);
            if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
        };
    }, [refreshActive, host]);

    const jumpTo = useCallback((turn: number) => {
        const scrollport = scrollportOf();
        const key = anchorKeys.get(turn);
        if (scrollport === null || key === undefined) return;
        const anchor = findAnchor(scrollport, key);
        anchor?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, [anchorKeys]);

    // The seat is a session-scope ANCHOR, not a visual home: the rail belongs
    // in the frame's overlay layer, so this entry renders null in place and
    // portals the rail there. Portaling keeps the session kit (useSession /
    // useProjection) available while freeing the geometry from the header row.
    if (host === null || milestones === undefined || ticks.length === 0) return null;
    const strip = windowTicks(ticks, activeTurn);
    const now = Date.now();
    // Slide the strip so the focus tick's center meets the viewport's center
    // line. The whole column is translated, so a focus change animates as ONE
    // continuous glide through the overscan ticks instead of a swap; see
    // stripShift for why the strip's own middle is the wrong reference.
    const shift = stripShift(strip.focusIndex);
    return createPortal(
        <div
            ref={railRef}
            className="dms-rail"
            role="navigation"
            aria-label={t('dock.aria')}
            data-left={railLeft === null ? undefined : String(railLeft)}
            data-column-left={railOrigin === null ? undefined : String(railOrigin)}
            data-focus={strip.focusIndex}
            style={railLeft === null ? { visibility: 'hidden' } : { left: `${railLeft}px` }}
        >
            <EdgeCue direction="older" shown={strip.hasOlder} />
            <div className="dms-viewport">
                <ol
                    className="dms-ruler"
                    role="list"
                    style={{ transform: `translateY(${-shift}px)` }}
                    onMouseLeave={() => setHoverTurn(null)}
                >
                    {strip.strip.map((tick, index) => (
                        <Tick
                            key={tick.turn}
                            tick={tick}
                            // Distance from the focus drives graduated size, the
                            // fade, and the blur — so exactly the readable band
                            // around the focus reads as "shown".
                            distance={Math.abs(index - strip.focusIndex)}
                            active={tick.turn === activeTurn}
                            hovered={tick.turn === hoverTurn}
                            onHover={setHoverTurn}
                            onJump={jumpTo}
                            t={t}
                            now={now}
                        />
                    ))}
                </ol>
            </div>
            <EdgeCue direction="newer" shown={strip.hasNewer} />
        </div>,
        host,
    );
};

/** One "more milestones this way" marker above/below the window. */
function EdgeCue({ direction, shown }: { direction: 'older' | 'newer'; shown: boolean }) {
    if (!shown) return <span className="dms-cueSpacer" aria-hidden="true" />;
    return (
        <span className="dms-cue" data-dir={direction} aria-hidden="true">
            {direction === 'older' ? '⌃' : '⌄'}
        </span>
    );
}

/** Resolve a turn's anchor row without selector interpolation (anchor keys are opaque). */
function findAnchor(scrollport: HTMLElement, key: string): HTMLElement | null {
    for (const row of scrollport.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
        if (row.dataset.chatAnchorKey === key) return row;
    }
    return null;
}

/** Props of one ruler tick (a plain function component, memoized by turn state below). */
interface TickProps {
    tick: TickModel;
    /** Positions from the focus tick within the strip; drives the emphasis tier. */
    distance: number;
    active: boolean;
    hovered: boolean;
    onHover: (turn: number | null) => void;
    onJump: (turn: number) => void;
    t: MilestoneRulerProps['t'];
    now: number;
}

/** One ruler tick with its hover tooltip card. */
function Tick({ tick, distance, active, hovered, onHover, onJump, t, now }: TickProps) {
    const reason = reasonLabel(t, tick);
    const time = relativeTime(tick.time, now);
    const summary = tick.summary ?? null;
    return (
        <li className="dms-tickWrap">
            <button
                type="button"
                role="listitem"
                className="dms-tick"
                data-emphasis={emphasisOf(distance)}
                data-running={tick.status === 'running' ? '1' : undefined}
                aria-label={format(t('tick.aria'), { n: tick.turn })}
                aria-current={active ? 'true' : undefined}
                onMouseEnter={() => onHover(tick.turn)}
                onFocus={() => onHover(tick.turn)}
                onBlur={() => onHover(null)}
                onClick={() => onJump(tick.turn)}
            >
                <span className="dms-line" aria-hidden="true" />
                <span className="dms-dot" aria-hidden="true" />
                {hovered && (
                    <span className="dms-tip" role="tooltip">
                        <span className="dms-tipHead">
                            <span className="dms-tipTurn">{format(t('tip.turn'), { n: tick.turn })}</span>
                            <span className="dms-tipTime">{format(t(time.key), time.params)}</span>
                        </span>
                        {summary !== null ? (
                            <span className="dms-tipSummary">{summary}</span>
                        ) : (
                            <span className="dms-tipNone">{t('tip.none')}</span>
                        )}
                        <span className="dms-tipStatus">
                            <span data-kind={reason.kind}>{reason.label}</span>
                        </span>
                    </span>
                )}
            </button>
        </li>
    );
}

/** Required services: the slot registry (register + inject) and the locale face (dictionaries). */
export const inject = ['slots', 'locale'];

/**
 * Client plugin body: register the MilestoneRuler anchor into the session
 * header's additive action seat (session kit), which portals the rail into the
 * frame-wide overlay layer so it docks at the LEFT of the conversation column.
 * `ctx.slots.inject` runs the registration per declaration lifetime, so plugin
 * unload removes the entry.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
    ctx.slots.inject(ANCHOR_SLOT, () => {
        injectDockCss();
        return ctx.slots.register(
            {
                name: ANCHOR_SLOT,
                id: 'milestones',
                // Negative order: a static session-context marker leads the
                // interactive action row rather than trailing it.
                order: -10,
                locale: NS,
            },
            MilestoneRuler,
        );
    });
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'milestone: dictionaries');
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The milestone ruler's copy. */
        milestones: keyof typeof zh;
    }
}
