#!/usr/bin/env bash
# GitHub-hosted runner only: fresh local Supabase, reviewed pinned frontend/Edge.
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ ${GITHUB_ACTIONS:-} == true ]]
[[ -d .acceptance-app && -d .acceptance-matching ]]
stack="$(mktemp -d)"
app_pid=
edge_pid=
cleanup() {
 [[ -z "$app_pid" ]] || kill "$app_pid" 2>/dev/null || true
 [[ -z "$edge_pid" ]] || kill "$edge_pid" 2>/dev/null || true
 supabase stop --workdir "$stack" --no-backup >/dev/null 2>&1 || true
 rm -f /tmp/careerdev-synthetic-browser.json
}
trap cleanup EXIT
supabase init --workdir "$stack"
sed -i 's/^project_id = .*/project_id = "careerdev-baseline-ci"/' "$stack/supabase/config.toml"
supabase start --workdir "$stack" -x studio,imgproxy,realtime,mailpit,postgres-meta,edge-runtime,logflare,vector,supavisor >"$stack/start.log" 2>&1 || { tail -n 30 "$stack/start.log"; exit 1; }
supabase status --workdir "$stack" -o env >"$stack/local.env"
set -a
source "$stack/local.env"
set +a
[[ "$API_URL" == http://127.0.0.1:54321 ]]
[[ $(docker exec supabase_db_careerdev-baseline-ci psql -U postgres -d postgres -Atc "select count(*) from pg_tables where schemaname='public'") == 0 ]]
[[ $(docker exec supabase_db_careerdev-baseline-ci psql -U postgres -d postgres -Atc "select rolsuper from pg_roles where rolname='supabase_admin'") == t ]]
docker exec -i supabase_db_careerdev-baseline-ci psql -Xq -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/baseline/current-state-2026-11-16.sql
CAREERDEV_MANAGED_CI=synthetic-local-only CAREERDEV_BROWSER_FIXTURE=synthetic-local-only python tests/database/managed-supabase.py

mkdir -p "$stack/supabase/functions/careerdev-coach-matching" "$stack/supabase/functions/_shared"
cp .acceptance-matching/supabase/functions/careerdev-coach-matching/index.ts "$stack/supabase/functions/careerdev-coach-matching/"
cp .acceptance-matching/supabase/functions/_shared/{edge-security,embedding-vector}.ts "$stack/supabase/functions/_shared/"
# Local fixture only. Do not change production quota configuration.
cat > "$stack/local-functions.env" <<'ENV'
DISTRIBUTED_RATE_LIMIT_ENABLED=false
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ENV
supabase functions serve careerdev-coach-matching --workdir "$stack" --env-file "$stack/local-functions.env" >"$stack/edge.log" 2>&1 &
edge_pid=$!
matching_status=0
CAREERDEV_MANAGED_CI=synthetic-local-only python tests/database/matching-runtime.py || { tail -n 35 "$stack/edge.log"; matching_status=1; }

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_URL=http://127.0.0.1:54321
export NEXT_TELEMETRY_DISABLED=1
(
 cd .acceptance-app
 npm ci --ignore-scripts --no-audit --no-fund
 npm run build
) >"$stack/app-build.log" 2>&1 || { tail -n 35 "$stack/app-build.log"; exit 1; }
(cd .acceptance-app && npm run start -- --hostname 127.0.0.1 --port 3000) >"$stack/app.log" 2>&1 &
app_pid=$!
for attempt in $(seq 1 30); do
 if curl -fsS http://127.0.0.1:3000/client/login >/dev/null; then break; fi
 sleep 1
done
curl -fsS http://127.0.0.1:3000/client/login >/dev/null
browser_tools="$(mktemp -d)"
npm install --prefix "$browser_tools" --ignore-scripts --no-audit --no-fund playwright@1.65.1 >"$stack/browser-install.log" 2>&1
node "$browser_tools/node_modules/playwright/cli.js" install --with-deps chromium >>"$stack/browser-install.log" 2>&1
cp tests/database/browser-acceptance.mjs "$browser_tools/browser-acceptance.mjs"
CAREERDEV_BROWSER_FIXTURE=synthetic-local-only node "$browser_tools/browser-acceptance.mjs" || { tail -n 30 "$stack/app.log"; exit 1; }

exit "$matching_status"
