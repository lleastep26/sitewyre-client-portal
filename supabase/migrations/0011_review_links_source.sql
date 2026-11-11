-- review_links didn't record which funnel created it, so the Results
-- dashboard (Build Order step 8) can't split "review links clicked" per
-- funnel (review_request vs review_blast) without this. Additive only.

alter table public.review_links
  add column if not exists source text;
