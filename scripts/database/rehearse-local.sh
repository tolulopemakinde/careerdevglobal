#!/usr/bin/env bash
set -euo pipefail
# Dedicated local Docker container only. No URL argument and no hosted credentials accepted.
cd "$(dirname "$0")/../.."
container=careerdev-phase1-db
[[ $(docker inspect --format '{{index .Config.Labels "careerdev.acceptance"}}' "$container") == phase1-disposable ]]
[[ $(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container") == none ]]
sql() { docker exec -i "$container" psql -Xq -U postgres -d careerdev_acceptance -v ON_ERROR_STOP=1 "$@"; }
[[ $(sql -Atc "select current_setting('server_version_num')::int/10000") == 17 ]]
[[ $(sql -Atc "select count(*) from pg_tables where schemaname='public'") == 0 ]]
if [[ $(sql -Atc "select to_regclass('auth.users') is null") == t ]]; then
  python scripts/database/local-adapter.py | sql
fi
[[ $(sql -Atc 'select count(*) from auth.users') == 0 ]]
sql < supabase/baseline/current-state-2026-11-16.sql
sql -At < supabase/diagnostics/current_schema_snapshot.sql
