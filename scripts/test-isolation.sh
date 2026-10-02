#!/usr/bin/env bash
# Runs supabase/tests/isolation.sql against the local Supabase from `supabase start`.
# The test always raises: 'ISOLATION OK (n checks)' on success, 'FAIL: …' otherwise.
set -uo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
output=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/isolation.sql 2>&1)
echo "$output"
if grep -q "ISOLATION OK" <<<"$output"; then exit 0; else exit 1; fi
