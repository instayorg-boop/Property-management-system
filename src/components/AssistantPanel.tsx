import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  Minus as MinusIcon,
  ArrowUp,
  SidebarSimple,
  CornersOut,
  ChatCircle,
  Check as CheckIcon,
  CaretDown,
  Plus as PlusIcon,
} from "@phosphor-icons/react";
import { useAssistant } from "../hooks/useAssistant";
import { useTenants } from "../landlord/TenantsContext";

const ASSISTANT_MASCOT_URL =
  "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Ai%20mascot%20logo.png";

type Layout = "floating" | "sidebar" | "fullscreen";

const LAYOUTS: Layout[] = ["floating", "sidebar", "fullscreen"];
const LAYOUT_LABEL: Record<Layout, string> = { floating: "Floating", sidebar: "Sidebar", fullscreen: "Full screen" };
const LAYOUT_ICON: Record<Layout, typeof ChatCircle> = { floating: ChatCircle, sidebar: SidebarSimple, fullscreen: CornersOut };

/** Portfolio-level prompts by default; when opened from a tenant's own page, lead with a question
 * about that tenant specifically instead. */
function suggestionsFor(tenantName?: string): string[] {
  const base = [
    "Which tenants are overdue?",
    "What's this month's collection rate?",
    "How many rooms are vacant right now?",
    "What are the current statutory rates?",
  ];
  if (!tenantName) return base;
  return [`Why is ${tenantName}'s balance what it is?`, ...base.slice(0, 3)];
}

/** `**bold**` spans within one line — the only inline markdown the model actually uses in
 * practice (tenant names, amounts). Anything else is left as literal text rather than pulling in
 * a full markdown library for one span type. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    )
  );
}

/** Reveals a freshly-arrived assistant reply a few words at a time instead of dumping the whole
 * answer in at once — the edge function returns the full text in one response (no real token
 * stream), so this fakes the smooth "typing in" feel a real stream would have. Only plays for
 * `animate` (a message that just arrived this session); history loaded from `switchConversation`
 * renders in full immediately.
 *
 * Reveal rate scales with length rather than a flat words-per-tick, so a long answer doesn't drag
 * on just because it's long — the whole thing finishes inside `MAX_REVEAL_MS` regardless of word
 * count, with a floor so short replies still feel like they're being "typed" rather than flashed. */
const REVEAL_TICK_MS = 16;
const MAX_REVEAL_MS = 900;

