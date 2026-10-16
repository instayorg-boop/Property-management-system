import { supabase } from "./supabaseClient";

// Help & Support content lives in Supabase, not hardcoded here, on purpose: wording, video links
// and screenshots change far more often than the app's code does, so content gets edited straight
// from Supabase Studio (or a future admin tool) with no redeploy needed. See the
// add_help_docs_ia migration for the tables (help_groups / help_articles / help_blocks) and their
// RLS (read-only from the app; writes go through the service role). Search runs server-side via
// the search_help_articles() Postgres function (full-text search across titles, summaries and
// article body text).

export type HelpGroup = {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon: string | null;
  sort_order: number;
};

export type HelpArticleSummary = {
  id: string;
  group_id: string;
  slug: string;
  title: string;
  summary: string;
  sort_order: number;
};

export type HelpBlock = {
  id: string;
  article_id: string;
  heading: string;
  body: string;
  video_url: string | null;
  image_url: string | null;
  sort_order: number;
};

export type HelpArticle = HelpArticleSummary & { blocks: HelpBlock[] };

export type HelpNavGroup = HelpGroup & { articles: HelpArticleSummary[] };

export type HelpSearchResult = {
  article_id: string;
  group_slug: string;
  group_title: string;
  article_slug: string;
  title: string;
  summary: string;
  rank: number;
  snippet: string;
};

/** Every group with its articles, for the landing page's topic grid and the docs sidebar nav. */
export async function listHelpNav(): Promise<HelpNavGroup[]> {
  const [groupsRes, articlesRes] = await Promise.all([
    supabase
      .from("help_groups")
      .select("id, slug, title, description, icon, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("help_articles")
      .select("id, group_id, slug, title, summary, sort_order")
      .order("sort_order", { ascending: true }),
  ]);
  if (groupsRes.error) throw groupsRes.error;
  if (articlesRes.error) throw articlesRes.error;

  const byGroup = new Map<string, HelpArticleSummary[]>();
  for (const a of (articlesRes.data ?? []) as HelpArticleSummary[]) {
    const list = byGroup.get(a.group_id) ?? [];
    list.push(a);
    byGroup.set(a.group_id, list);
  }

  return ((groupsRes.data ?? []) as HelpGroup[]).map((g) => ({
    ...g,
    articles: byGroup.get(g.id) ?? [],
  }));
}

/** One article's full content (with its blocks), plus the group it belongs to, by slug pair. */
export async function getHelpArticle(
  groupSlug: string,
  articleSlug: string
): Promise<{ group: HelpGroup; article: HelpArticle } | null> {
  const { data: group, error: groupError } = await supabase
    .from("help_groups")
    .select("id, slug, title, description, icon, sort_order")
    .eq("slug", groupSlug)
    .maybeSingle();
  if (groupError) throw groupError;
  if (!group) return null;

  const { data: article, error: articleError } = await supabase
    .from("help_articles")
    .select("id, group_id, slug, title, summary, sort_order")
    .eq("group_id", group.id)
    .eq("slug", articleSlug)
    .maybeSingle();
  if (articleError) throw articleError;
  if (!article) return null;

  const { data: blocks, error: blocksError } = await supabase
    .from("help_blocks")
    .select("id, article_id, heading, body, video_url, image_url, sort_order")
    .eq("article_id", article.id)
    .order("sort_order", { ascending: true });
  if (blocksError) throw blocksError;

  return {
    group: group as HelpGroup,
    article: { ...(article as HelpArticleSummary), blocks: (blocks ?? []) as HelpBlock[] },
  };
}

/** Full-text search across every article's title, summary and block content. */
export async function searchHelp(query: string): Promise<HelpSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase.rpc("search_help_articles", { q });
  if (error) throw error;
  return (data ?? []) as HelpSearchResult[];
}
