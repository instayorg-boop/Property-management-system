-- search_help_articles' snippet was built straight from help_blocks.body, which is markdown
-- (tables, **bold**, :::callout::: fences) since the rich-formatting migrations -- so every
-- snippet leaked raw "**", "|", ":::note" syntax into the search dropdown, on top of
-- ts_headline's literal "<b>...</b>" tags never being rendered as bold by the frontend. Both
-- made search look broken even though it was actually matching and ranking correctly.
--
-- Fix here: strip markdown syntax out of the body before it ever reaches ts_headline, so the
-- snippet reads as plain prose. The <b> highlighting itself is now handled safely client-side
-- (see HelpSupport.tsx) instead of ever being dangerouslySetInnerHTML'd.

create or replace function public.search_help_articles(q text)
returns table(article_id uuid, group_slug text, group_title text, article_slug text, title text, summary text, rank real, snippet text)
language sql
stable security definer
set search_path to 'public'
as $function$
  with cleaned_blocks as (
    select
      b.id,
      b.article_id,
      b.heading,
      -- Strip callout fences, bold/italic markers, table pipes and separator rows, and collapse
      -- whitespace, so what's left reads as plain sentences for ts_headline to excerpt from.
      trim(regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(b.body, ':::(note|tip|warning)', '', 'g'),
              ':::', '', 'g'
            ),
            '\*\*?', '', 'g'
          ),
          '[|]|-{3,}', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )) as clean_body
    from public.help_blocks b
  )
  select
    a.id,
    g.slug,
    g.title,
    a.slug,
    a.title,
    a.summary,
    ts_rank(a.search_vector, websearch_to_tsquery('english', q))
      + coalesce(max(ts_rank(to_tsvector('english', b.heading || ' ' || b.clean_body), websearch_to_tsquery('english', q))), 0) as rank,
    coalesce(
      (select ts_headline('english', b2.clean_body, websearch_to_tsquery('english', q), 'MaxFragments=1, MaxWords=24, MinWords=8')
       from cleaned_blocks b2
       where b2.article_id = a.id
         and to_tsvector('english', b2.clean_body) @@ websearch_to_tsquery('english', q)
       limit 1),
      a.summary
    ) as snippet
  from public.help_articles a
  join public.help_groups g on g.id = a.group_id
  left join cleaned_blocks b on b.article_id = a.id
  where
    a.search_vector @@ websearch_to_tsquery('english', q)
    or exists (
      select 1 from cleaned_blocks b3
      where b3.article_id = a.id
        and to_tsvector('english', b3.heading || ' ' || b3.clean_body) @@ websearch_to_tsquery('english', q)
    )
  group by a.id, g.slug, g.title, a.slug, a.title, a.summary
  order by rank desc
  limit 20;
$function$;

grant execute on function public.search_help_articles(text) to anon, authenticated;
