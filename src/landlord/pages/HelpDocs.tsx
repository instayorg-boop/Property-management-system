import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CaretDown,
  ListBullets,
  Image as ImageIcon,
  PlayCircle,
  WhatsappLogo,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import { getHelpArticle, listHelpNav, type HelpArticle, type HelpNavGroup } from "../../lib/help";
import { resolveHelpIcon } from "../helpIcons";
import { SUPPORT_WHATSAPP_URL, SUPPORT_EMAIL } from "../../lib/supportContact";
import HelpTopBar from "../components/HelpTopBar";
import HelpBody from "../components/HelpBody";
import { Skeleton, SkeletonText } from "../components/Skeleton";

/** Loading placeholder for the left nav -- a handful of group-shaped bars -- while `listHelpNav`
 * is still in flight. */
function NavSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-3 w-28" />
          <div className="mt-2 space-y-1.5">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder for the article itself -- a title block plus a few paragraph-shaped bars
 * and a media-sized box, shaped like `Block` below rather than a bare "Loading..." line. */
function ArticleSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-2 h-7 w-2/3" />
      <div className="mt-4 space-y-2">
        <SkeletonText width="100%" />
        <SkeletonText width="95%" />
        <SkeletonText width="80%" />
      </div>
      <Skeleton className="mt-5 h-44 w-full rounded-lg" />
    </div>
  );
}

function MediaPlaceholder({ kind }: { kind: "video" | "image" }) {
  const Icon = kind === "video" ? PlayCircle : ImageIcon;
  return (
    <div className="mt-4 flex h-44 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-mist/60 text-muted">
      <Icon size={22} />
      <p className="text-xs">{kind === "video" ? "Video goes here" : "Screenshot goes here"}</p>
    </div>
  );
}

function Block({
  block,
  registerRef,
}: {
  block: HelpArticle["blocks"][number];
  registerRef: (id: string, el: HTMLElement | null) => void;
}) {
  return (
    <section
      id={block.id}
      ref={(el) => registerRef(block.id, el)}
      className="scroll-mt-24 border-b border-line/70 py-7 first:pt-0 last:border-b-0"
    >
      <h2 className="font-display text-lg font-bold tracking-tight text-ink">{block.heading}</h2>
      <HelpBody text={block.body} />
      {block.video_url ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-line">
          <video src={block.video_url} controls className="w-full" />
        </div>
      ) : (
        <MediaPlaceholder kind="video" />
      )}
      {block.image_url ? (
        <img src={block.image_url} alt="" className="mt-4 w-full rounded-lg border border-line" />
      ) : null}
    </section>
  );
}

/** The docs-style reading view: a left sidebar listing every topic group and its guides (the
 * product's real navigation, so there's no forced 5-bucket split, a topic with 7 guides just has
 * 7 guides), the article itself in the middle, and a sticky "On this page" nav on the right that
 * tracks which section is in view as you scroll, the same scroll-spy behavior as the DishInk
 * reference. Support contact stays one click away from every single page, not just the landing
 * page, via the card pinned under the sidebar nav. */
