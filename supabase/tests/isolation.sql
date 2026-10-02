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
  tourney bigint;
  open_match bigint;
  done_match bigint;
  tourney2 bigint;
  league_code text;
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

  perform public.save_push_subscription('https://push.test.invalid/a', 'key', 'secret');
  select count(*) into n from public.push_subscriptions where user_id = user_a;
  if n <> 1 then raise exception 'FAIL: A cannot save or see own push subscription (%)', n; end if;
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

  select count(*) into n from public.push_subscriptions;
  if n <> 0 then raise exception 'FAIL: B can read A''s push subscriptions'; end if;
  checks := checks + 1;

  delete from public.push_subscriptions;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s push subscription'; end if;
  checks := checks + 1;

  denied := false;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (user_a, 'https://push.test.invalid/b', 'key', 'secret');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: B inserted a push subscription directly'; end if;
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

  denied := false;
  begin
    perform public.save_push_subscription('https://push.test.invalid/anon', 'key', 'secret');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: anon can save a push subscription'; end if;
  checks := checks + 1;

  if public.player_favorite_count(player) <> 1 then raise exception 'FAIL: anon favorite count'; end if;
  checks := checks + 1;
  reset role;

  -- Pick'em: an open and a finished match; A is unnamed, B has a leaderboard name.
  insert into public.tournaments (provider, tour, provider_id, name, start_date, season)
  values ('test', 'atp', -1, 'Isolation Open', current_date, extract(year from current_date)::int) returning id into tourney;
  insert into public.matches (provider, tour, provider_id, tournament_id, status)
  values ('test', 'atp', -1, tourney, 'scheduled') returning id into open_match;
  insert into public.matches (provider, tour, provider_id, tournament_id, status, winner_side, score_changed_at, pre_match_p1)
  values ('test', 'atp', -2, tourney, 'final', 1, now(), 0.7) returning id into done_match;
  insert into public.picks (user_id, match_id, side) values (user_a, done_match, 1), (user_b, done_match, 2);
  update public.profiles set leaderboard_name = 'Bob Iso' where id = user_b;

  denied := false;
  begin
    update public.profiles set leaderboard_name = '<script>' where id = user_a;
  exception when check_violation then denied := true;
  end;
  if not denied then raise exception 'FAIL: leaderboard name format not enforced'; end if;
  checks := checks + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.picks (match_id, side) values (open_match, 2);
  checks := checks + 1;

  denied := false;
  begin
    update public.picks set side = 2 where match_id = done_match;
    get diagnostics n = row_count;
    if n = 0 then denied := true; end if;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: A changed a pick after the result'; end if;
  checks := checks + 1;

  denied := false;
  begin
    insert into public.picks (match_id, side) values (done_match, 1) on conflict do nothing;
    get diagnostics n = row_count;
    if n = 0 then denied := true; end if;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: A picked a finished match'; end if;
  checks := checks + 1;

  select count(*) into n from public.pickem_leaderboard(current_date - 1) where name in ('You', 'Bob Iso');
  if n <> 2 then raise exception 'FAIL: A should see own row and named B (%)', n; end if;
  checks := checks + 1;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.picks where user_id = user_a;
  if n <> 0 then raise exception 'FAIL: B can read A''s picks'; end if;
  checks := checks + 1;

  update public.picks set side = 1 where user_id = user_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B changed A''s pick'; end if;
  checks := checks + 1;
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.pickem_leaderboard(current_date - 1) where name in ('You', 'Bob Iso');
  if n <> 1 then raise exception 'FAIL: anon leaderboard should list only named players (%)', n; end if;
  checks := checks + 1;

  denied := false;
  begin
    select count(*) into n from public.picks;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: anon can query picks'; end if;
  checks := checks + 1;
  reset role;

  -- Bracket Challenge: an open draw (no results, starts in 3 days); the pick'em event is closed.
  insert into public.tournaments (provider, tour, provider_id, name, start_date, season)
  values ('test', 'atp', -2, 'Isolation Cup', current_date + 3, extract(year from current_date)::int) returning id into tourney2;
  insert into public.wiki_draws (tournament_id, status, bracket) values (tourney2, 'found', '{"size": 4, "lines": []}'), (tourney, 'found', '{"size": 4, "lines": []}');

  perform set_config('request.jwt.claims', json_build_object('sub', user_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.bracket_entries (tournament_id, picks) values (tourney2, '[{"w":"a","l":"b"}]');
  checks := checks + 1;

  denied := false;
  begin
    insert into public.bracket_entries (tournament_id, picks) values (tourney, '[]');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: A entered a bracket after results'; end if;
  checks := checks + 1;

  denied := false;
  begin
    update public.bracket_entries set score = 999 where tournament_id = tourney2;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: A set their own bracket score'; end if;
  checks := checks + 1;

  league_code := public.create_league('Isolation League', 'Alice');
  select count(*) into n from public.leagues;
  if n <> 1 then raise exception 'FAIL: A cannot see own league (%)', n; end if;
  checks := checks + 1;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', user_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.bracket_entries;
  if n <> 0 then raise exception 'FAIL: B can read A''s bracket'; end if;
  checks := checks + 1;

  select count(*) into n from public.leagues;
  if n <> 0 then raise exception 'FAIL: B sees a league before joining'; end if;
  checks := checks + 1;

  perform public.join_league(lower(league_code), 'Bob');
  select count(*) into n from public.league_members;
  if n <> 2 then raise exception 'FAIL: B should see both members after joining (%)', n; end if;
  checks := checks + 1;

  delete from public.leagues;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s league'; end if;
  checks := checks + 1;

  delete from public.league_members where nickname = 'Alice';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B removed A from the league'; end if;
  checks := checks + 1;
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  denied := false;
  begin
    perform public.create_league('Anon League', 'Anon');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL: anon created a league'; end if;
  checks := checks + 1;
  reset role;

  -- Sync lock: first caller wins, second is refused while it is held.
  if not public.try_acquire_sync_lock('isolation-test', 60) then raise exception 'FAIL: lock not acquired'; end if;
  if public.try_acquire_sync_lock('isolation-test', 60) then raise exception 'FAIL: lock acquired twice'; end if;
  checks := checks + 1;

  raise exception 'ISOLATION OK (% checks)', checks;
end;
$$;
