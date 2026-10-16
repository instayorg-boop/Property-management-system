import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChatCircleDots,
  MagnifyingGlass,
  WhatsappLogo,
  EnvelopeSimple,
  ArrowSquareOut,
} from "@phosphor-icons/react";
import SectionLabel from "../components/SectionLabel";
import HelpTopBar from "../components/HelpTopBar";
import { Skeleton, SkeletonText } from "../components/Skeleton";
import { listHelpNav, searchHelp, type HelpNavGroup, type HelpSearchResult } from "../../lib/help";
import { resolveHelpIcon } from "../helpIcons";
import { SUPPORT_WHATSAPP_URL, SUPPORT_EMAIL } from "../../lib/supportContact";

/** Renders a search snippet's "<b>...</b>" match-highlighting (from Postgres' ts_headline) as
 * real bold text -- split on the tags and render each piece as plain text, never as raw HTML, so
 * there's no injection risk even though this is server-controlled content. */
function HighlightedSnippet({ text }: { text: string }) {
  const parts = text.split(/(<b>.*?<\/b>)/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^<b>(.*)<\/b>$/);
        return match ? (
          <strong key={i} className="font-semibold text-ink">
            {match[1]}
          </strong>
        ) : (
          part
        );
      })}
    </>
  );
}

/** Loading placeholder for a topic card, shaped like the real card (icon circle, title line,
 * description line) rather than a generic spinner. */
function TopicCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-lg border border-line bg-paper p-5" aria-hidden="true">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <Skeleton className="mt-3 h-3.5 w-24" />
      <SkeletonText width="85%" className="mt-2" />
    </div>
  );
}

/** Landing page for Help & Support: a centered hero with live search, a grid of topic groups
 * (same card treatment as the Settings page, on purpose, so the two pages feel like one product),
 * and a "still need help" row with real contact options. Each topic card is a plain link into the
 * docs layout (HelpDocs.tsx), it never reveals what's inside, the whole point of clicking in is
 * finding out. */