function StreamedAssistantMessage({
  content,
  animate,
  onDone,
  onTick,
}: {
  content: string;
  animate: boolean;
  onDone: () => void;
  onTick?: () => void;
}) {
  const words = useMemo(() => content.split(/(\s+)/), [content]);
  const [count, setCount] = useState(animate ? 0 : words.length);

  useEffect(() => {
    if (!animate) {
      setCount(words.length);
      return;
    }
    setCount(0);
    const ticks = Math.max(1, Math.round(MAX_REVEAL_MS / REVEAL_TICK_MS));
    const perTick = Math.max(2, Math.ceil(words.length / ticks));
    let revealed = 0;
    const id = setInterval(() => {
      revealed += perTick;
      setCount(Math.min(revealed, words.length));
      onTick?.();
      if (revealed >= words.length) clearInterval(id);
    }, REVEAL_TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, animate]);

  useEffect(() => {
    if (animate && count >= words.length) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, words.length]);

  const isRevealing = animate && count < words.length;
  return (
    <AssistantMarkdown
      content={words.slice(0, count).join("")}
      trailingCaret={isRevealing ? <span className="streaming-caret" aria-hidden="true" /> : undefined}
    />
  );
}

/** Renders the assistant's replies — plain paragraphs plus `1. `/`-` list lines, since that's the
 * only structure the model's answers actually use (a numbered rundown of tenants, a few bullet
 * points). Rendering these as real <ol>/<ul>/<strong> instead of literal "**"/"1." text is the
 * whole reason this exists — the model's markdown was showing up unrendered before. */
function AssistantMarkdown({ content, trailingCaret }: { content: string; trailingCaret?: React.ReactNode }) {
  const blocks: React.ReactElement[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushList = () => {
    if (!list) return;
    const items = list.items;
    const ordered = list.ordered;
    const key = `list-${blocks.length}`;
    blocks.push(
      ordered ? (
        <ol key={key} className="list-decimal space-y-1 pl-5">
          {items.map((item, i) => (
            <li key={i}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-1 pl-5">
          {items.map((item, i) => (
            <li key={i}>{renderInline(item, `${key}-${i}`)}</li>
          ))}
        </ul>
      )
    );
    list = null;
  };

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    const numbered = line.match(/^\d+\.\s+(.*)/);
    const bulleted = line.match(/^[-*]\s+(.*)/);
    if (numbered) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
    } else if (bulleted) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bulleted[1]);
    } else {
      flushList();
      blocks.push(<p key={`p-${blocks.length}`}>{renderInline(line, `p-${blocks.length}`)}</p>);
    }
  }
  flushList();

  if (trailingCaret && blocks.length > 0) {
    const lastIndex = blocks.length - 1;
    const last = blocks[lastIndex];
    const lastParagraph =
      last.type === "p" ? (last as React.ReactElement<{ children?: React.ReactNode }, "p">) : null;

    if (lastParagraph) {
      blocks[lastIndex] = (
        <p key={lastParagraph.key ?? `p-${lastIndex}`}>
          {lastParagraph.props.children}
          {trailingCaret}
        </p>
      );
    } else {
      blocks.push(
        <p key="caret-line">
          {trailingCaret}
        </p>
      );
    }
  }
  return <div className="space-y-2">{blocks}</div>;
}

/** "Today" / "Yesterday" / "Previous 7 days" / a month+year — the same coarse grouping most chat
 * history lists use, so the dropdown reads as a few short sections instead of one flat list. */
function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Previous 7 days";
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

const containerClassFor: Record<Layout, string> = {
  fullscreen: "fixed inset-0 z-50 flex flex-col bg-paper",
  sidebar:
    "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-line bg-paper shadow-card sm:max-w-md",
  floating:
    "fixed right-5 bottom-5 z-50 flex h-[min(640px,calc(85vh-2.5rem))] w-[min(450px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-3xl border border-line bg-paper shadow-card",
};

const EASE_STANDARD = [0.22, 1, 0.36, 1] as const;

/** Each layout enters/exits the way its own physical form suggests — a floating card expands from
 * the corner it's anchored to, a sidebar slides in like a drawer, and fullscreen barely moves at
 * all since it's a workspace takeover, not an object landing on the page. Exit reuses the same
 * values as initial, so closing reads as the honest reverse of opening rather than a separate cut. */
const panelVariants: Record<Layout, Variants> = {
  floating: {
    initial: { opacity: 0, scale: 0.96, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96, y: 8 },
  },
  sidebar: {
    initial: { opacity: 0, x: "100%" },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: "100%" },
  },
  fullscreen: {
    initial: { opacity: 0, scale: 0.985 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.985 },
  },
};

const panelTransitionFor: Record<Layout, { duration: number; ease: typeof EASE_STANDARD }> = {
  floating: { duration: 0.2, ease: EASE_STANDARD },
  sidebar: { duration: 0.22, ease: EASE_STANDARD },
  fullscreen: { duration: 0.24, ease: EASE_STANDARD },
};

/** Small, shared entrance for the two popovers (history + layout menu) — the same easing as the
 * panel itself, just faster and smaller, so they read as part of the same interface rather than a
 * plain conditional div. */
const popoverMotionProps = {
  initial: { opacity: 0, scale: 0.98, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -4 },
  transition: { duration: 0.12, ease: EASE_STANDARD },
};

