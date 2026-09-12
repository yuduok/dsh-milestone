/*! dsh-milestone client bundle — window.__ModuleLoader__.load({id, factory}) CJS factory */
/* eslint-disable */
typeof window !== "undefined" && window.__ModuleLoader__ && window.__ModuleLoader__.load({
	id: "dsh-milestone",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		"use strict";
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, { get: all[name], enumerable: true });
		};
		var __copyProps = (to, from, except, desc) => {
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (let key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(to, key) && key !== except)
		        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
		  }
		  return to;
		};
		var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

		// src/client.tsx
		var client_exports = {};
		__export(client_exports, {
		  ANCHOR_SLOT: () => ANCHOR_SLOT,
		  MilestoneRuler: () => MilestoneRuler,
		  NS: () => NS,
		  OVERLAY_HOST_SELECTOR: () => OVERLAY_HOST_SELECTOR,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(client_exports);
		var import_react = require("react");
		var import_react_dom = require("react-dom");

		// src/locator.ts
		function deriveMilestones(value) {
		  if (value === void 0) return [];
		  const byTurn = /* @__PURE__ */ new Map();
		  for (const milestone of value) {
		    if (byTurn.has(milestone.turn)) continue;
		    byTurn.set(milestone.turn, {
		      turn: milestone.turn,
		      status: milestone.status,
		      summary: milestone.summary,
		      time: milestone.userTime ?? milestone.startTime,
		      endReason: milestone.endReason
		    });
		  }
		  return [...byTurn.values()].sort((a, b) => a.turn - b.turn);
		}
		function computeActiveTurn(turns, viewportTop, viewportBottom) {
		  if (turns.length === 0) return null;
		  let best = null;
		  let bestOverlap = 0;
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
		var WINDOW_RADIUS = 2;
		var WINDOW_TICKS = WINDOW_RADIUS * 2 + 1;
		var STRIP_OVERSCAN = 2;
		var STRIP_TICKS = WINDOW_TICKS + STRIP_OVERSCAN * 2;
		function focusIndexOf(ticks, activeTurn) {
		  if (ticks.length === 0) return -1;
		  const found = activeTurn === null ? -1 : ticks.findIndex((tick) => tick.turn === activeTurn);
		  return found < 0 ? ticks.length - 1 : found;
		}
		function windowTicks(ticks, activeTurn) {
		  const focus = focusIndexOf(ticks, activeTurn);
		  if (focus < 0) return { strip: [], focusIndex: 0, hasOlder: false, hasNewer: false, empty: true };
		  if (ticks.length <= STRIP_TICKS) {
		    return { strip: [...ticks], focusIndex: focus, hasOlder: false, hasNewer: false, empty: false };
		  }
		  const start = Math.max(0, Math.min(focus - Math.floor(STRIP_TICKS / 2), ticks.length - STRIP_TICKS));
		  const end = start + STRIP_TICKS;
		  return {
		    strip: ticks.slice(start, end),
		    focusIndex: focus - start,
		    hasOlder: start > 0,
		    hasNewer: end < ticks.length,
		    empty: false
		  };
		}
		var TICK_ADVANCE = 20;
		var TICK_HEIGHT = 14;
		var VIEWPORT_HEIGHT = WINDOW_TICKS * TICK_ADVANCE - (TICK_ADVANCE - TICK_HEIGHT);
		function stripShift(focusIndex) {
		  const focusCenter = focusIndex * TICK_ADVANCE + TICK_HEIGHT / 2;
		  return focusCenter - VIEWPORT_HEIGHT / 2;
		}
		var MINUTE_MS = 6e4;
		var HOUR_MS = 36e5;
		var DAY_MS = 864e5;
		var ABSOLUTE_AFTER_DAYS = 30;
		function relativeTime(timeMs, nowMs) {
		  const diff = Math.max(0, nowMs - timeMs);
		  const minutes = Math.floor(diff / MINUTE_MS);
		  if (minutes < 1) return { key: "time.now" };
		  if (minutes < 60) return { key: "time.minutes", params: { n: minutes } };
		  const hours = Math.floor(diff / HOUR_MS);
		  if (hours < 24) return { key: "time.hours", params: { n: hours } };
		  const days = Math.floor(diff / DAY_MS);
		  if (days <= ABSOLUTE_AFTER_DAYS) return { key: "time.days", params: { n: days } };
		  const date = new Date(timeMs);
		  return {
		    key: "time.date",
		    params: { date: `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}` }
		  };
		}

		// src/dock.css.ts
		var TICK_GAP = TICK_ADVANCE - TICK_HEIGHT;
		var css = `
		.dms-rail{position:absolute;top:96px;bottom:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:26px;pointer-events:auto;z-index:1}
		/* Fixed-height window onto the strip: exactly the readable band is tall enough
		   to show, and the soft mask dissolves the overscan ticks into the background
		   instead of cutting them off at a hard edge. */
		.dms-viewport{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:${VIEWPORT_HEIGHT}px;overflow:hidden;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 20%,#000 80%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 20%,#000 80%,transparent 100%)}
		.dms-ruler{display:flex;flex-direction:column;align-items:center;width:100%;margin:0;padding:0;list-style:none;border:none;background:transparent;will-change:transform;transition:transform .34s cubic-bezier(.22,.61,.36,1)}
		@media (prefers-reduced-motion:reduce){.dms-ruler{transition:none}}
		.dms-tickWrap{display:flex;align-items:center;justify-content:center;width:100%;margin:0;padding:0;list-style:none}
		.dms-tick{position:relative;display:flex;align-items:center;justify-content:flex-end;width:100%;height:${TICK_HEIGHT}px;margin:0 0 ${TICK_GAP}px;padding:0;border:none;background:transparent;cursor:pointer}
		.dms-tickWrap:last-child .dms-tick{margin-bottom:0}
		.dms-tick:focus-visible{outline:2px solid var(--dsw-alias-label-tertiary);outline-offset:-2px;border-radius:2px}
		.dms-line{display:block;width:10px;height:2px;border-radius:1px;background:var(--dsw-alias-label-tertiary);opacity:.42;transition:width .2s ease,height .2s ease,opacity .2s ease,background .2s ease,filter .2s ease}
		/* Graduated by distance from the focus tick: the band inside WINDOW_RADIUS stays
		   crisp and readable; the overscan ticks beyond it fade and blur out, so only
		   ~5 milestones ever read as "shown". Distances are capped at
		   WINDOW_RADIUS + STRIP_OVERSCAN; anything further is never rendered. */
		.dms-tick[data-distance="1"] .dms-line{width:15px;opacity:.6;background:var(--dsw-alias-label-secondary)}
		.dms-tick[data-distance="2"] .dms-line{width:20px;opacity:.82;background:var(--dsw-alias-label-secondary)}
		.dms-tick[data-distance="0"] .dms-line{width:26px;height:3px;opacity:1;background:var(--dsw-alias-label-primary)}
		.dms-tick[data-distance="3"] .dms-line{width:8px;opacity:.26;filter:blur(.8px)}
		.dms-tick[data-distance="4"] .dms-line{width:5px;opacity:.12;filter:blur(1.6px)}
		.dms-tick:hover .dms-line{opacity:.95;background:var(--dsw-alias-label-secondary);filter:none}
		.dms-dot{position:absolute;right:-2px;top:50%;width:3px;height:3px;margin-top:-1.5px;border-radius:50%;background:var(--dsw-alias-label-primary);opacity:0;transition:opacity .2s ease}
		.dms-tick[data-distance="0"] .dms-dot{opacity:1}
		.dms-tick[data-running="1"] .dms-line{animation:dms-pulse 1.6s ease-in-out infinite}
		.dms-tick[data-running="1"]:hover .dms-line,.dms-tick[data-running="1"][data-distance="0"] .dms-line{animation:none}
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
		var tagId = "dsh-milestone/milestone-dock.css";
		function injectDockCss() {
		  if (typeof document === "undefined") return;
		  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) !== null) return;
		  const tag = document.createElement("style");
		  tag.dataset.plugin = "dsh-milestone";
		  tag.dataset.pluginCss = tagId;
		  tag.textContent = css;
		  document.head.appendChild(tag);
		}

		// src/client.tsx
		var import_jsx_runtime = require("react/jsx-runtime");
		var NS = "milestones";
		var zh = {
		  "dock.aria": "\u5BF9\u8BDD\u91CC\u7A0B\u7891\u5BFC\u822A",
		  "tick.aria": "\u7B2C {n} \u8F6E",
		  "tip.turn": "\u7B2C {n} \u8F6E",
		  "tip.none": "\uFF08\u65E0\u7528\u6237\u63D0\u95EE\uFF09",
		  "status.running": "\u8FDB\u884C\u4E2D",
		  "reason.completed": "\u5DF2\u5B8C\u6210",
		  "reason.aborted": "\u5DF2\u4E2D\u6B62",
		  "reason.blocked": "\u5DF2\u963B\u585E",
		  "reason.error": "\u51FA\u9519",
		  "reason.max-tokens": "\u8FBE\u5230\u8F93\u51FA\u4E0A\u9650",
		  "reason.interrupted": "\u56E0\u4E2D\u65AD\u7ED3\u675F",
		  "time.now": "\u521A\u521A",
		  "time.minutes": "{n} \u5206\u949F\u524D",
		  "time.hours": "{n} \u5C0F\u65F6\u524D",
		  "time.days": "{n} \u5929\u524D",
		  "time.date": "{date}"
		};
		var en = {
		  "dock.aria": "Conversation milestone navigation",
		  "tick.aria": "Turn {n}",
		  "tip.turn": "Turn {n}",
		  "tip.none": "(no user message)",
		  "status.running": "Running",
		  "reason.completed": "Completed",
		  "reason.aborted": "Aborted",
		  "reason.blocked": "Blocked",
		  "reason.error": "Failed",
		  "reason.max-tokens": "Output cap reached",
		  "reason.interrupted": "Ended by interruption",
		  "time.now": "just now",
		  "time.minutes": "{n} min ago",
		  "time.hours": "{n} h ago",
		  "time.days": "{n} d ago",
		  "time.date": "{date}"
		};
		var ACTIVE_TURN_REFRESH_MS = 150;
		var RAIL_INSET = 12;
		var ANCHOR_SLOT = "conversation.session.header.actions";
		var OVERLAY_HOST_SELECTOR = "[data-shell-overlay]";
		function reasonLabel(t, tick) {
		  if (tick.status === "running") return { label: t("status.running"), kind: "running" };
		  const key = `reason.${tick.endReason ?? ""}`;
		  const label = Object.hasOwn(zh, key) ? t(key) : tick.endReason ?? "";
		  return { label, kind: tick.endReason ?? "" };
		}
		function format(template, params) {
		  if (params === void 0) return template;
		  return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), template);
		}
		function scrollportOf() {
		  return document.querySelector("[data-conversation-scroll]");
		}
		function firstAnchorKeyOf(snapshot, turn) {
		  const keys = snapshot.chat.locations.getTurn(turn);
		  return keys[0];
		}
		var MilestoneRuler = function MilestoneRuler2({
		  useProjection,
		  useSession,
		  t
		}) {
		  const milestones = useProjection("milestones");
		  const ticks = (0, import_react.useMemo)(() => deriveMilestones(milestones), [milestones]);
		  const [activeTurn, setActiveTurn] = (0, import_react.useState)(null);
		  const [hoverTurn, setHoverTurn] = (0, import_react.useState)(null);
		  const [railLeft, setRailLeft] = (0, import_react.useState)(null);
		  const [railOrigin, setRailOrigin] = (0, import_react.useState)(null);
		  const [host, setHost] = (0, import_react.useState)(null);
		  const rafRef = (0, import_react.useRef)(0);
		  const lastRunRef = (0, import_react.useRef)(0);
		  const railRef = (0, import_react.useRef)(null);
		  const anchorKeys = useSession((0, import_react.useCallback)(
		    (snapshot) => {
		      const map = /* @__PURE__ */ new Map();
		      for (const turn of snapshot.chat.timeline.turnOrder) map.set(turn, firstAnchorKeyOf(snapshot, turn));
		      return map;
		    },
		    []
		  ));
		  const measureRailLeft = (0, import_react.useCallback)(() => {
		    const scrollport = scrollportOf();
		    const layer = host;
		    if (scrollport === null || layer === null) return;
		    const layerRect = layer.getBoundingClientRect();
		    const columnLeft = scrollport.getBoundingClientRect().left - layerRect.left;
		    if (!Number.isFinite(columnLeft) || columnLeft <= 0) return;
		    setRailLeft(Math.round(columnLeft + RAIL_INSET));
		    setRailOrigin(Math.round(columnLeft));
		  }, [host]);
		  (0, import_react.useEffect)(() => {
		    const resolve = () => {
		      const layer = document.querySelector(OVERLAY_HOST_SELECTOR);
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
		  const measure = (0, import_react.useCallback)(() => {
		    const scrollport = scrollportOf();
		    if (scrollport === null || anchorKeys.size === 0) return null;
		    const scrollRect = scrollport.getBoundingClientRect();
		    const geometry = [];
		    let lastBottom = 0;
		    for (const [turn, key] of anchorKeys) {
		      if (key === void 0) continue;
		      const anchor = findAnchor(scrollport, key);
		      if (anchor === null) continue;
		      const top = anchor.getBoundingClientRect().top - scrollRect.top + scrollport.scrollTop;
		      geometry.push({ turn, top, bottom: top });
		      lastBottom = top;
		    }
		    for (let i = 0; i < geometry.length; i++) {
		      geometry[i].bottom = i + 1 < geometry.length ? geometry[i + 1].top : lastBottom + scrollport.clientHeight;
		    }
		    return geometry;
		  }, [anchorKeys]);
		  const refreshActive = (0, import_react.useCallback)((force = false) => {
		    if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
		    rafRef.current = requestAnimationFrame(() => {
		      rafRef.current = 0;
		      const now2 = performance.now();
		      measureRailLeft();
		      if (!force && now2 - lastRunRef.current < ACTIVE_TURN_REFRESH_MS) return;
		      lastRunRef.current = now2;
		      const geometry = measure();
		      if (geometry === null) return;
		      const scrollport = scrollportOf();
		      if (scrollport === null) return;
		      setActiveTurn(computeActiveTurn(geometry, scrollport.scrollTop, scrollport.scrollTop + scrollport.clientHeight));
		    });
		  }, [measure, measureRailLeft]);
		  (0, import_react.useEffect)(() => {
		    if (host === null) return;
		    const scrollport = scrollportOf();
		    if (scrollport === null) return;
		    const onScroll = () => refreshActive();
		    scrollport.addEventListener("scroll", onScroll, { passive: true });
		    const observer = new ResizeObserver(() => refreshActive(true));
		    observer.observe(scrollport);
		    const mutation = new MutationObserver(() => refreshActive(true));
		    mutation.observe(scrollport, { childList: true, subtree: true });
		    const frame = scrollport.closest('[style*="grid-template-columns"]');
		    if (frame !== null) {
		      observer.observe(frame);
		      observer.observe(host);
		    }
		    window.addEventListener("resize", onScroll);
		    refreshActive(true);
		    return () => {
		      scrollport.removeEventListener("scroll", onScroll);
		      observer.disconnect();
		      mutation.disconnect();
		      window.removeEventListener("resize", onScroll);
		      if (rafRef.current !== 0) cancelAnimationFrame(rafRef.current);
		    };
		  }, [refreshActive, host]);
		  const jumpTo = (0, import_react.useCallback)((turn) => {
		    const scrollport = scrollportOf();
		    const key = anchorKeys.get(turn);
		    if (scrollport === null || key === void 0) return;
		    const anchor = findAnchor(scrollport, key);
		    anchor?.scrollIntoView({ block: "start", behavior: "smooth" });
		  }, [anchorKeys]);
		  if (host === null || milestones === void 0 || ticks.length === 0) return null;
		  const strip = windowTicks(ticks, activeTurn);
		  const now = Date.now();
		  const shift = stripShift(strip.focusIndex);
		  return (0, import_react_dom.createPortal)(
		    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		      "div",
		      {
		        ref: railRef,
		        className: "dms-rail",
		        role: "navigation",
		        "aria-label": t("dock.aria"),
		        "data-left": railLeft === null ? void 0 : String(railLeft),
		        "data-column-left": railOrigin === null ? void 0 : String(railOrigin),
		        "data-focus": strip.focusIndex,
		        style: railLeft === null ? { visibility: "hidden" } : { left: `${railLeft}px` },
		        children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EdgeCue, { direction: "older", shown: strip.hasOlder }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dms-viewport", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		            "ol",
		            {
		              className: "dms-ruler",
		              role: "list",
		              style: { transform: `translateY(${-shift}px)` },
		              onMouseLeave: () => setHoverTurn(null),
		              children: strip.strip.map((tick, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
		                Tick,
		                {
		                  tick,
		                  distance: Math.abs(index - strip.focusIndex),
		                  active: tick.turn === activeTurn,
		                  hovered: tick.turn === hoverTurn,
		                  onHover: setHoverTurn,
		                  onJump: jumpTo,
		                  t,
		                  now
		                },
		                tick.turn
		              ))
		            }
		          ) }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EdgeCue, { direction: "newer", shown: strip.hasNewer })
		        ]
		      }
		    ),
		    host
		  );
		};
		function EdgeCue({ direction, shown }) {
		  if (!shown) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dms-cueSpacer", "aria-hidden": "true" });
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dms-cue", "data-dir": direction, "aria-hidden": "true", children: direction === "older" ? "\u2303" : "\u2304" });
		}
		function findAnchor(scrollport, key) {
		  for (const row of scrollport.querySelectorAll("[data-chat-anchor-key]")) {
		    if (row.dataset.chatAnchorKey === key) return row;
		  }
		  return null;
		}
		function Tick({ tick, distance, active, hovered, onHover, onJump, t, now }) {
		  const reason = reasonLabel(t, tick);
		  const time = relativeTime(tick.time, now);
		  const summary = tick.summary ?? null;
		  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { className: "dms-tickWrap", "data-distance": distance > WINDOW_RADIUS ? "out" : void 0, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
		    "button",
		    {
		      type: "button",
		      role: "listitem",
		      className: "dms-tick",
		      "data-distance": distance,
		      "data-active": active ? "1" : void 0,
		      "data-running": tick.status === "running" ? "1" : void 0,
		      "aria-label": format(t("tick.aria"), { n: tick.turn }),
		      "aria-current": active ? "true" : void 0,
		      onMouseEnter: () => onHover(tick.turn),
		      onFocus: () => onHover(tick.turn),
		      onBlur: () => onHover(null),
		      onClick: () => onJump(tick.turn),
		      children: [
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dms-line", "aria-hidden": "true" }),
		        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dms-dot", "aria-hidden": "true" }),
		        hovered && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dms-tip", role: "tooltip", children: [
		          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dms-tipHead", children: [
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dms-tipTurn", children: format(t("tip.turn"), { n: tick.turn }) }),
		            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dms-tipTime", children: format(t(time.key), time.params) })
		          ] }),
		          summary !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dms-tipSummary", children: summary }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dms-tipNone", children: t("tip.none") }),
		          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dms-tipStatus", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "data-kind": reason.kind, children: reason.label }) })
		        ] })
		      ]
		    }
		  ) });
		}
		var inject = ["slots", "locale"];
		function apply(ctx) {
		  ctx.slots.inject(ANCHOR_SLOT, () => {
		    injectDockCss();
		    return ctx.slots.register(
		      {
		        name: ANCHOR_SLOT,
		        id: "milestones",
		        // Negative order: a static session-context marker leads the
		        // interactive action row rather than trailing it.
		        order: -10,
		        locale: NS
		      },
		      MilestoneRuler
		    );
		  });
		  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "milestone: dictionaries");
		}

		return module.exports;
	}
});
