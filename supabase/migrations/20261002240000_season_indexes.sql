-- With results back to 2015, season queries need indexes (they were sequential scans of every
-- match, and timed out when many pages built at once). Idempotent.
create index if not exists matches_season_final on public.matches (season, tour) where status = 'final' and confirmed;
create index if not exists matches_season_finals_round on public.matches (season) where round in ('Final', 'Finals') and status = 'final' and confirmed;
