-- Row level security isolation test. Always rolls back: it ends by raising either the first
-- failed check or 'ISOLATION OK (n checks)', so nothing it creates is ever committed.
do $$
declare
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  player bigint;
  n integer;
  checks integer := 0;
  denied boolean;
begin
  -- Setup as the owner (bypasses RLS).
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values
    (user_a, 'authenticated', 'authenticated', user_a || '@test.invalid', '{"full_name":"Alice Test"}'),
    (user_b, 'authenticated', 'authenticated', user_b || '@test.invalid', '{"name":"Bob Test"}');

  insert into public.players (tour, provider_id, full_name)
  values ('atp', -1, 'Novak Đoković') returning id into player;

  select count(*) into n from public.profiles where id in (user_a, user_b) and display_name like '% Test';
  if n <> 2 then raise exception 'FAIL: profiles not auto-created from Google metadata (%)', n; end if;
  checks := checks + 1;

  select count(*) into n from public.players
  where id = player
    and search_name like '%' || public.search_normalize('djokovic') || '%'
    and search_name like '%' || public.search_normalize('ĐOKOVIĆ') || '%';
  if n <> 1 then raise exception 'FAIL: accent-insensitive search_name'; end if;
  checks := checks + 1;

  -- User A adds a favorite.
  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.favorites (player_id) values (player);
  select count(*) into n from public.favorites;
  if n <> 1 then raise exception 'FAIL: A cannot see own favorite (%)', n; end if;
  checks := checks + 1;
  reset role;

  -- User B sees nothing of A's and cannot act as A.
  perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from public.favorites;
  if n <> 0 then raise exception 'FAIL: B can read A''s favorites'; end if;
  checks := checks + 1;

  denied := false;
  begin
    insert into public.favorites (user_id, player_id) values (user_a, player);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: B inserted a favorite for A'; end if;
  checks := checks + 1;

  delete from public.favorites where user_id = user_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s favorite'; end if;
  checks := checks + 1;

  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL: B sees % profiles, expected only own', n; end if;
  checks := checks + 1;

  update public.profiles set display_name = 'hacked' where id = user_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B renamed A''s profile'; end if;
  checks := checks + 1;

  denied := false;
  begin
    update public.players set full_name = 'x' where id = player;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: signed-in user can write tennis data'; end if;
  checks := checks + 1;

  denied := false;
  begin
    update public.matches set score = 'x';
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: signed-in user can write matches'; end if;
  checks := checks + 1;

  if public.player_favorite_count(player) <> 1 then raise exception 'FAIL: favorite count'; end if;
  checks := checks + 1;
  reset role;

  -- Anonymous visitors: can read tennis data, nothing else.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select count(*) into n from public.players where id = player;
  if n <> 1 then raise exception 'FAIL: anon cannot read players'; end if;
  checks := checks + 1;

  denied := false;
  begin
    select count(*) into n from public.favorites;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: anon can query favorites'; end if;
  checks := checks + 1;

  select count(*) into n from public.matches;  -- readable (count irrelevant)
  checks := checks + 1;

  denied := false;
  begin
    select count(*) into n from public.trial_observations;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: anon can read trial measurements'; end if;
  checks := checks + 1;

  denied := false;
  begin
    perform public.try_acquire_sync_lock('test', 60);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: anon can take the sync lock'; end if;
  checks := checks + 1;

  if public.player_favorite_count(player) <> 1 then raise exception 'FAIL: anon favorite count'; end if;
  checks := checks + 1;
  reset role;

  -- Sync lock: first caller wins, second is refused while it is held.
  if not public.try_acquire_sync_lock('isolation-test', 60) then raise exception 'FAIL: lock not acquired'; end if;
  if public.try_acquire_sync_lock('isolation-test', 60) then raise exception 'FAIL: lock acquired twice'; end if;
  checks := checks + 1;

  raise exception 'ISOLATION OK (% checks)', checks;
end;
$$;