export default function HelpSupport() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<HelpNavGroup[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HelpSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const contactRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    listHelpNav()
      .then((data) => {
        if (!cancelled) setGroups(data);
      })
      .catch((e) => {
        console.error("Failed to load help topics", e);
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchHelp(q)
        .then((data) => {
          setResults(data);
          setActiveIndex(-1);
        })
        .catch((e) => console.error("Help search failed", e))
        .finally(() => setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function goToArticle(groupSlug: string, articleSlug: string) {
    setShowResults(false);
    setQuery("");
    navigate(`/help/${groupSlug}/${articleSlug}`);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showResults || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => {
        const next = i < results.length - 1 ? i + 1 : 0;
        resultRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => {
        const next = i > 0 ? i - 1 : results.length - 1;
        resultRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const r = results[activeIndex];
      goToArticle(r.group_slug, r.article_slug);
    } else if (e.key === "Escape") {
      setShowResults(false);
    }
  }

  return (
    <div  className=" bg-white">
    <div className="max-w-5xl mx-auto ">
      <HelpTopBar />
      

      <div className="px-4 py-10 sm:px-8">
        {/* Hero */}
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand">Help &amp; Support</p>
          <h1 className="font-display text-[32px] font-bold leading-tight tracking-[-0.01em] text-ink sm:text-[36px]">
            Hi, how can we help?
          </h1>
          <p className="max-w-md text-sm leading-6 text-muted">
            Learn how to use Instay Manage, or get in touch with our team.
          </p>

          <div ref={searchBoxRef} className="relative mt-2 w-full max-w-md">
            <div className="flex items-center gap-2.5 rounded-lg border border-line bg-paper px-4 py-3">
              <MagnifyingGlass size={18} weight="bold" className="shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search for help..."
                aria-label="Search for help"
                role="combobox"
                aria-expanded={showResults && query.trim().length >= 2}
                aria-controls="help-search-results"
                aria-activedescendant={activeIndex >= 0 ? `help-search-result-${activeIndex}` : undefined}
                autoComplete="off"
                className="w-full border-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
            </div>

            {showResults && query.trim().length >= 2 && (
              <div
                id="help-search-results"
                role="listbox"
                className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 max-h-96 overflow-y-auto rounded-lg border border-line bg-white text-left shadow-xl"
              >
                {searching && <p className="px-4 py-3 text-xs text-muted">Searching...</p>}
                {!searching && results.length === 0 && (
                  <p className="px-4 py-3 text-xs text-muted">
                    No results for "{query.trim()}". Try a different word, or browse by topic below.
                  </p>
                )}
                {!searching &&
                  results.map((r, i) => (
                    <button
                      key={r.article_id}
                      id={`help-search-result-${i}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      ref={(el) => {
                        resultRefs.current[i] = el;
                      }}
                      type="button"
                      onClick={() => goToArticle(r.group_slug, r.article_slug)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`block w-full border-b border-line/70 px-4 py-3 text-left last:border-b-0 ${
                        i === activeIndex ? "bg-mist/60" : "hover:bg-mist/40"
                      }`}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-brand">{r.group_title}</p>
                      <p className="mt-0.5 text-sm font-semibold text-ink">{r.title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted">
                        <HighlightedSnippet text={r.snippet} />
                      </p>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Topic grid */}
        <section className="mt-6 " >
          <SectionLabel>Browse by topic</SectionLabel>
          {loadError && (
            <p className="mt-3 text-sm text-muted">Couldn't load help topics right now, please try again shortly.</p>
          )}
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups === null
              ? Array.from({ length: 6 }).map((_, i) => <TopicCardSkeleton key={i} />)
              : groups.map((g) => {
                  const GroupIcon = resolveHelpIcon(g.icon);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => navigate(`/help/${g.slug}`)}
                      className="group flex h-full flex-col rounded-lg border border-line bg-paper p-5 text-left transition-colors hover:border-ink/20 hover:bg-mist/30"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                        <GroupIcon size={20} weight="duotone" />
                      </span>
                      <p className="mt-3 text-sm font-semibold text-ink">{g.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted">{g.description}</p>
                      <span className="mt-auto flex items-center justify-end gap-2 pt-3">
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                          Open
                          <ArrowRight size={12} weight="bold" />
                        </span>
                      </span>
                    </button>
                  );
                })}
          </div>
        </section>

        {/* Contact */}
        <section ref={contactRef} className="mt-8 scroll-mt-24">
          <SectionLabel>Still need help?</SectionLabel>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-3.5 rounded-lg border border-brand bg-brand p-5 text-white transition-colors hover:bg-brand/95"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <WhatsappLogo size={20} weight="fill" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  Chat on WhatsApp
                  <ArrowSquareOut size={13} className="opacity-70" />
                </span>
                <span className="mt-0.5 block text-xs text-white/80">Usually replies within a few hours.</span>
              </span>
            </a>

            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="group flex items-center gap-3.5 rounded-lg border border-line bg-paper p-5 transition-colors hover:border-ink/20 hover:bg-mist/30"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <EnvelopeSimple size={20} weight="duotone" />
              </span>
              <span className="min-w-0">
                <span className="text-sm font-semibold text-ink">Email support</span>
                <span className="mt-0.5 block text-xs text-muted">For detailed questions or issues.</span>
              </span>
            </a>
          </div>
        </section>
      </div>

      {/* Floating shortcut to the contact row -- it's the last thing on the page, below a full
          grid of topic cards, so without this it's easy to never notice it's there. */}
      <button
        type="button"
        onClick={() => contactRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="fixed bottom-6 right-6 z-10 flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-brand/95"
      >
        <ChatCircleDots size={18} weight="fill" />
        Contact us
      </button>
    </div>
    </div>
  );
}
