create table if not exists public.episode_reactions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  source_id uuid references public.video_sources(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  reaction text not null check (reaction in ('heart','shock','laugh','fire')),
  bucket_second integer not null default 0 check (bucket_second >= 0),
  created_at timestamptz not null default now()
);

create index if not exists episode_reactions_episode_created_idx on public.episode_reactions(episode_id, created_at desc);
create index if not exists episode_reactions_user_idx on public.episode_reactions(user_id) where user_id is not null;
create index if not exists episode_reactions_source_idx on public.episode_reactions(source_id) where source_id is not null;

alter table public.episode_reactions enable row level security;
grant insert on public.episode_reactions to anon, authenticated;
grant select on public.episode_reactions to authenticated;

drop policy if exists "episode reactions insert" on public.episode_reactions;
create policy "episode reactions insert"
on public.episode_reactions for insert to anon, authenticated
with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "admin episode reactions read" on public.episode_reactions;
create policy "admin episode reactions read"
on public.episode_reactions for select to authenticated
using (private.is_admin());

create table if not exists public.episode_reports (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  source_id uuid references public.video_sources(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('playback','audio','subtitles','wrong_episode','other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists episode_reports_status_created_idx on public.episode_reports(status, created_at desc);
create index if not exists episode_reports_episode_idx on public.episode_reports(episode_id, created_at desc);
create index if not exists episode_reports_source_idx on public.episode_reports(source_id) where source_id is not null;
create index if not exists episode_reports_user_idx on public.episode_reports(user_id) where user_id is not null;

alter table public.episode_reports enable row level security;
grant insert on public.episode_reports to anon, authenticated;
grant select on public.episode_reports to authenticated;

drop policy if exists "episode reports insert" on public.episode_reports;
create policy "episode reports insert"
on public.episode_reports for insert to anon, authenticated
with check (user_id is null or user_id = (select auth.uid()));

drop policy if exists "admin episode reports read" on public.episode_reports;
create policy "admin episode reports read"
on public.episode_reports for select to authenticated
using (private.is_admin());