export default function HelpDocs() {
  const { group: groupSlug, article: articleSlug } = useParams<{ group: string; article?: string }>();
  const navigate = useNavigate();

  const [nav, setNav] = useState<HelpNavGroup[] | null>(null);
  const [loaded, setLoaded] = useState<{ group: HelpNavGroup; article: HelpArticle } | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const blockRefs = useRef(new Map<string, HTMLElement>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Which single group is expanded in the left nav -- every group starts closed (no default),
  // opening one closes whatever else was open, and the person is free to open/close/switch
  // groups however they like from there.
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listHelpNav()
      .then((data) => {
        if (!cancelled) setNav(data);
      })
      .catch((e) => console.error("Failed to load help navigation", e));
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleGroup(slug: string) {
    setOpenGroup((prev) => (prev === slug ? null : slug));
  }

  // No article in the URL yet (landed on /help/:group straight from the topic grid), once the
  // nav is in, send them to that group's first guide rather than showing an empty page.
  useEffect(() => {
    if (!nav || articleSlug || !groupSlug) return;
    const g = nav.find((n) => n.slug === groupSlug);
    if (g && g.articles[0]) {
      navigate(`/help/${groupSlug}/${g.articles[0].slug}`, { replace: true });
    } else if (g) {
      setNotFound(true);
    }
  }, [nav, groupSlug, articleSlug, navigate]);

  useEffect(() => {
    if (!groupSlug || !articleSlug) return;
    let cancelled = false;
    setLoaded(null);
    setNotFound(false);
    getHelpArticle(groupSlug, articleSlug)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setNotFound(true);
          return;
        }
        const navGroup = nav?.find((n) => n.slug === groupSlug) ?? {
          ...result.group,
          articles: [],
        };
        setLoaded({ group: navGroup, article: result.article });
      })
      .catch((e) => {
        console.error("Failed to load help article", e);
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [groupSlug, articleSlug, nav]);

  useEffect(() => {
    observerRef.current?.disconnect();
    const blocks = loaded?.article.blocks ?? [];
    if (blocks.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
    );
    blockRefs.current.forEach((el) => observer.observe(el));
    observerRef.current = observer;
    return () => observer.disconnect();
  }, [loaded]);

  function registerBlockRef(id: string, el: HTMLElement | null) {
    if (el) blockRefs.current.set(id, el);
    else blockRefs.current.delete(id);
  }

  const currentGroupSlug = groupSlug ?? "";
  const currentArticleSlug = articleSlug ?? "";

  const mobileArticleOptions = useMemo(() => {
    const g = nav?.find((n) => n.slug === currentGroupSlug);
    return g?.articles ?? [];
  }, [nav, currentGroupSlug]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-white">
        <HelpTopBar />
        <div className="px-4 py-10 text-center sm:px-8">
          <p className="text-sm text-muted">That help topic doesn't exist anymore.</p>
          <button
            type="button"
            onClick={() => navigate("/help")}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand"
          >
            <ArrowLeft size={14} weight="bold" /> Back to Help &amp; Support
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <HelpTopBar />
      <div className="flex gap-8 px-4 pb-16 pt-5 sm:px-8">
      {/* Left: topic nav, the product's own groups, every guide listed, nothing forced into one
          bucket. The right border is what actually separates it from the article, not just a
          flex gap -- a plain gap read as the sidebar floating unattached from the content. */}
      <aside className="hidden w-72 shrink-0 border-r border-line pr-6 md:block">
        <div className="sticky top-20">
          <button
            type="button"
            onClick={() => navigate("/help")}
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={13} weight="bold" /> Help &amp; Support
          </button>

          <nav className="max-h-[calc(100vh-10rem)] space-y-1 overflow-y-auto pr-1">
            {nav === null ? (
              <NavSkeleton />
            ) : (
              nav.map((g) => {
                const GroupIcon = resolveHelpIcon(g.icon);
                const isCurrentGroup = g.slug === currentGroupSlug;
                const isOpen = openGroup === g.slug;
                return (
                  <div key={g.id}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.slug)}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left"
                    >
                      <GroupIcon size={14} weight="bold" className={isCurrentGroup ? "text-brand" : "text-muted"} />
                      <p
                        className={`flex-1 whitespace-nowrap text-xs font-bold uppercase tracking-wide ${
                          isCurrentGroup ? "text-brand" : "text-muted"
                        }`}
                      >
                        {g.title}
                      </p>
                      <CaretDown
                        size={12}
                        weight="bold"
                        className={`shrink-0 text-muted transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.ul
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeInOut" }}
                          className="mt-0.5 space-y-0.5 overflow-hidden pb-3"
                        >
                          {g.articles.map((a) => {
                            const isActive = isCurrentGroup && a.slug === currentArticleSlug;
                            return (
                              <li key={a.id}>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/help/${g.slug}/${a.slug}`)}
                                  className={`block w-full rounded-md px-2 py-1.5 text-left text-[13px] leading-5 transition-colors ${
                                    isActive ? "bg-brand-soft font-medium text-brand" : "text-ink/80 hover:bg-mist"
                                  }`}
                                >
                                  {a.title}
                                </button>
                              </li>
                            );
                          })}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </nav>
        </div>
      </aside>

      {/* Center: the article itself */}
      <main className="min-w-0 max-w-2xl flex-1">
        {/* Mobile-only topic switcher, since the sidebar is hidden below md */}
        <div className="mb-4 flex items-center gap-2 md:hidden">
          <button type="button" onClick={() => navigate("/help")} className="inline-flex items-center gap-1 text-xs font-medium text-muted">
            <ArrowLeft size={13} weight="bold" />
          </button>
          {mobileArticleOptions.length > 0 && (
            <select
              value={currentArticleSlug}
              onChange={(e) => navigate(`/help/${currentGroupSlug}/${e.target.value}`)}
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ink"
            >
              {mobileArticleOptions.map((a) => (
                <option key={a.id} value={a.slug}>
                  {a.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {!loaded ? (
          <ArticleSkeleton />
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-brand">{loaded.group.title}</p>
            <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-ink">{loaded.article.title}</h1>
            {loaded.article.summary && <p className="mt-2 text-sm leading-6 text-muted">{loaded.article.summary}</p>}

            <div className="mt-2">
              {loaded.article.blocks.map((block) => (
                <Block key={block.id} block={block} registerRef={registerBlockRef} />
              ))}
              {loaded.article.blocks.length === 0 && (
                <p className="py-8 text-sm text-muted">This guide doesn't have any content yet.</p>
              )}
            </div>
          </>
        )}
      </main>

      {/* Right: on-this-page scroll-spy nav, plus the contact card -- always rendered, even for a
          single-block article with no "On this page" list, so the contact details are in the
          same column on every article page rather than only appearing when there happens to be
          enough content above it. */}
      {loaded && (
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 space-y-6">
            {loaded.article.blocks.length > 1 && (
              <div>
                <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <ListBullets size={14} weight="bold" /> On this page
                </div>
                <ul className="space-y-1 border-l border-line">
                  {loaded.article.blocks.map((block) => {
                    const isActive = activeId === block.id;
                    return (
                      <li key={block.id}>
                        <button
                          type="button"
                          onClick={() =>
                            blockRefs.current.get(block.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                          }
                          className={`-ml-px block border-l-2 py-1 pl-3 text-left text-[13px] leading-5 transition-colors ${
                            isActive ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink"
                          }`}
                        >
                          {block.heading}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="space-y-2 border-t border-line pt-4">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Still stuck?</p>
              <a
                href={SUPPORT_WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-ink hover:bg-mist"
              >
                <WhatsappLogo size={15} weight="bold" className="text-brand" /> Chat on WhatsApp
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-ink hover:bg-mist"
              >
                <EnvelopeSimple size={15} weight="bold" className="text-brand" /> Email support
              </a>
            </div>
          </div>
        </aside>
      )}
      </div>
    </div>
  );
}