/** Self-mounting Notion-AI-style assistant widget — a floating trigger button when closed, an
 * expandable chat panel (floating bubble / docked sidebar / full screen, switchable) when open.
 * Mount once inside the authenticated dashboard shell (see DashboardLayout.tsx); it never appears
 * on the public tenant payment portal since that has its own separate layout tree entirely.
 *
 * Read-only: this panel only ever displays what the assistant-chat edge function answers. It has
 * no write path of its own — a request to change a record is something the edge function's system
 * prompt is responsible for declining, not something enforced again here. */
export default function AssistantPanel() {
  const location = useLocation();
  const { tenants } = useTenants();

  // Opened from a tenant's own profile page (/tenants/:code) — lead the suggestions with a
  // question about that tenant, and pass their id along as chat context.
  const activeTenant = useMemo(() => {
    const match = location.pathname.match(/^\/tenants\/([^/]+)/);
    if (!match) return undefined;
    return tenants.find((t) => t.portalToken === match[1]);
  }, [location.pathname, tenants]);

  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<Layout>("floating");
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState("");
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user is (close enough to) scrolled to the bottom — drives whether new/streaming
  // content pulls the view down or leaves it alone. Someone who's scrolled up to reread something
  // shouldn't get yanked back down by the assistant still typing.
  const isNearBottomRef = useRef(true);
  const prevTurnsLenRef = useRef(0);

  const { turns, send, isStreaming, isSwitching, error, conversationId, conversations, startNewConversation, switchConversation } =
    useAssistant(activeTenant?.id);

  // Messages already on screen when a thread (re)loads shouldn't replay the reveal animation —
  // only a reply that arrives live during this session should. Re-marked whenever the active
  // conversation changes (a fresh/switched thread's existing turns count as "already shown").
  const revealedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    turns.forEach((t) => revealedIds.current.add(t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!layoutMenuOpen && !historyOpen) return;
    const onClick = (e: MouseEvent) => {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node)) setLayoutMenuOpen(false);
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [layoutMenuOpen, historyOpen]);

  const scrollToBottomIfNear = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el || !isNearBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    // Sending your own message should always bring it into view, even if you'd scrolled up to
    // reread something earlier — but a reply arriving while scrolled away from the bottom should
    // stay quiet rather than dragging the view back down mid-read.
    const last = turns[turns.length - 1];
    if (turns.length > prevTurnsLenRef.current && last?.role === "user") {
      isNearBottomRef.current = true;
    }
    prevTurnsLenRef.current = turns.length;
    scrollToBottomIfNear(true);
  }, [turns, scrollToBottomIfNear]);

  const hasStarted = turns.length > 0;
  const currentConversation = conversations.find((c) => c.id === conversationId);
  const currentTitle = currentConversation?.title || "New chat";

  function handleSend(prompt: string) {
    if (!prompt.trim() || isStreaming) return;
    setInput("");
    void send(prompt);
  }

  const LayoutIcon = LAYOUT_ICON[layout];
  // Fullscreen reads as a document workspace (a breadcrumb, a centered reading column) rather than
  // a chat panel blown up to fill the screen — floating/sidebar keep the compact bubble treatment,
  // which doesn't hold up at full width.
  const isFullscreen = layout === "fullscreen";

  return (
    // No `mode="wait"` here on purpose — the trigger fading/scaling out and the panel expanding in
    // need to overlap so the eye reads "this button became this panel," not "button vanished, then
    // a panel appeared somewhere else." Both are anchored to the same bottom-right corner, so the
    // overlap itself sells the continuity.
    <AnimatePresence>
      {!open ? (
        <motion.button
          key="trigger"
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open assistant"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.18, ease: EASE_STANDARD }}
          className="floating-elevated group fixed right-5 bottom-5 z-40 h-14 w-14 overflow-hidden rounded-full bg-paper"
        >
          <img
            src={ASSISTANT_MASCOT_URL}
            alt=""
            className="h-full w-full scale-100 object-cover transition-transform duration-150 ease-out group-hover:scale-[1.02]"
          />
        </motion.button>
      ) : (
        <motion.div key="panel">
          {/* A backdrop only for the docked layouts — floating is a small anchored bubble, not a
              modal, so clicking elsewhere on the page shouldn't close it. */}
          {layout !== "floating" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-ink/20"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
          )}
          <motion.div
            variants={panelVariants[layout]}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={panelTransitionFor[layout]}
            style={layout === "floating" ? { transformOrigin: "bottom right" } : undefined}
            className={containerClassFor[layout]}
          >
        <div className={isFullscreen ? "flex shrink-0 items-center justify-between px-6 py-4" : "flex shrink-0 items-center justify-between px-4 py-3"}>
          <div ref={historyRef} className="relative min-w-0">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-label="Switch conversation"
              aria-expanded={historyOpen}
              className={
                isFullscreen
                  ? "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-mist"
                  : "flex min-w-0 items-center gap-1.5 rounded-full bg-gray-200 py-1 pr-2.5 pl-1 text-left transition-colors hover:bg-gray-300"
              }
            >
              <span className={isFullscreen ? "h-5 w-5 shrink-0 overflow-hidden rounded-full" : "h-6 w-6 shrink-0 overflow-hidden rounded-full border border-line"}>
                <img src={ASSISTANT_MASCOT_URL} alt="" className="h-full w-full object-cover" />
              </span>
              {isFullscreen && <span className="shrink-0 text-muted">Assistant</span>}
              {isFullscreen && <span className="shrink-0 text-muted">/</span>}
              <span className={isFullscreen ? "max-w-56 truncate font-medium text-ink" : "max-w-40 truncate text-sm font-semibold text-ink"}>
                {currentTitle}
              </span>
              <CaretDown size={12} weight="bold" className="shrink-0 text-muted" />
            </button>
            <AnimatePresence>
            {historyOpen && (
              <motion.div
                {...popoverMotionProps}
                style={{ transformOrigin: "top left" }}
                className="absolute top-full left-0 z-10 mt-1.5 max-h-80 w-64 max-w-[80vw] overflow-y-auto rounded-lg border border-line bg-paper py-2 shadow-card"
              >
                {conversations.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted">No conversations yet.</p>
                ) : (
                  Object.entries(
                    conversations.reduce<Record<string, typeof conversations>>((groups, c) => {
                      const key = dateGroupLabel(c.updatedAt);
                      (groups[key] ??= []).push(c);
                      return groups;
                    }, {})
                  ).map(([group, items]) => (
                    <div key={group} className="mb-1 last:mb-0">
                      <p className="px-3 py-1 text-[11px] font-medium tracking-wide text-muted uppercase">{group}</p>
                      {items.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            void switchConversation(c.id);
                            setHistoryOpen(false);
                          }}
                          className={`block w-full truncate px-3 py-2 text-left text-sm transition-colors hover:bg-mist ${
                            c.id === conversationId ? "font-medium text-ink" : "text-muted"
                          }`}
                        >
                          {c.title || "New chat"}
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </motion.div>
            )}
            </AnimatePresence>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                // Already on a blank new chat — starting "another" one would just create a
                // second empty, untitled conversation with nothing to distinguish it.
                if (hasStarted) void startNewConversation();
              }}
              disabled={!hasStarted}
              aria-label="Start a new chat"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <PlusIcon size={17} weight="regular" />
            </button>
            <div ref={layoutMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setLayoutMenuOpen((v) => !v)}
                aria-label="Change layout"
                aria-expanded={layoutMenuOpen}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
              >
                <LayoutIcon size={17} weight="regular" />
              </button>
              <AnimatePresence>
              {layoutMenuOpen && (
                <motion.div
                  {...popoverMotionProps}
                  style={{ transformOrigin: "top right" }}
                  className="absolute top-full right-0 z-10 mt-1.5 w-36 overflow-hidden rounded-lg border border-line bg-paper py-1 shadow-card"
                >
                  {LAYOUTS.map((l) => {
                    const Icon = LAYOUT_ICON[l];
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => {
                          setLayout(l);
                          setLayoutMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-mist ${
                          layout === l ? "font-medium text-ink" : "text-muted"
                        }`}
                      >
                        <Icon size={14} weight="regular" />
                        <span className="flex-1">{LAYOUT_LABEL[l]}</span>
                        {layout === l && <CheckIcon size={12} weight="bold" />}
                      </button>
                    );
                  })}
                </motion.div>
              )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-mist hover:text-ink"
            >
              <MinusIcon size={17} weight="regular" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={isFullscreen ? "flex-1 overflow-y-auto px-6 pt-10 pb-4" : "flex-1 overflow-y-auto px-4 py-4"}
        >
          {/* Switching conversations crossfades skeleton → content once; it does NOT replay every
              time turns changes (the content pane keeps a stable key), so sending a new message or
              a reply arriving doesn't re-trigger this transition — that's reserved for an actual
              thread switch. History renders immediately; only a freshly-arrived reply gets the
              stronger streamed-reveal treatment inside StreamedAssistantMessage. */}
          <AnimatePresence mode="wait" initial={false}>
            {isSwitching ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="animate-pulse space-y-4"
              >
                <div className="flex justify-end">
                  <div className="h-9 w-2/3 rounded-2xl bg-mist" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3.5 w-5/6 rounded bg-mist" />
                  <div className="h-3.5 w-3/4 rounded bg-mist" />
                  <div className="h-3.5 w-1/2 rounded bg-mist" />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, ease: EASE_STANDARD }}
                className={isFullscreen ? "mx-auto w-full max-w-3xl space-y-4" : "space-y-4"}
              >
                {!hasStarted ? (
                  <>
                    <span className="block h-10 w-10 overflow-hidden rounded-full border border-line">
                      <img src={ASSISTANT_MASCOT_URL} alt="" className="h-full w-full object-cover" />
                    </span>
                    <p className="font-display text-lg font-semibold text-ink">How can I help today?</p>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {suggestionsFor(activeTenant?.name).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSend(s)}
                          className="rounded-full bg-mist px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-line/60"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  turns.map((t) =>
                    t.role === "user" ? (
                      <div key={t.id} className="flex justify-end">
                        <div
                          className={
                            isFullscreen
                              ? "max-w-[85%] rounded-full bg-gray-200 px-4 py-2 text-sm whitespace-pre-wrap text-ink"
                              : "max-w-[85%] rounded-2xl bg-mist px-4 py-2.5 text-sm whitespace-pre-wrap text-ink"
                          }
                        >
                          {t.content}
                        </div>
                      </div>
                    ) : (
                      <div key={t.id} className="text-sm text-ink">
                        <StreamedAssistantMessage
                          content={t.content}
                          animate={!revealedIds.current.has(t.id)}
                          onDone={() => revealedIds.current.add(t.id)}
                          onTick={() => scrollToBottomIfNear(false)}
                        />
                      </div>
                    )
                  )
                )}
                {isStreaming && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-1 py-1"
                  >
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-muted"
                        animate={{ y: [0, -7, 0], scale: [0.85, 1.15, 0.85], opacity: [0.35, 1, 0.35] }}
                        transition={{ duration: 0.7, repeat: Infinity, ease: "easeInOut", delay: i * 0.12 }}
                      />
                    ))}
                  </motion.div>
                )}
                {error && <p className="text-xs text-danger">{error}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={isFullscreen ? "shrink-0 px-6 pb-8" : "shrink-0 p-3"}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className={
              isFullscreen
                ? "mx-auto w-full max-w-3xl rounded-2xl border border-line bg-paper p-3 shadow-card"
                : "rounded-2xl border border-line bg-paper p-3 shadow-card"
            }
          >
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder="Do anything with AI…"
              className="max-h-40 w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                aria-label="Send"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-20"
              >
                <ArrowUp size={15} weight="bold" />
              </button>
            </div>
          </form>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
