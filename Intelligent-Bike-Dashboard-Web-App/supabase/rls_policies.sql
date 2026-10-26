-- RLS policies, run in the Supabase SQL editor. The anon key is public so these are required.

-- web_routes: users can only access their own rides
alter table public.web_routes enable row level security;

create policy "Users can read their own rides"
  on public.web_routes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own rides"
  on public.web_routes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own rides"
  on public.web_routes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own rides"
  on public.web_routes for delete
  to authenticated
  using (auth.uid() = user_id);

-- routes: read-only for signed-in users
alter table public.routes enable row level security;

create policy "Signed-in users can read routes"
  on public.routes for select
  to authenticated
  using (true);
