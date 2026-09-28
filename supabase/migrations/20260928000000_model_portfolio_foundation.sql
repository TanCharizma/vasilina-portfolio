-- Vasilina is the first model portfolio. Each owner has one portfolio.
-- Drafts and publications live in separate tables so public reads cannot expose edits.

create table public.model_portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.model_portfolio_drafts (
  portfolio_id uuid primary key references public.model_portfolios (id) on delete cascade,
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.model_portfolio_publications (
  portfolio_id uuid primary key references public.model_portfolios (id) on delete cascade,
  slug text not null unique,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  revision bigint not null,
  published_at timestamptz not null
);

create function public.stamp_model_portfolio_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger stamp_model_portfolio_draft_before_update
before update on public.model_portfolio_drafts
for each row execute function public.stamp_model_portfolio_draft();

alter table public.model_portfolios enable row level security;
alter table public.model_portfolio_drafts enable row level security;
alter table public.model_portfolio_publications enable row level security;

revoke all on public.model_portfolios from public, anon, authenticated;
revoke all on public.model_portfolio_drafts from public, anon, authenticated;
revoke all on public.model_portfolio_publications from public, anon, authenticated;

grant select on public.model_portfolios to authenticated;
grant select, update (content) on public.model_portfolio_drafts to authenticated;
grant select on public.model_portfolio_publications to anon, authenticated;

create policy "Owner reads portfolio"
on public.model_portfolios for select to authenticated
using (owner_id = (select auth.uid()));

create policy "Owner reads draft"
on public.model_portfolio_drafts for select to authenticated
using (
  exists (
    select 1 from public.model_portfolios p
    where p.id = portfolio_id and p.owner_id = (select auth.uid())
  )
);

create policy "Owner edits draft"
on public.model_portfolio_drafts for update to authenticated
using (
  exists (
    select 1 from public.model_portfolios p
    where p.id = portfolio_id and p.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.model_portfolios p
    where p.id = portfolio_id and p.owner_id = (select auth.uid())
  )
);

create policy "Anyone reads published portfolio"
on public.model_portfolio_publications for select to anon, authenticated
using (true);

create function public.publish_model_portfolio(p_portfolio_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_content jsonb;
  v_revision bigint;
  v_published_at timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to publish' using errcode = '42501';
  end if;

  select p.slug, d.content, d.revision
    into v_slug, v_content, v_revision
  from public.model_portfolios p
  join public.model_portfolio_drafts d on d.portfolio_id = p.id
  where p.id = p_portfolio_id and p.owner_id = (select auth.uid())
  for update of d;

  if not found then
    raise exception 'Portfolio draft not found for this owner' using errcode = '42501';
  end if;

  if v_content ->> 'schemaVersion' is distinct from '1' then
    raise exception 'Unsupported portfolio content version' using errcode = '22023';
  end if;

  insert into public.model_portfolio_publications
    (portfolio_id, slug, content, revision, published_at)
  values
    (p_portfolio_id, v_slug, v_content, v_revision, v_published_at)
  on conflict (portfolio_id) do update set
    slug = excluded.slug,
    content = excluded.content,
    revision = excluded.revision,
    published_at = excluded.published_at;

  return v_published_at;
end;
$$;

revoke all on function public.publish_model_portfolio(uuid) from public, anon, authenticated;
grant execute on function public.publish_model_portfolio(uuid) to authenticated;

-- Uploaded images are already selected by the model. They can be previewed before
-- publication, but their object URLs are public if someone knows the URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'model-media', 'model-media', true, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

create policy "Owner uploads model media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'model-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.model_portfolios p
    where p.owner_id = (select auth.uid())
  )
);

create policy "Owner lists model media"
on storage.objects for select to authenticated
using (
  bucket_id = 'model-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
